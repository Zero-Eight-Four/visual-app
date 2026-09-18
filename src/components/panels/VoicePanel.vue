<template>
  <div class="voice-panel">
    <el-alert
      v-if="!rosStore.isConnected"
      title="未连接到 ROS"
      type="warning"
      description="请先连接 ROS Bridge，再使用语音交互和设备控制。"
      show-icon
      :closable="false"
      class="voice-alert"
    />

    <div class="voice-toolbar">
      <div>
        <h3>语音控制</h3>
        <span>语音合成与设备控制</span>
      </div>
      <el-tag
        round
        :type="voiceStore.subscriptionsReady ? 'success' : 'info'"
      >
        {{ voiceStore.subscriptionsReady ? '响应通道已就绪' : '等待响应通道' }}
      </el-tag>
    </div>

    <section class="panel-section tts-section">
      <div class="section-header">
        <h4>语音合成</h4>
      </div>

      <el-form
        :model="ttsForm"
        label-position="top"
        class="voice-form"
      >
        <el-form-item label="播报文本">
          <el-input
            v-model="ttsForm.text"
            type="textarea"
            :rows="3"
            maxlength="300"
            resize="none"
            show-word-limit
            placeholder="输入需要机器人播报的内容"
          />
        </el-form-item>

        <div class="tts-options">
          <el-form-item label="音色">
            <el-segmented
              v-model="ttsForm.voice"
              :options="voiceOptions"
            />
          </el-form-item>
          <el-form-item label="循环播放">
            <el-switch v-model="ttsForm.loop" />
          </el-form-item>
        </div>

        <div class="action-row">
          <el-button
            type="primary"
            :disabled="!rosStore.isConnected"
            @click="playText"
          >
            播放文本
          </el-button>
          <el-button
            type="danger"
            plain
            :disabled="!rosStore.isConnected"
            @click="stopTTS"
          >
            停止循环
          </el-button>
        </div>
      </el-form>
    </section>

    <div class="control-grid">
      <section class="panel-section">
        <div class="section-header">
          <h4>灯光控制</h4>
        </div>
        <div class="control-row">
          <span>灯光开关</span>
          <el-button-group>
            <el-button
              :disabled="!rosStore.isConnected"
              @click="controlLight(true)"
            >
              开灯
            </el-button>
            <el-button
              :disabled="!rosStore.isConnected"
              @click="controlLight(false)"
            >
              关灯
            </el-button>
          </el-button-group>
        </div>
        <div class="control-row">
          <span>灯光模式</span>
          <el-segmented
            v-model="lightMode"
            :options="lightModeOptions"
            :disabled="!rosStore.isConnected"
            @change="handleLightModeChange"
          />
        </div>
        <div class="control-row">
          <span>设备音量</span>
          <div class="volume-control">
            <el-input-number
              v-model="volumeLevel"
              :min="0"
              :max="100"
              :step="1"
              step-strictly
              controls-position="right"
              :disabled="!rosStore.isConnected || isSettingVolume"
              @keyup.enter="setVolume"
            />
            <el-button
              type="primary"
              :icon="Check"
              :loading="isSettingVolume"
              :disabled="!rosStore.isConnected || isSettingVolume"
              @click="setVolume"
            >
              确定
            </el-button>
          </div>
        </div>
      </section>

      <section class="panel-section status-section">
        <div class="section-header">
          <h4>响应状态</h4>
        </div>
        <div class="status-list">
          <div class="status-item">
            <span>TTS</span>
            <strong>{{ formatResp(voiceStore.lastTTSResp) }}</strong>
          </div>
          <div class="status-item">
            <span>设备</span>
            <strong>{{ formatResp(voiceStore.lastDeviceControlResp) }}</strong>
          </div>
        </div>
      </section>
    </div>

    <section class="panel-section log-section">
      <div class="section-header">
        <h4>操作日志</h4>
        <span class="log-count">{{ voiceStore.logs.length }} 条</span>
      </div>
      <el-scrollbar height="150px">
        <div
          v-if="voiceStore.logs.length === 0"
          class="empty-log"
        >
          暂无语音操作记录
        </div>
        <div
          v-for="log in voiceStore.logs"
          :key="log"
          class="log-line"
        >
          {{ log }}
        </div>
      </el-scrollbar>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import { useRosStore } from '@/stores/ros'
import { useVoiceStore } from '@/stores/voice'
import type { CommonResp } from '@/types/ros'

const rosStore = useRosStore()
const voiceStore = useVoiceStore()

const voiceOptions = [
    { label: '男声', value: 0 },
    { label: '女声', value: 1 }
]

const lightModeOptions = [
    { label: '模式0', value: 0 },
    { label: '模式1', value: 1 }
]

