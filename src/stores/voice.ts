import { defineStore } from 'pinia'
import { ref } from 'vue'
import { rosConnection } from '@/services/rosConnection'
import type { DeviceControlReq, CommonResp } from '@/types/ros'
import { ElMessage } from 'element-plus'

export const useVoiceStore = defineStore('voice', () => {
  // State
  const lastTTSResp = ref<CommonResp | null>(null)
  const lastDeviceControlResp = ref<CommonResp | null>(null)
  const logs = ref<string[]>([])
  const subscriptionsReady = ref(false)

  // Actions
  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString()
    logs.value.unshift(`[${time}] ${msg}`)
    if (logs.value.length > 100) logs.value.pop()
  }

  function markSubscriptionsPending() {
    subscriptionsReady.value = false
  }

  async function initSubscriptions() {
    if (subscriptionsReady.value) {
      addLog('语音话题订阅已就绪')
      return
    }

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

      subscriptionsReady.value = true
      addLog('已订阅语音交互相关话题')
    } catch (error) {
      console.error('Failed to subscribe to voice topics:', error)
      addLog(`订阅失败: ${error}`)
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

  async function setVolume(volume: number) {
    const normalizedVolume = Math.round(volume)

    if (!Number.isFinite(normalizedVolume) || normalizedVolume < 0 || normalizedVolume > 100) {
      ElMessage.warning('音量范围为 0-100')
      return false
    }

    try {
      const resp = await rosConnection.callService(
        '/voice/device_control',
        'voice_chat_ros/DeviceControl',
        {
          command: 'set_volume',
          param1: '',
          param2: '',
          param_int: normalizedVolume,
          param_bool: false
        }
      ) as CommonResp

      lastDeviceControlResp.value = resp
      addLog(`设置音量: ${normalizedVolume} - ${resp.success ? '成功' : '失败'}${resp.message ? ` - ${resp.message}` : ''}`)

      if (resp.success) ElMessage.success(resp.message || `音量已设置为 ${normalizedVolume}`)
      else ElMessage.error(resp.message || '设置音量失败')

      return resp.success
    } catch (error) {
      console.error('Failed to set volume:', error)
      addLog(`设置音量失败: ${error}`)
      ElMessage.error('设置音量失败')
      return false
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

  async function bridgeTTS(text: string, voice: number, loop: boolean) {
    try {
      // Set parameters
      await rosConnection.publish('/voice_device_bridge_node/tts_text', 'std_msgs/String', { data: text })
      await rosConnection.publish('/voice_device_bridge_node/tts_voice', 'std_msgs/UInt8', { data: voice })
      await rosConnection.publish('/voice_device_bridge_node/tts_loop', 'std_msgs/Bool', { data: loop })

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

  async function bridgeReverbControl(enabled: boolean, mode: number, level: number, delay: number) {
    try {
      await rosConnection.publish('/voice_device_bridge_node/reverb_enabled', 'std_msgs/Bool', { data: enabled })
      await rosConnection.publish('/voice_device_bridge_node/reverb_mode', 'std_msgs/UInt8', { data: mode })
      await rosConnection.publish('/voice_device_bridge_node/reverb_level', 'std_msgs/UInt8', { data: level })
      await rosConnection.publish('/voice_device_bridge_node/reverb_delay', 'std_msgs/UInt16', { data: delay })

      setTimeout(async () => {
        await rosConnection.publish('/voice_device_bridge_node/reverb_apply', 'std_msgs/Empty', {})
      }, 100)

      addLog(`发送语音控制: ${enabled ? '开启' : '关闭'}, 模式${mode}, 强度${level}, 延迟${delay}ms`)
    } catch (error) {
      console.error('Failed to control reverb:', error)
      addLog(`语音控制失败: ${error}`)
      ElMessage.error('语音控制失败')
    }
  }

  async function bridgeReverbStop() {
    try {
      await rosConnection.publish('/voice_device_bridge_node/reverb_enabled', 'std_msgs/Bool', { data: false })
      await rosConnection.publish('/voice_device_bridge_node/reverb_off', 'std_msgs/Empty', {})
      addLog('发送关闭余音指令')
    } catch (error) {
      console.error('Failed to stop reverb:', error)
      addLog(`关闭余音失败: ${error}`)
      ElMessage.error('关闭余音失败')
    }
  }

  return {
    lastTTSResp,
    lastDeviceControlResp,
    logs,
    subscriptionsReady,
    initSubscriptions,
    markSubscriptionsPending,
    sendDeviceControl,
    setVolume,
    addLog,
    bridgeLightControl,
    bridgeLightMode,
    bridgeTTS,
    bridgeTTSStop,
    bridgeReverbControl,
    bridgeReverbStop
  }
})
