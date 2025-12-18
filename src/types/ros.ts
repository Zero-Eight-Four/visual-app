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

export interface TTSReq {
  text: string
  voice: number // 0=男声, 1=女声
  loop: boolean
  volume: number // 0-100
}

export interface CommonResp {
  success: boolean
  message: string
  file_list?: string[]
}

export interface RecordAudioReq {
  duration: number // 秒
  enable_denoise: boolean
}

export interface RobotStatus {
  motor_error_count?: number
  system_status?: string
  temp_ntc1?: number
  position_x?: number
  position_y?: number
  position_z?: number
  velocity_x?: number
  velocity_y?: number
  velocity_z?: number
  battery_soc?: number
  battery_mode?: string
  battery_temp_bat1?: number
  battery_temp_bat2?: number
  [key: string]: any
}

export interface RecordAudioResp {
  success: boolean
  message: string
  audio_file: string
}

export interface DeviceControlReq {
  command: string
  param1: string
  param2: string
  param_int: number
  param_bool: boolean
}

export interface AudioData {
  header: any
  data: number[]
  sample_rate: number
  channels: number
  chunk_size: number
  format: string
}
