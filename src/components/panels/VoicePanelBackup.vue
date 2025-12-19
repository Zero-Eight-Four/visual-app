<template>
    <div class="voice-panel">
        <div v-if="!rosStore.isConnected" class="connection-warning">
            <el-alert
                title="未连接到 ROS"
                type="warning"
                description="请先连接到 ROS Bridge 以使用语音交互功能"
                show-icon
                :closable="false"
            />
        </div>

        <div class="voice-section">
            <h3>TTS 语音合成</h3>
            <el-form :model="ttsForm" label-width="80px">
                <el-form-item label="文本">
                    <el-input v-model="ttsForm.text" type="textarea" :rows="2" placeholder="请输入要播放的文本" />
                </el-form-item>
                <el-row :gutter="20">
                    <el-col :span="12">
                        <el-form-item label="声音">
                            <el-select v-model="ttsForm.voice" placeholder="选择声音">
                                <el-option label="男声" :value="0" />
                                <el-option label="女声" :value="1" />
                            </el-select>
                        </el-form-item>
                    </el-col>
                    <el-col :span="12">
                        <el-form-item label="循环">
                            <el-switch v-model="ttsForm.loop" />
                        </el-form-item>
                    </el-col>
                </el-row>
                <el-form-item label="音量">
                    <el-slider v-model="ttsForm.volume" />
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" @click="sendTTS">发送 TTS</el-button>
                    <el-button type="danger" @click="stopTTS" v-if="ttsForm.loop">停止循环</el-button>
                </el-form-item>
            </el-form>
        </div>

        <el-divider />

        <div class="voice-section">
            <h3>设备控制</h3>
            <el-row :gutter="20">
                <el-col :span="24">
                    <el-card shadow="never" class="control-card">
                        <template #header>灯光控制</template>
                        <div class="control-item">
                            <span>开关灯</span>
                            <el-button-group>
                                <el-button type="primary" @click="controlLight(true)">开灯</el-button>
                                <el-button @click="controlLight(false)">关灯</el-button>
                            </el-button-group>
                        </div>
                        <div class="control-item">
                            <span>模式</span>
                            <el-button-group>
                                <el-button size="small" @click="setLightMode(0)">关闭 (模式0)</el-button>
                                <el-button size="small" @click="setLightMode(1)">红蓝闪烁 (模式1)</el-button>
                            </el-button-group>
                        </div>
                    </el-card>
                </el-col>
            </el-row>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useVoiceStore } from '@/stores/voice'
import { useRosStore } from '@/stores/ros'

const voiceStore = useVoiceStore()
const rosStore = useRosStore()

const ttsForm = ref({
    text: '',
    voice: 0,
    loop: false,
    volume: 80
})

const sendTTS = () => {
    if (!ttsForm.value.text) {
        ElMessage.warning('请输入文本')
        return
    }
    voiceStore.bridgeTTS(
        ttsForm.value.text,
        ttsForm.value.voice,
        ttsForm.value.loop,
        ttsForm.value.volume
    )
}

const stopTTS = () => {
    voiceStore.bridgeTTSStop()
}

const controlLight = (isOn: boolean) => {
    voiceStore.bridgeLightControl(isOn)
}

const setLightMode = (mode: 0 | 1) => {
    voiceStore.bridgeLightMode(mode)
}

onMounted(() => {
    voiceStore.initSubscriptions()
})
</script>

<style scoped>
.voice-panel {
    padding: 20px;
}

.connection-warning {
    margin-bottom: 20px;
}

.voice-section {
    margin-bottom: 20px;
}

.voice-section h3 {
    margin-bottom: 15px;
    font-size: 16px;
    font-weight: bold;
    color: #333;
}

.control-card {
    height: 100%;
}

.control-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
}

.control-item span {
    font-size: 14px;
}
</style>
