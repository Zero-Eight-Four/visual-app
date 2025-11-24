/**
 * ROS 消息处理工具函数
 */

import type { RosMessage } from '@/types/ros'

/**
 * 将 ROS Time 转换为 JavaScript Date
 */
export function rosTimeToDate(rosTime: { sec: number; nsec: number }): Date {
  return new Date(rosTime.sec * 1000 + rosTime.nsec / 1000000)
}

/**
 * 将 JavaScript Date 转换为 ROS Time
 */
export function dateToRosTime(date: Date): { sec: number; nsec: number } {
  const ms = date.getTime()
  return {
    sec: Math.floor(ms / 1000),
    nsec: (ms % 1000) * 1000000
  }
}

/**
 * 解码 base64 图像数据
 */
export function decodeBase64Image(base64: string): string {
  return `data:image/jpeg;base64,${base64}`
}

/**
 * 格式化话题名称
 */
export function formatTopicName(topic: string): string {
  return topic.startsWith('/') ? topic : `/${topic}`
}

/**
 * 解析消息类型
 */
export function parseMessageType(messageType: string): {
  package: string
  type: string
} {
  const parts = messageType.split('/')
  return {
    package: parts[0] || '',
    type: parts[1] || ''
  }
}

/**
 * 验证 JSON 消息格式
 */
export function validateJsonMessage(jsonStr: string): {
  valid: boolean
  error?: string
  data?: RosMessage
} {
  try {
    const data = JSON.parse(jsonStr)
    if (typeof data !== 'object' || data === null) {
      return {
        valid: false,
        error: '消息必须是一个 JSON 对象'
      }
    }
    return {
      valid: true,
      data
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : '无效的 JSON 格式'
    }
  }
}

/**
 * 格式化字节大小
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

/**
 * 深度克隆消息对象
 */
export function cloneMessage<T extends RosMessage>(message: T): T {
  return JSON.parse(JSON.stringify(message))
}

/**
 * 提取消息摘要
 */
export function extractMessageSummary(message: RosMessage, maxLength = 100): string {
  const str = JSON.stringify(message)
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str
}

/**
 * 判断是否为图像消息
 */
export function isImageMessage(messageType: string): boolean {
  return (
    messageType.includes('Image') ||
    messageType.includes('image') ||
    messageType === 'sensor_msgs/Image' ||
    messageType === 'sensor_msgs/CompressedImage'
  )
}

/**
 * 判断是否为点云消息
 */
export function isPointCloudMessage(messageType: string): boolean {
  return messageType === 'sensor_msgs/PointCloud2' || messageType === 'sensor_msgs/PointCloud'
}

/**
 * 判断是否为 TF 消息
 */
export function isTFMessage(messageType: string): boolean {
  return messageType === 'tf2_msgs/TFMessage' || messageType === 'tf/tfMessage'
}