const ttsForm = ref({
    text: '',
    voice: 0,
    loop: false
})

const lightMode = ref<0 | 1>(0)
const volumeLevel = ref(100)
const isSettingVolume = ref(false)

const formatResp = (resp: CommonResp | null) => {
    if (!resp) return '暂无响应'
    return `${resp.success ? '成功' : '失败'} - ${resp.message || '无消息'}`
}

const ensureText = () => {
    if (ttsForm.value.text.trim()) return true
    ElMessage.warning('请输入播报文本')
    return false
}

const playText = () => {
    if (!ensureText()) return
    voiceStore.bridgeTTS(
        ttsForm.value.text.trim(),
        ttsForm.value.voice,
        ttsForm.value.loop
    )
}

const stopTTS = () => {
    voiceStore.bridgeTTSStop()
}

const controlLight = (isOn: boolean) => {
    voiceStore.bridgeLightControl(isOn)
}

const handleLightModeChange = (mode: string | number | boolean) => {
    if (mode !== 0 && mode !== 1) return
    voiceStore.bridgeLightMode(mode)
}

const setVolume = async () => {
    const value = Number(volumeLevel.value)

    if (!Number.isFinite(value) || value < 0 || value > 100) {
        ElMessage.warning('请输入 0-100 的音量')
        return
    }

    isSettingVolume.value = true
    try {
        await voiceStore.setVolume(value)
    } finally {
        isSettingVolume.value = false
    }
}

onMounted(() => {
    if (rosStore.isConnected) {
        voiceStore.initSubscriptions()
    }
})

watch(
    () => rosStore.isConnected,
    (isConnected) => {
        if (isConnected) {
            voiceStore.initSubscriptions()
        } else {
            voiceStore.markSubscriptionsPending()
        }
    }
)
</script>

<style scoped>
.voice-panel {
    padding: 4px 0 12px;
    color: #303133;
}

.voice-alert {
    margin-bottom: 16px;
}

.voice-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
}

.voice-toolbar h3,
.voice-toolbar span,
.section-header h4 {
    margin: 0;
}

.voice-toolbar h3 {
    font-size: 18px;
    font-weight: 600;
    line-height: 1.4;
    color: #1f2937;
}

.voice-toolbar div > span {
    display: block;
    margin-top: 2px;
    font-size: 13px;
    color: #909399;
}

.panel-section {
    min-width: 0;
    padding: 18px;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    background: #fff;
}

.tts-section {
    margin-bottom: 16px;
}

.section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
}

.section-header h4 {
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
}

.voice-form {
    width: 100%;
}

.voice-form :deep(.el-form-item) {
    margin-bottom: 16px;
}

.tts-options {
    display: grid;
    grid-template-columns: minmax(150px, 0.7fr) minmax(110px, 0.5fr);
    gap: 20px;
    align-items: end;
}

.tts-options :deep(.el-form-item__content) {
    min-height: 32px;
}

.tts-options :deep(.el-slider) {
    width: 100%;
}

.action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding-top: 2px;
}

.control-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    margin-bottom: 16px;
}

.control-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 44px;
    padding: 8px 0;
    border-bottom: 1px solid #f0f2f5;
}

.control-row > span {
    flex: 0 0 auto;
    font-size: 14px;
    color: #606266;
}

.volume-control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    min-width: 0;
}

.volume-control :deep(.el-input-number) {
    width: 128px;
}

.status-list {
    display: flex;
    flex-direction: column;
}

.status-item {
    min-width: 0;
    padding: 10px 0;
    border-bottom: 1px solid #f0f2f5;
}

.status-item:first-child {
    padding-top: 0;
}

.status-item:last-child {
    padding-bottom: 0;
    border-bottom: 0;
}

.status-item span {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: #909399;
}

.status-item strong {
    display: block;
    overflow-wrap: anywhere;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
    color: #303133;
}

.log-section {
    padding-bottom: 12px;
}

.log-count {
    font-size: 12px;
    color: #909399;
}

.empty-log,
.log-line {
    font-size: 13px;
    line-height: 1.6;
    color: #606266;
}

.empty-log {
    padding: 28px 0;
    text-align: center;
    color: #909399;
}

.log-line {
    padding: 6px 4px;
    border-bottom: 1px solid #f3f4f6;
}

@media (max-width: 760px) {
    .voice-toolbar {
        align-items: flex-start;
    }

    .tts-options,
    .control-grid {
        grid-template-columns: 1fr;
    }

    .status-section {
        grid-column: auto;
    }

    .panel-section {
        padding: 14px;
    }

    .control-row {
        align-items: flex-start;
        flex-direction: column;
    }

    .volume-control {
        justify-content: flex-start;
        width: 100%;
    }
}
</style>
