/**
 * ROS连接管理模块
 * 负责与ROS的WebSocket连接、话题订阅、发布等功能
 */

import type { ConnectionConfig, RosMessage, TopicSubscription, RosTopic } from '@/types/ros'

// 使用动态导入避免构建时的类型问题
let ROSLIB: any = null

type SubscriberEntry = {
  listener: any
  config: TopicSubscription
  callbacks: Map<string, (message: RosMessage) => void>
}

async function loadRoslib(retries = 3): Promise<any> {
  if (ROSLIB) {
    return ROSLIB
  }

  for (let i = 0; i < retries; i++) {
    try {
      // @ts-expect-error ROSLIB 1.x does not ship TypeScript declarations.
      const module = await import('roslib')
      // 处理 ES Module 和 CommonJS 的兼容性
      // 优先使用 default 导出，如果它包含 Ros 类
      let lib = module.default || module

      // 再次检查，确保我们拿到了正确的对象
      if (!lib.Ros && module.Ros) {
        lib = module
      }

      // 如果还是没有，尝试从全局对象获取 (作为最后的备选)
      if (!lib.Ros && (window as any).ROSLIB) {
        lib = (window as any).ROSLIB
      }

      ROSLIB = lib
      return ROSLIB
    } catch (error) {
      const isLastAttempt = i === retries - 1
      if (isLastAttempt) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('ERR_CONNECTION_TIMED_OUT') || errorMessage.includes('ERR_NETWORK')) {
          throw new Error('无法加载 roslib 模块：网络连接失败，请检查网络连接或刷新页面重试')
        }
        throw new Error(`无法加载 roslib 模块：${errorMessage}`)
      }
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
  throw new Error('无法加载 roslib 模块：重试次数已用完')
}

