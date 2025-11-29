<template>
    <div class="settings-panel">
        <el-scrollbar height="100%">
            <div class="settings-content">
                <!-- 摄像头选择 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <VideoCamera />
                        </el-icon>
                        <span>摄像头</span>
                    </div>
                    <el-select id="image-topic-select" v-model="selectedTopic" placeholder="选择摄像头" filterable
                        size="small" @change="handleTopicChange">
                        <el-option v-for="(topic, index) in imageTopics" :key="topic.name"
                            :label="getCameraLabel(index)" :value="topic.name" />
                    </el-select>
                </div>

                <!-- 云台控制 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <Position />
                        </el-icon>
                        <span>云台控制</span>
                    </div>

                    <!-- 方向控制 -->
                    <div class="ptz-grid">
                        <div class="ptz-row">
                            <div class="ptz-cell empty" />
                            <div class="ptz-cell">
                                <el-button class="ptz-btn" :icon="ArrowUp" circle size="small"
                                    @click="publishPtzCommand('ptz_up')" />
                            </div>
                            <div class="ptz-cell empty" />
                        </div>
                        <div class="ptz-row">
                            <div class="ptz-cell">
                                <el-button class="ptz-btn" :icon="ArrowLeft" circle size="small"
                                    @click="publishPtzCommand('ptz_left')" />
                            </div>
                            <div class="ptz-cell">
                                <el-button class="ptz-btn ptz-stop" circle size="small"
                                    @click="publishPtzCommand('ptz_stop')">
                                    <el-icon>
                                        <CircleClose />
                                    </el-icon>
                                </el-button>
                            </div>
                            <div class="ptz-cell">
                                <el-button class="ptz-btn" :icon="ArrowRight" circle size="small"
                                    @click="publishPtzCommand('ptz_right')" />
                            </div>
                        </div>
                        <div class="ptz-row">
                            <div class="ptz-cell empty" />
                            <div class="ptz-cell">
                                <el-button class="ptz-btn" :icon="ArrowDown" circle size="small"
                                    @click="publishPtzCommand('ptz_down')" />
                            </div>
                            <div class="ptz-cell empty" />
                        </div>
                    </div>

                    <!-- 缩放和旋转 -->
                    <div class="ptz-controls">
                        <div class="control-group">
                            <span class="control-label">缩放</span>
                            <div class="control-buttons">
                                <el-button class="ptz-btn" :icon="ZoomOut" circle size="small"
                                    @click="publishPtzCommand('ptz_zoom_out')" />
                                <el-button class="ptz-btn" :icon="ZoomIn" circle size="small"
                                    @click="publishPtzCommand('ptz_zoom_in')" />
                            </div>
                        </div>
                        <div class="control-group">
                            <span class="control-label">旋转</span>
                            <div class="control-buttons">
                                <el-button class="ptz-btn" circle size="small"
                                    @click="publishPtzCommand('ptz_spin_left')">
                                    <el-icon>
                                        <RefreshLeft />
                                    </el-icon>
                                </el-button>
                                <el-button class="ptz-btn" circle size="small"
                                    @click="publishPtzCommand('ptz_spin_right')">
                                    <el-icon>
                                        <RefreshRight />
                                    </el-icon>
                                </el-button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </el-scrollbar>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import {
    ElForm,
    ElFormItem,
    ElSelect,
    ElOption,
    ElButton,
    ElIcon
} from 'element-plus'
import {
    ArrowUp,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ZoomIn,
    ZoomOut,
    CircleClose,
    RefreshLeft,
    RefreshRight,
    VideoCamera,
    Position
} from '@element-plus/icons-vue'
import { useImageSettingsStore } from '@/stores/imageSettings'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'

const settingsStore = useImageSettingsStore()
const rosStore = useRosStore()

const selectedTopic = ref(settingsStore.selectedTopic)

const imageTopics = computed(() => {
    return rosStore.topics.filter((t: { messageType: string }) =>
        t.messageType.includes('Image') ||
        t.messageType.includes('CompressedImage')
    )
})

const getCameraLabel = (index: number): string => {
    return `摄像头${index + 1}`
}

const handleTopicChange = (value: string) => {
    settingsStore.setSelectedTopic(value)
}

// 同步 store 变化
watch(() => settingsStore.selectedTopic, (val) => { selectedTopic.value = val })

// PTZ 控制相关
const publishPtzCommand = async (command: string) => {
    const topic = `/camera/${command}`

    if (!rosConnection.isConnected()) {
        return
    }

    try {
        await rosConnection.publish(
            topic,
            'std_msgs/Empty',
            {}
        )
    } catch (error) {
        console.error(`Failed to publish PTZ command ${topic}:`, error)
    }
}

onUnmounted(() => {
    // 离开时停止云台运动
    publishPtzCommand('ptz_stop')
})
</script>

<style scoped>
.settings-panel {
    height: 100%;
    overflow: hidden;
}

.settings-content {
    padding: 12px;
}

.settings-section {
    margin-bottom: 20px;
}

.settings-section:last-child {
    margin-bottom: 0;
}

.section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 600;
    color: #333;
}

.section-header .el-icon {
    font-size: 16px;
    color: #409EFF;
}

:deep(.el-select) {
    width: 100%;
}

/* PTZ 网格布局 */
.ptz-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 12px 0;
}

.ptz-row {
    display: flex;
    gap: 4px;
    justify-content: center;
}

.ptz-cell {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.ptz-cell.empty {
    visibility: hidden;
}

.ptz-btn {
    transition: all 0.2s;
}

.ptz-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
}

.ptz-btn:active {
    transform: scale(0.95);
}

.ptz-stop {
    background: #f5f5f5;
}

.ptz-stop:hover {
    background: #f56c6c;
    color: white;
    border-color: #f56c6c;
}

/* 缩放和旋转控制 */
.ptz-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #f0f0f0;
}

.control-group {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.control-label {
    font-size: 12px;
    color: #666;
    font-weight: 500;
}

.control-buttons {
    display: flex;
    gap: 8px;
}
</style>
