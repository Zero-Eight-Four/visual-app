import { defineStore } from 'pinia'
import { ref } from 'vue'
import { rosConnection } from '@/services/rosConnection'
import type { TTSReq, RecordAudioReq, DeviceControlReq, CommonResp, RecordAudioResp } from '@/types/ros'
import { ElMessage } from 'element-plus'

export const useVoiceStore = defineStore('voice', () => {
  // State
  const lastTTSResp = ref<CommonResp | null>(null)
  const lastRecordResp = ref<RecordAudioResp | null>(null)
  const lastDeviceControlResp = ref<CommonResp | null>(null)
  const logs = ref<string[]>([])

  // Actions
  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString()
    logs.value.unshift(`[${time}] ${msg}`)
    if (logs.value.length > 100) logs.value.pop()
  }

  async function initSubscriptions() {
    try {
      await rosConnection.subscribe({
        topic: '/voice/tts_resp',
        messageType: 'voice_chat_ros/CommonResp',
        callback: (msg: any) => {
          lastTTSResp.value = msg
          addLog(`TTS响应: ${msg.success ? '成功' : '失败'} - ${msg.message}`)
          if (!msg.success) ElMessage.error(`TTS失败: ${msg.message}`)
          else ElMessage.success(`TTS成功: ${msg.message}`)
        }
      })

      await rosConnection.subscribe({
        topic: '/voice/record_audio_resp',
        messageType: 'voice_chat_ros/RecordAudioResp',
        callback: (msg: any) => {
          lastRecordResp.value = msg
          addLog(`录音响应: ${msg.success ? '成功' : '失败'} - ${msg.message}`)
          if (msg.audio_file) addLog(`录音文件: ${msg.audio_file}`)
          if (!msg.success) ElMessage.error(`录音失败: ${msg.message}`)
          else ElMessage.success(`录音成功: ${msg.message}`)
        }
      })

      await rosConnection.subscribe({
        topic: '/voice/device_control_resp',
        messageType: 'voice_chat_ros/CommonResp',
        callback: (msg: any) => {
          lastDeviceControlResp.value = msg
          addLog(`设备控制响应: ${msg.success ? '成功' : '失败'} - ${msg.message}`)
          if (msg.file_list) addLog(`文件列表: ${msg.file_list.join(', ')}`)
          if (!msg.success) ElMessage.error(`设备控制失败: ${msg.message}`)
          else ElMessage.success(`设备控制成功: ${msg.message}`)
        }
      })

      addLog('已订阅语音交互相关话题')
    } catch (error) {
      console.error('Failed to subscribe to voice topics:', error)
      addLog(`订阅失败: ${error}`)
    }
  }

  async function sendTTS(req: TTSReq) {
    try {
      await rosConnection.publish('/voice/tts_req', 'voice_chat_ros/TTSReq', req)
      addLog(`发送TTS请求: "${req.text}" (音量: ${req.volume})`)
    } catch (error) {
      console.error('Failed to send TTS request:', error)
      addLog(`发送TTS请求失败: ${error}`)
      ElMessage.error('发送TTS请求失败')
    }
  }

  async function sendRecordAudio(req: RecordAudioReq) {
    try {
      await rosConnection.publish('/voice/record_audio_req', 'voice_chat_ros/RecordAudioReq', req)
      addLog(`发送录音请求: 时长 ${req.duration}秒`)
    } catch (error) {
      console.error('Failed to send record request:', error)
      addLog(`发送录音请求失败: ${error}`)
      ElMessage.error('发送录音请求失败')
    }
  }

  async function sendDeviceControl(req: DeviceControlReq) {
    try {
      await rosConnection.publish('/voice/device_control_req', 'voice_chat_ros/DeviceControlReq', req)
      addLog(`发送设备控制: ${req.command}`)
    } catch (error) {
      console.error('Failed to send device control request:', error)
      addLog(`发送设备控制请求失败: ${error}`)
      ElMessage.error('发送设备控制请求失败')
    }
  }

  // Bridge Node Actions
  async function bridgeLightControl(isOn: boolean) {
    const topic = isOn ? '/voice_device_bridge_node/light_on' : '/voice_device_bridge_node/light_off'
    try {
      await rosConnection.publish(topic, 'std_msgs/Empty', {})
      addLog(`发送灯光控制: ${isOn ? '开' : '关'}`)
    } catch (error) {
      console.error('Failed to control light:', error)
      ElMessage.error('灯光控制失败')
    }
  }

  async function bridgeLightMode(mode: 0 | 1) {
    const topic = mode === 0 ? '/voice_device_bridge_node/light_mode_0' : '/voice_device_bridge_node/light_mode_1'
    try {
      await rosConnection.publish(topic, 'std_msgs/Empty', {})
      addLog(`发送灯光模式: ${mode}`)
    } catch (error) {
      console.error('Failed to set light mode:', error)
      ElMessage.error('设置灯光模式失败')
    }
  }

  async function bridgeTTS(text: string, voice: number, loop: boolean, volume: number) {
    try {
      // Set parameters
      await rosConnection.publish('/voice_device_bridge_node/tts_text', 'std_msgs/String', { data: text })
      await rosConnection.publish('/voice_device_bridge_node/tts_voice', 'std_msgs/UInt8', { data: voice })
      await rosConnection.publish('/voice_device_bridge_node/tts_loop', 'std_msgs/Bool', { data: loop })
      await rosConnection.publish('/voice_device_bridge_node/tts_volume', 'std_msgs/UInt8', { data: volume })

      // Trigger TTS
      setTimeout(async () => {
        await rosConnection.publish('/voice_device_bridge_node/tts', 'std_msgs/Empty', {})
      }, 100)

      addLog(`发送TTS(Bridge): "${text}"`)
    } catch (error) {
      console.error('Failed to send TTS (Bridge):', error)
      ElMessage.error('发送TTS失败')
    }
  }

  async function bridgeTTSStop() {
    try {
      await rosConnection.publish('/voice_device_bridge_node/tts_stop', 'std_msgs/Empty', {})
      addLog('发送停止TTS循环指令')
    } catch (error) {
      console.error('Failed to stop TTS:', error)
      ElMessage.error('停止TTS失败')
    }
  }

  return {
    lastTTSResp,
    lastRecordResp,
    lastDeviceControlResp,
    logs,
    initSubscriptions,
    sendTTS,
    sendRecordAudio,
    sendDeviceControl,
    addLog,
    bridgeLightControl,
    bridgeLightMode,
    bridgeTTS,
    bridgeTTSStop
  }
})
