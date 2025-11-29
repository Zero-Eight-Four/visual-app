/**
 * ROS连接管理模块
 * 负责与ROS的WebSocket连接、话题订阅、发布等功能
 */

import type { ConnectionConfig, RosMessage, TopicSubscription, RosTopic } from '@/types/ros'

// 使用动态导入避免构建时的类型问题
let ROSLIB: any = null

async function loadRoslib() {
  if (!ROSLIB) {
    // @ts-ignore
    ROSLIB = await import('roslib')
  }
  return ROSLIB
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
  private readonly HEARTBEAT_INTERVAL = 3000 // 3秒心跳
  private readonly HEARTBEAT_TIMEOUT = 2000 // 2秒超时
  private readonly MAX_HEARTBEAT_FAILURES = 3 // 最大失败次数

  /**
   * 连接到ROS Bridge服务器
   */
  async connect(config: ConnectionConfig): Promise<void> {
    const lib = await loadRoslib()
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

      this.ros = new lib.Ros({
        url: config.url
      })

      this.ros.on('connection', () => {
        clearTimeout(timeout)
        this.notifyConnectionChange(true)
        this.startHeartbeat()
        resolve()
      })

      this.ros.on('error', (error: any) => {
        clearTimeout(timeout)
        this.stopHeartbeat()
        console.error('ROS connection error:', error)
        this.notifyConnectionChange(false)
        // WebSocket 错误事件返回的是 Event 对象，需要转换为 Error
        const errorMsg =
          error instanceof Error
            ? error
            : new Error('WebSocket 连接失败：无法连接到服务器，请检查网络和 rosbridge_server 状态')
        reject(errorMsg)
      })

      this.ros.on('close', () => {
        clearTimeout(timeout)
        this.stopHeartbeat()
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

    this.heartbeatTimer = setInterval(() => {
      if (!this.ros || !this.ros.isConnected) {
        this.stopHeartbeat()
        return
      }

      // 使用 getNodes 作为心跳包
      // 设置超时 Promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Heartbeat timeout')), this.HEARTBEAT_TIMEOUT)
      })

      // 执行心跳检查
      Promise.race([
        new Promise((resolve, reject) => {
          this.ros.getNodes(resolve, reject)
        }),
        timeoutPromise
      ])
        .then(() => {
          // 心跳成功，重置失败计数
          this.heartbeatFailCount = 0
        })
        .catch(() => {
          // 心跳失败
          this.heartbeatFailCount++
          if (this.heartbeatFailCount >= this.MAX_HEARTBEAT_FAILURES) {
            console.warn('Heartbeat failed too many times, closing connection')
            this.stopHeartbeat()
            // 触发断连逻辑
            if (this.ros) {
              this.ros.close()
            }
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
      throttle_rate: 200,
      queue_length: 1
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
   */
  async getTopics(): Promise<RosTopic[]> {
    if (!this.ros) {
      throw new Error('Not connected to ROS')
    }

    return new Promise((resolve, reject) => {
      this.ros.getTopics(
        (result: any) => {
          const topics: RosTopic[] = result.topics.map((name: string, index: number) => ({
            name,
            messageType: result.types[index]
          }))
          resolve(topics)
        },
        (error: Error) => {
          reject(error)
        }
      )
    })
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
