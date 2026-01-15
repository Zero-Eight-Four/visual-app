/**
 * ROS连接管理模块
 * 负责与ROS的WebSocket连接、话题订阅、发布等功能
 */

import type { ConnectionConfig, RosMessage, TopicSubscription, RosTopic } from '@/types/ros'

// 使用动态导入避免构建时的类型问题
let ROSLIB: any = null

async function loadRoslib(retries = 3): Promise<any> {
  if (ROSLIB) {
    return ROSLIB
  }

  for (let i = 0; i < retries; i++) {
    try {
      // @ts-ignore
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
  private subscribers = new Map<string, any>()
  private publishers = new Map<string, any>()
  private connectionCallbacks: ((connected: boolean) => void)[] = []
  private disconnectCallbacks: (() => void)[] = []
  private intentionalDisconnect = false
  private heartbeatTimer: any = null
  private heartbeatFailCount = 0
  private heartbeatPaused = false // 心跳是否暂停
  private readonly HEARTBEAT_INTERVAL = 10000 // 10秒心跳（增加间隔，减少频率）
  private readonly HEARTBEAT_TIMEOUT = 10000 // 10秒超时（增加超时时间）
  private readonly MAX_HEARTBEAT_FAILURES = 10 // 10次失败（增加容错）
  private readonly HEARTBEAT_START_DELAY = 5000 // 连接建立后延迟5秒再开始心跳

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.pauseHeartbeat()
        } else {
          this.resumeHeartbeat()
        }
      })
    }
  }

  /**
   * 连接到ROS Bridge服务器
   */
  async connect(config: ConnectionConfig): Promise<void> {
    const lib = await loadRoslib()
    const Ros = lib.Ros || lib.default?.Ros

    if (!Ros) {
      throw new Error('无法加载 Ros 类: roslib 模块加载失败')
    }

    this.intentionalDisconnect = false

    return new Promise((resolve, reject) => {
      // 设置连接超时（15秒）
      const timeout = setTimeout(() => {
        if (this.ros) {
          this.ros.close()
          this.ros = null
        }
        reject(new Error('连接超时：无法在15秒内连接到服务器，请检查网络和服务器状态'))
      }, 15000)

      this.ros = new Ros({
        url: config.url
      })

      this.ros.on('connection', () => {
        clearTimeout(timeout)
        this.notifyConnectionChange(true)
        // 延迟启动心跳检测，等待 ROS 服务完全就绪
        setTimeout(() => {
          this.startHeartbeat()
        }, this.HEARTBEAT_START_DELAY)
        resolve()
      })

      this.ros.on('error', (error: any) => {
        clearTimeout(timeout)
        this.stopHeartbeat()
        console.error('ROS connection error:', error)
        this.notifyConnectionChange(false)

        // WebSocket 错误事件返回的是 Event 对象，需要提取详细信息
        let errorMessage = 'WebSocket 连接失败：无法连接到服务器'

        if (error instanceof Error) {
          errorMessage = error.message
        } else if (error && typeof error === 'object') {
          // 尝试从WebSocket对象获取更多信息
          const ws = error.target || error.currentTarget
          if (ws && ws.readyState !== undefined) {
            // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
            if (ws.readyState === 3) {
              errorMessage = `WebSocket 连接失败：连接已关闭 (readyState: ${ws.readyState})`
            } else {
              errorMessage = `WebSocket 连接失败：连接状态异常 (readyState: ${ws.readyState})`
            }
          }

          // 检查是否有URL信息
          if (ws && ws.url) {
            const url = new URL(ws.url)
            errorMessage += `\n\n连接地址: ${url.hostname}:${url.port || '默认端口'}`
            errorMessage += `\n\n可能的原因：`
            errorMessage += `\n1. rosbridge_server 未运行（检查: rosrun rosbridge_server rosbridge_websocket.py）`
            errorMessage += `\n2. 端口不正确（默认端口是 9090，当前使用: ${url.port || '9090'}）`
            errorMessage += `\n3. 防火墙阻止了连接`
            errorMessage += `\n4. 网络不通（尝试 ping ${url.hostname}）`
            errorMessage += `\n5. 服务器地址错误`
          }
        }

        reject(new Error(errorMessage))
      })

      this.ros.on('close', () => {
        clearTimeout(timeout)
        this.stopHeartbeat()

        // Clear publishers and subscribers as they are bound to the closed connection
        this.subscribers.clear()
        this.publishers.clear()

        this.notifyConnectionChange(false)
        if (!this.intentionalDisconnect) {
          this.notifyDisconnect()
        }
      })
    })
  }

  /**
   * 断开ROS连接
   */
  disconnect(): void {
    this.intentionalDisconnect = true
    this.stopHeartbeat()
    if (this.ros) {
      // 清理所有订阅
      this.subscribers.forEach((sub) => sub.unsubscribe())
      this.subscribers.clear()

      // 清理所有发布者
      this.publishers.clear()

      this.ros.close()
      this.ros = null
    }
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatFailCount = 0

    // 初始检查页面可见性
    if (typeof document !== 'undefined' && document.hidden) {
      this.heartbeatPaused = true
      console.debug('[Heartbeat] 页面不可见，初始状态为暂停')
    } else {
      this.heartbeatPaused = false
    }

    this.heartbeatTimer = setInterval(() => {
      // 如果心跳已暂停，跳过本次检测
      if (this.heartbeatPaused) {
        return
      }

      if (!this.ros || !this.ros.isConnected) {
        this.stopHeartbeat()
        return
      }

      // 记录当前是否暂停状态，用于在异步回调中检查
      const wasPaused = this.heartbeatPaused

      // 使用更轻量的心跳检测方法：检查 WebSocket 连接状态
      // 如果 WebSocket 连接正常，就认为心跳成功
      // 这样可以避免依赖可能不可用的 ROS 服务
      const checkConnection = () => {
        if (!this.ros || !this.ros.isConnected) {
          return false
        }
        // 检查 WebSocket 的 readyState
        // 1 = OPEN, 0 = CONNECTING, 2 = CLOSING, 3 = CLOSED
        const ws = (this.ros as any).socket
        if (ws && ws.readyState === 1) {
          return true
        }
        return false
      }

      // 如果 WebSocket 连接正常，直接认为心跳成功
      if (checkConnection()) {
        if (!this.heartbeatPaused && !wasPaused) {
          this.heartbeatFailCount = 0
        }
        return
      }

      // 如果 WebSocket 连接异常，尝试使用 getNodes 作为备用检测
      // 设置超时 Promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Heartbeat timeout')), this.HEARTBEAT_TIMEOUT)
      })

      // 执行心跳检查
      Promise.race([
        new Promise((resolve, reject) => {
          // 再次检查是否暂停（可能在设置 Promise 后暂停了）
          if (this.heartbeatPaused) {
            resolve(null) // 如果已暂停，直接成功，不执行实际请求
            return
          }
          // 再次检查 WebSocket 连接
          if (checkConnection()) {
            resolve(null)
            return
          }
          // 如果 WebSocket 连接异常，尝试使用 getNodes
          try {
            this.ros.getNodes(resolve, reject)
          } catch (error) {
            reject(error)
          }
        }),
        timeoutPromise
      ])
        .then(() => {
          // 心跳成功，重置失败计数（但只有在未暂停时才重置）
          if (!this.heartbeatPaused && !wasPaused) {
            this.heartbeatFailCount = 0
          }
        })
        .catch(() => {
          // 心跳失败（但如果心跳已暂停，不增加失败计数）
          // 需要检查暂停状态，因为可能在请求过程中暂停了
          if (!this.heartbeatPaused && !wasPaused) {
            this.heartbeatFailCount++
            console.warn(`[Heartbeat] 心跳失败 (${this.heartbeatFailCount}/${this.MAX_HEARTBEAT_FAILURES})`)
            if (this.heartbeatFailCount >= this.MAX_HEARTBEAT_FAILURES) {
              console.warn('[Heartbeat] 心跳失败太多次，关闭连接')
              this.stopHeartbeat()
              // 触发断连逻辑
              if (this.ros) {
                this.ros.close()
              }
            }
          } else {
            // 如果已暂停，忽略错误
            console.log('[Heartbeat] 心跳已暂停，忽略失败')
          }
        })
    }, this.HEARTBEAT_INTERVAL)
  }

  /**
   * 停止心跳检测
   */
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.heartbeatPaused = false
  }

  /**
   * 暂停心跳检测（用于文件传输等长时间操作）
   */
  pauseHeartbeat(): void {
    if (!this.heartbeatPaused) {
      this.heartbeatPaused = true
      // 重置失败计数，避免在暂停期间累积失败
      this.heartbeatFailCount = 0
      console.debug('[Heartbeat] 心跳检测已暂停')
    }
  }

  /**
   * 恢复心跳检测
   */
  resumeHeartbeat(): void {
    if (this.heartbeatPaused) {
      this.heartbeatPaused = false
      // 重置失败计数，重新开始检测
      this.heartbeatFailCount = 0
      console.debug('[Heartbeat] 心跳检测已恢复')
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.ros !== null && this.ros.isConnected
  }

  /**
   * 订阅话题
   */
  async subscribe(subscription: TopicSubscription): Promise<void> {
    if (!this.ros) {
      throw new Error('Not connected to ROS')
    }

    const lib = await loadRoslib()

    // 如果已存在订阅，先取消
    if (this.subscribers.has(subscription.topic)) {
      this.unsubscribe(subscription.topic)
    }

    const listener = new lib.Topic({
      ros: this.ros,
      name: subscription.topic,
      messageType: subscription.messageType,
      throttle_rate: subscription.throttleRate ?? 200,
      queue_length: 1,
      compression: subscription.compression || 'none'
    })

    listener.subscribe((message: RosMessage) => {
      subscription.callback(message)
    })

    this.subscribers.set(subscription.topic, listener)
  }

  /**
   * 取消订阅话题
   */
  unsubscribe(topic: string): void {
    const subscriber = this.subscribers.get(topic)
    if (subscriber) {
      subscriber.unsubscribe()
      this.subscribers.delete(topic)
    }
  }

  /**
   * 发布消息到话题
   */
  async publish(topic: string, messageType: string, message: RosMessage): Promise<void> {
    if (!this.ros) {
      throw new Error('Not connected to ROS')
    }

    const lib = await loadRoslib()

    // 获取或创建发布者
    let publisher = this.publishers.get(topic)
    if (!publisher) {
      publisher = new lib.Topic({
        ros: this.ros,
        name: topic,
        messageType: messageType
      })
      this.publishers.set(topic, publisher)
    }

    const rosMessage = new lib.Message(message)
    publisher.publish(rosMessage)
  }

  /**
   * 获取可用话题列表
   * @param retries 重试次数，默认为2
   * @param timeoutMs 单次超时时间（毫秒），默认为10000
   */
  async getTopics(retries = 2, timeoutMs = 10000): Promise<RosTopic[]> {
    if (!this.ros) {
      throw new Error('Not connected to ROS')
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await new Promise<RosTopic[]>((resolve, reject) => {
          // 设置超时，避免长时间等待
          const timeout = setTimeout(() => {
            reject(new Error(`获取话题列表超时 (尝试 ${attempt + 1}/${retries + 1})`))
          }, timeoutMs)

          try {
            this.ros.getTopics(
              (result: any) => {
                clearTimeout(timeout)
                if (result && result.topics && Array.isArray(result.topics)) {
                  const topics: RosTopic[] = result.topics.map((name: string, index: number) => ({
                    name,
                    messageType: result.types && result.types[index] ? result.types[index] : 'unknown'
                  }))
                  resolve(topics)
                } else {
                  reject(new Error('无效的话题列表响应'))
                }
              },
              (error: Error) => {
                clearTimeout(timeout)
                // 如果错误信息包含服务不存在，提供更友好的错误信息
                const errorMsg = error.message || String(error)
                if (errorMsg.includes('does not exist') || errorMsg.includes('Service')) {
                  reject(new Error('ROS API 服务不可用，请确保 rosbridge 服务正常运行'))
                } else {
                  reject(error)
                }
              }
            )
          } catch (error) {
            clearTimeout(timeout)
            reject(error)
          }
        })
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`[RosConnection] 获取话题列表失败 (尝试 ${attempt + 1}/${retries + 1}):`, lastError.message)

        // 如果是最后一次尝试，则抛出错误
        if (attempt === retries) {
          throw lastError
        }

        // 计算重试等待时间 (递增策略: 1s -> 2s -> 5s...)
        const delay = attempt === 0 ? 1000 : (attempt === 1 ? 2000 : 5000)
        console.log(`[RosConnection] 等待 ${delay}ms 后重试...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError || new Error('获取话题列表失败')
  }

  /**
   * 调用服务
   */
  async callService(
    serviceName: string,
    serviceType: string,
    request: RosMessage
  ): Promise<RosMessage> {
    if (!this.ros) {
      throw new Error('Not connected to ROS')
    }

    const lib = await loadRoslib()

    return new Promise((resolve, reject) => {
      const service = new lib.Service({
        ros: this.ros,
        name: serviceName,
        serviceType: serviceType
      })

      const serviceRequest = new lib.ServiceRequest(request)

      service.callService(
        serviceRequest,
        (response: RosMessage) => {
          resolve(response)
        },
        (error: Error) => {
          reject(error)
        }
      )
    })
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