class RosConnection {
  private ros: any = null
  private subscribers = new Map<string, SubscriberEntry>()
  private debugSubscribers = new Set<SubscriberEntry>()
  private publishers = new Map<string, any>()
  private pendingRequests = new Set<() => void>()
  private connectionCallbacks: ((connected: boolean) => void)[] = []
  private disconnectCallbacks: (() => void)[] = []
  private config: ConnectionConfig | null = null
  private generation = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private reconnecting = false
  private cancelAttempt: (() => void) | null = null
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  private cancelProbe: (() => void) | null = null
  private heartbeatFailCount = 0
  private heartbeatPaused = false
  private lastReceivedAt: number | null = null
  private readonly HEARTBEAT_INTERVAL = 15000
  private readonly HEARTBEAT_TIMEOUT = 10000
  private readonly MAX_HEARTBEAT_FAILURES = 3

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.checkNow()
      })
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.checkNow())
    }
  }

  /** Explicit connect starts a new session; stale timers and async loads cannot own it. */
  async connect(config: ConnectionConfig): Promise<void> {
    this.disconnect()
    const generation = this.generation
    this.config = { ...config }
    const lib = await loadRoslib()
    if (generation !== this.generation) throw new Error('连接已取消')
    await this.openConnection(lib, generation)
  }

  private openConnection(lib: any, generation: number): Promise<void> {
    const Ros = lib.Ros || lib.default?.Ros
    if (!Ros) return Promise.reject(new Error('无法加载 Ros 类'))
    const ros = new Ros()
    this.ros = ros
    let established = false
    let ended = false
    const current = () => generation === this.generation && this.ros === ros

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => fail(new Error('连接超时：无法在15秒内连接到服务器')), 15000)
      const onMessage = () => { if (current()) this.lastReceivedAt = Date.now() }
      const cleanup = () => {
        clearTimeout(timeout)
        ros.socket?.removeEventListener('message', onMessage)
        ros.removeAllListeners()
        // ROSLIB emits error even for callbacks already queued by the old socket.
        ros.on('error', () => {})
        if (ros.socket) {
          ros.socket.onopen = null
          ros.socket.onclose = null
          ros.socket.onerror = null
          ros.socket.onmessage = null
        }
        // Detach before close: a late close must not affect the next attempt.
        ros.close()
      }
      const fail = (error: Error, event?: { code?: number; reason?: string; wasClean?: boolean }) => {
        if (ended || !current()) return
        ended = true
        const wasRecovering = this.reconnecting
        this.stopHeartbeat()
        this.cancelRequests()
        this.ros = null
        this.cancelAttempt = null
        this.publishers.clear()
        this.forEachSubscriber(entry => { entry.listener = null })
        cleanup()
        if ((established || wasRecovering) && this.config?.autoConnect !== false) {
          this.reconnecting = true
          this.scheduleReconnect(generation)
        } else {
          this.reconnecting = false
        }
        console.warn('[RosConnection] connection lost', {
          time: new Date().toISOString(), code: event?.code,
          reason: event?.reason || error.message, wasClean: event?.wasClean,
          lastReceivedAt: this.lastReceivedAt, retryAttempt: this.reconnectAttempt
        })
        this.notifyConnectionChange(false)
        if (established) this.notifyDisconnect()
        reject(error)
      }
      this.cancelAttempt = () => {
        ended = true
        cleanup()
        reject(new Error('连接已取消'))
      }
      ros.on('connection', () => {
        if (!current() || ended || established) return
        clearTimeout(timeout)
        established = true
        this.reconnecting = false
        this.lastReceivedAt = null
        this.heartbeatFailCount = 0
        this.forEachSubscriber(entry => this.attachSubscriber(entry, lib, ros))
        this.startHeartbeat()
        this.notifyConnectionChange(true)
        resolve()
      })
      ros.on('close', (event: any) => fail(new Error('WebSocket 连接已断开'), event))
      ros.on('error', (error: unknown) => fail(
        error instanceof Error ? error : new Error('WebSocket 连接失败，请检查网络和机器狗服务')
      ))
      try {
        ros.connect(this.config!.url)
        ros.socket?.addEventListener('message', onMessage)
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private scheduleReconnect(generation: number): void {
    if (this.reconnectTimer !== null || generation !== this.generation) return
    const base = Math.min(1000 * 2 ** Math.min(this.reconnectAttempt++, 5), 30000)
    const delay = Math.min(30000, Math.round(base * (0.8 + Math.random() * 0.4)))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (generation !== this.generation || !this.reconnecting) return
      // The library is cached after a successful connection.
      void this.openConnection(ROSLIB, generation).catch(() => { /* fail schedules the next attempt */ })
    }, delay)
  }

  isReconnecting(): boolean {
    return this.reconnecting
  }

  disconnect(): void {
    ++this.generation
    this.config = null
    this.reconnecting = false
    this.reconnectAttempt = 0
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.stopHeartbeat()
    this.cancelRequests()
    this.cancelAttempt?.()
    this.cancelAttempt = null
    this.ros = null
    this.forEachSubscriber(entry => {
      entry.listener = null
      entry.callbacks.clear()
    })
    this.subscribers.clear()
    this.debugSubscribers.clear()
    this.publishers.clear()
    this.heartbeatPaused = false
    this.notifyConnectionChange(false)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setTimeout(() => this.probeHeartbeat(), this.HEARTBEAT_INTERVAL)
  }

  /** A real rosbridge request detects half-open connections. One probe at a time. */
  private probeHeartbeat(): void {
    this.heartbeatTimer = null
    const ros = this.ros
    if (!ros || this.cancelProbe) return
    if (!this.isConnected()) {
      ros.emit('error', new Error('WebSocket 连接状态异常'))
      return
    }
    // Long transfers pause failure judgement, while keepalive traffic continues.
    const startedAt = Date.now()
    const id = `call_service:/rosapi/nodes:heartbeat:${++ros.idCounter}`
    let done = false
    const cleanup = () => {
      clearTimeout(timeout)
      ros.off(id, onReply)
      this.cancelProbe = null
    }
    const finish = (alive: boolean) => {
      if (done) return
      done = true
      cleanup()
      if (this.ros !== ros) return
      // A service error reply still proves the transport is alive. Other incoming
      // messages also prove liveness if rosapi is unavailable on this robot.
      if (alive || (this.lastReceivedAt !== null && this.lastReceivedAt >= startedAt)) {
        this.heartbeatFailCount = 0
        this.reconnectAttempt = 0
      } else if (!this.heartbeatPaused && !(typeof document !== 'undefined' && document.hidden)) {
        this.heartbeatFailCount++
        console.warn(`[RosConnection] heartbeat timeout (${this.heartbeatFailCount}/${this.MAX_HEARTBEAT_FAILURES})`)
        if (this.heartbeatFailCount >= this.MAX_HEARTBEAT_FAILURES) {
          // Use the normal failure path even if WebSocket never emits close.
          ros.emit('error', new Error('心跳响应超时'))
          return
        }
      }
      this.startHeartbeat()
    }
    const onReply = () => finish(true)
    const timeout = setTimeout(() => finish(false), this.HEARTBEAT_TIMEOUT)
    this.cancelProbe = () => { done = true; cleanup() }
    ros.once(id, onReply)
    try {
      ros.callOnConnection({ op: 'call_service', id, service: '/rosapi/nodes', type: 'rosapi/Nodes', args: {} })
    } catch {
      finish(false)
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) clearTimeout(this.heartbeatTimer)
    this.heartbeatTimer = null
    this.cancelProbe?.()
  }

  private checkNow(): void {
    if (this.isConnected()) {
      this.stopHeartbeat()
      this.probeHeartbeat()
    } else if (this.reconnecting && this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
      void this.openConnection(ROSLIB, this.generation).catch(() => {})
    }
  }

  pauseHeartbeat(): void {
    this.heartbeatPaused = true
    this.heartbeatFailCount = 0
    this.stopHeartbeat()
    this.startHeartbeat()
  }

  resumeHeartbeat(): void {
    this.heartbeatPaused = false
    this.heartbeatFailCount = 0
    this.checkNow()
  }

  isConnected(): boolean {
    return this.ros !== null && this.ros.isConnected && this.ros.socket?.readyState === 1
  }

  private requireConnection(expected = this.ros): any {
    if (!expected || expected !== this.ros || !this.isConnected()) {
      throw new Error('连接已断开，指令未发送，请在恢复连接后重试')
    }
    return expected
  }

  private forEachSubscriber(callback: (entry: SubscriberEntry) => void): void {
    this.subscribers.forEach(callback)
    this.debugSubscribers.forEach(callback)
  }

  private attachSubscriber(entry: SubscriberEntry, lib: any, ros: any): void {
    const listener = new lib.Topic({
      ros, name: entry.config.topic, messageType: entry.config.messageType,
      throttle_rate: entry.config.throttleRate ?? 200,
      queue_length: 1, compression: entry.config.compression || 'none'
    })
    entry.listener = listener
    listener.subscribe((message: RosMessage) => {
      if (this.ros !== ros || entry.listener !== listener) return
      entry.callbacks.forEach(callback => callback(message))
    })
  }

  async subscribe(subscription: TopicSubscription): Promise<void> {
    const ros = this.requireConnection()
    const key = subscription.key || 'default'
    let entry = this.subscribers.get(subscription.topic)
    if (!entry) {
      entry = { listener: null, config: { ...subscription }, callbacks: new Map() }
      this.subscribers.set(subscription.topic, entry)
    }
    // Reserve ownership before awaiting: unsubscribe/unmount must be able to
    // cancel a registration even while the library promise is still pending.
    entry.callbacks.set(key, subscription.callback)
    const lib = await loadRoslib()
    if (this.subscribers.get(subscription.topic) !== entry || !entry.callbacks.has(key)) return
    this.requireConnection(ros)
    if (!entry.listener) this.attachSubscriber(entry, lib, ros)
  }

  unsubscribe(topic: string, key?: string): void {
    const entry = this.subscribers.get(topic)
    if (!entry) return
    if (key) {
      entry.callbacks.delete(key)
      if (entry.callbacks.size > 0) return
    }
    if (entry.listener && this.isConnected()) entry.listener.unsubscribe()
    entry.callbacks.clear()
    this.subscribers.delete(topic)
  }

  async createDebugSubscription(subscription: TopicSubscription): Promise<() => void> {
    const ros = this.requireConnection()
    const lib = await loadRoslib()
    this.requireConnection(ros)
    const entry: SubscriberEntry = {
      listener: null, config: { ...subscription },
      callbacks: new Map([['debug', subscription.callback]])
    }
    this.debugSubscribers.add(entry)
    this.attachSubscriber(entry, lib, ros)
    return () => {
      if (entry.listener && this.isConnected()) entry.listener.unsubscribe()
      entry.callbacks.clear()
      this.debugSubscribers.delete(entry)
    }
  }

  /**
   * 发布消息到话题
   */
  async publish(topic: string, messageType: string, message: RosMessage): Promise<void> {
    const ros = this.requireConnection()
    const lib = await loadRoslib()
    this.requireConnection(ros)

    // 获取或创建发布者
    let publisher = this.publishers.get(topic)
    if (!publisher) {
      publisher = new lib.Topic({
        ros,
        name: topic,
        messageType: messageType
      })
      this.publishers.set(topic, publisher)
    }

    const rosMessage = new lib.Message(message)
    publisher.publish(rosMessage)
  }

  /** Read-only discovery retries remain bound to the connection that requested them. */
  async getTopics(retries = 2, timeoutMs = 10000): Promise<RosTopic[]> {
    const ros = this.requireConnection()
    for (let attempt = 0; ; attempt++) {
      this.requireConnection(ros)
      try {
        const result = await this.requestService(ros, '/rosapi/topics', 'rosapi/Topics', {}, timeoutMs)
        if (!Array.isArray(result.topics)) throw new Error('无效的话题列表响应')
        return result.topics.map((name: string, index: number) => ({
          name, messageType: result.types?.[index] || 'unknown'
        }))
      } catch (error) {
        this.requireConnection(ros)
        if (attempt >= retries) throw error
        await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 1000 : 2000))
      }
    }
  }

  /** Commands are sent once, never queued or retried. Callers can extend long service timeouts. */
  async callService(
    serviceName: string,
    serviceType: string,
    request: RosMessage,
    timeoutMs = 30000
  ): Promise<RosMessage> {
    const ros = this.requireConnection()
    return this.requestService(ros, serviceName, serviceType, request, timeoutMs)
  }

  private requestService(
    ros: any, service: string, type: string, args: RosMessage, timeoutMs: number
  ): Promise<RosMessage> {
    this.requireConnection(ros)
    return new Promise((resolve, reject) => {
      const id = `call_service:${service}:${++ros.idCounter}`
      const cleanup = () => {
        clearTimeout(timeout)
        ros.off(id, onReply)
        this.pendingRequests.delete(cancel)
      }
      const cancel = () => {
        cleanup()
        reject(new Error('连接已断开，服务请求已取消'))
      }
      const onReply = (message: any) => {
        cleanup()
        if (message.result === false) reject(new Error(String(message.values || '服务调用失败')))
        else resolve(message.values)
      }
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error(`服务响应超时: ${service}`))
      }, timeoutMs)
      this.pendingRequests.add(cancel)
      ros.once(id, onReply)
      try {
        ros.callOnConnection({ op: 'call_service', id, service, type, args })
      } catch (error) {
        cleanup()
        reject(error)
      }
    })
  }

  private cancelRequests(): void {
    this.pendingRequests.forEach(cancel => cancel())
  }

  /**
   * 注册连接状态变化回调
   */
  onConnectionChange(callback: (connected: boolean) => void): void {
    this.connectionCallbacks.push(callback)
  }

  /**
   * 移除连接状态变化回调
   */
  offConnectionChange(callback: (connected: boolean) => void): void {
    const index = this.connectionCallbacks.indexOf(callback)
    if (index > -1) {
      this.connectionCallbacks.splice(index, 1)
    }
  }

  /**
   * 注册断连回调
   */
  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback)
  }

  /**
   * 移除断连回调
   */
  offDisconnect(callback: () => void): void {
    const index = this.disconnectCallbacks.indexOf(callback)
    if (index > -1) {
      this.disconnectCallbacks.splice(index, 1)
    }
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionCallbacks.forEach((cb) => cb(connected))
  }

  private notifyDisconnect(): void {
    this.disconnectCallbacks.forEach((cb) => cb())
  }
}

// 导出单例
export const rosConnection = new RosConnection()
