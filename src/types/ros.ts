// ROS连接和通信类型定义
export interface RosMessage {
  [key: string]: any
}

export interface RosTopic {
  name: string
  messageType: string
}

export interface ConnectionConfig {
  url: string
  autoConnect?: boolean
}

export interface TopicSubscription {
  topic: string
  messageType: string
  callback: (message: RosMessage) => void
}

export interface ServiceRequest {
  serviceName: string
  serviceType: string
  request: RosMessage
}

export interface RosConnectionState {
  connected: boolean
  connecting: boolean
  error: string | null
  url: string
}
