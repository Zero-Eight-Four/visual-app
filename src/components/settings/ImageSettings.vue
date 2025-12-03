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

                <!-- 录制控制 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <VideoCamera />
                        </el-icon>
                        <span>录制控制</span>
                    </div>
                    <div class="recording-controls">
                        <el-button v-if="!isRecording" type="danger" size="small" @click="handleStartRecording"
                            style="width: 100%; margin-bottom: 8px;">
                            <el-icon style="margin-right: 5px;">
                                <VideoCamera />
                            </el-icon>
                            开始录制
                        </el-button>
                        <el-button v-else type="success" size="small" @click="handleStopRecording"
                            style="width: 100%; margin-bottom: 8px;">
                            <el-icon style="margin-right: 5px;">
                                <VideoPause />
                            </el-icon>
                            停止录制
                        </el-button>
                        <div v-if="isRecording" class="recording-status">
                            <span class="recording-dot"></span>
                            <span>录制中... {{ recordingTime }}</span>
                        </div>
                    </div>
                </div>
                <div class="settings-section">
                    <el-button size="small" @click="showVideoManagerDialog = true" style="width: 100%;">
                        <el-icon style="margin-right: 5px;">
                            <FolderOpened />
                        </el-icon>
                        视频管理
                    </el-button>
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

        <!-- 录制设置对话框 -->
        <el-dialog v-model="showRecordingDialog" title="录制设置" width="400px">
            <el-form :model="recordingSettings" label-width="120px">
                <el-form-item label="录制模式">
                    <el-radio-group v-model="recordingSettings.mode">
                        <el-radio label="continuous">持续录制</el-radio>
                        <el-radio label="segmented">分段录制</el-radio>
                    </el-radio-group>
                </el-form-item>
                <el-form-item v-if="recordingSettings.mode === 'segmented'" label="分段时长（分钟）">
                    <el-input-number v-model="recordingSettings.segmentMinutes" :min="1" :max="60" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="showRecordingDialog = false">取消</el-button>
                <el-button type="primary" @click="confirmStartRecording">确认</el-button>
            </template>
        </el-dialog>

        <!-- 视频管理对话框 -->
        <el-dialog v-model="showVideoManagerDialog" title="视频管理" width="900px" @open="loadVideoList">
            <el-table :data="videoList" :style="{ width: '100%' }" max-height="500" row-key="folder" :default-expand-all="false" :expand-row-keys="defaultExpandKeys">
                <el-table-column type="expand">
                    <template #default="{ row }">
                        <el-table :data="row.videos" :style="{ width: '100%' }" size="small">
                            <el-table-column prop="name" label="文件名" width="250" show-overflow-tooltip />
                            <el-table-column prop="size" label="大小" width="100" align="right" />
                            <el-table-column prop="modified" label="修改时间" width="180" />
                            <el-table-column label="操作" width="280" fixed="right">
                                <template #default="{ row: video }">
                                    <div class="video-actions">
                                        <el-button size="small" @click="handleRenameVideo(video)">
                                            <el-icon style="margin-right: 4px;">
                                                <Edit />
                                            </el-icon>
                                            重命名
                                        </el-button>
                                        <el-button size="small" type="primary" @click="handleDownloadVideo(video)">
                                            <el-icon style="margin-right: 4px;">
                                                <Download />
                                            </el-icon>
                                            下载
                                        </el-button>
                                        <el-button size="small" type="danger" @click="handleDeleteVideo(video)">
                                            <el-icon style="margin-right: 4px;">
                                                <Delete />
                                            </el-icon>
                                            删除
                                        </el-button>
                                    </div>
                                </template>
                            </el-table-column>
                        </el-table>
                    </template>
                </el-table-column>
                <el-table-column prop="date" label="日期" width="150" />
                <el-table-column prop="count" label="视频数量" width="120" align="center">
                    <template #default="{ row }">
                        <span>{{ row.count }} 个视频</span>
                    </template>
                </el-table-column>
            </el-table>
        </el-dialog>

        <!-- 重命名对话框 -->
        <el-dialog v-model="showRenameDialog" title="重命名视频" width="400px">
            <el-form>
                <el-form-item label="新文件名">
                    <el-input v-model="renameNewName" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="showRenameDialog = false">取消</el-button>
                <el-button type="primary" @click="confirmRenameVideo">确认</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, onUnmounted } from 'vue'
import {
    ElForm,
    ElFormItem,
    ElSelect,
    ElOption,
    ElButton,
    ElIcon,
    ElDialog,
    ElTable,
    ElTableColumn,
    ElInput,
    ElInputNumber,
    ElRadioGroup,
    ElRadio,
    ElMessage,
    ElMessageBox
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
    VideoPause,
    FolderOpened,
    Position,
    Edit,
    Download,
    Delete
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

// 录制相关状态
const isRecording = ref(false)
const showRecordingDialog = ref(false)
const recordingSettings = ref({
    mode: 'continuous', // 'continuous' | 'segmented'
    segmentMinutes: 2
})
const mediaRecorder = ref<MediaRecorder | null>(null)
const recordedChunks = ref<Blob[]>([])
const recordingTime = ref('00:00')
const recordingTimer = ref<number | null>(null)
const segmentTimer = ref<number | null>(null)
const segmentStartTime = ref<number>(0)

// 视频管理相关状态
const showVideoManagerDialog = ref(false)
const videoList = ref<Array<{ folder: string; date: string; count: number; videos: Array<{ name: string; size: string; modified: string; folder: string }> }>>([])
const defaultExpandKeys = ref<string[]>([])
const showRenameDialog = ref(false)
const renameNewName = ref('')
const renameCurrentVideo = ref<{ name: string; folder: string } | null>(null)

// 获取 ImagePanel 的引用（通过 provide/inject）
const imagePanelRef = inject<any>('imagePanelRef', null)

// 获取 canvas 引用
const getCanvas = (): HTMLCanvasElement | null => {
    try {
        if (!imagePanelRef?.value) {
            console.warn('imagePanelRef 未找到')
            return null
        }

        // 检查是否有选中的话题（使用 store 的值，更可靠）
        if (!settingsStore.selectedTopic) {
            console.warn('未选择摄像头话题')
            return null
        }

        // imageCanvas 已经被 Vue 自动解包，直接使用即可
        const canvas = imagePanelRef.value.imageCanvas as HTMLCanvasElement | null

        if (!canvas) {
            console.warn('canvas 引用未找到')
            return null
        }

        // 检查 canvas 是否有内容（宽度和高度大于0）
        if (canvas.width === 0 || canvas.height === 0) {
            console.warn('canvas 尺寸为0:', { width: canvas.width, height: canvas.height })
            return null
        }

        return canvas
    } catch (error) {
        console.error('获取 canvas 引用失败:', error)
        return null
    }
}

// 开始录制
const handleStartRecording = () => {
    const canvas = getCanvas()
    if (!canvas) {
        ElMessage.warning('请先选择摄像头并等待图像加载完成')
        return
    }
    showRecordingDialog.value = true
}

const confirmStartRecording = async () => {
    showRecordingDialog.value = false

    const canvas = getCanvas()
    if (!canvas) {
        ElMessage.error('无法获取图像画布')
        return
    }

    try {
        // 创建 MediaStream 从 canvas
        const stream = canvas.captureStream(30) // 30 FPS

        // 创建 MediaRecorder
        const options: MediaRecorderOptions = {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: 2500000
        }

        // 检查浏览器支持
        if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
            options.mimeType = 'video/webm;codecs=vp8'
            if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
                options.mimeType = 'video/webm'
            }
        }

        const recorder = new MediaRecorder(stream, options)
        mediaRecorder.value = recorder
        recordedChunks.value = []

        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordedChunks.value.push(event.data)
            }
        }

        recorder.onstop = async () => {
            await saveVideo()
        }

        // 开始录制
        recorder.start(1000) // 每1秒收集一次数据
        isRecording.value = true
        segmentStartTime.value = Date.now()
        recordingTime.value = '00:00'

        // 更新录制时间显示
        recordingTimer.value = window.setInterval(() => {
            const elapsed = Math.floor((Date.now() - segmentStartTime.value) / 1000)
            const minutes = Math.floor(elapsed / 60)
            const seconds = elapsed % 60
            recordingTime.value = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        }, 1000)

        // 如果是分段录制，设置定时器
        if (recordingSettings.value.mode === 'segmented') {
            const segmentMs = recordingSettings.value.segmentMinutes * 60 * 1000

            // 定义分段保存和继续录制的函数
            const saveSegmentAndContinue = async () => {
                if (isRecording.value && mediaRecorder.value && mediaRecorder.value.state === 'recording') {
                    // 保存当前分段
                    mediaRecorder.value.stop()

                    // 等待当前分段保存完成
                    await new Promise<void>((resolve) => {
                        const checkSave = () => {
                            if (recordedChunks.value.length === 0) {
                                resolve()
                            } else {
                                setTimeout(checkSave, 100)
                            }
                        }
                        checkSave()
                    })

                    // 创建新的 MediaRecorder 继续录制
                    if (isRecording.value) {
                        const canvas = getCanvas()
                        if (canvas) {
                            const newStream = canvas.captureStream(30)
                            const options: MediaRecorderOptions = {
                                mimeType: 'video/webm;codecs=vp9',
                                videoBitsPerSecond: 2500000
                            }

                            if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
                                options.mimeType = 'video/webm;codecs=vp8'
                                if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
                                    options.mimeType = 'video/webm'
                                }
                            }

                            const newRecorder = new MediaRecorder(newStream, options)
                            mediaRecorder.value = newRecorder
                            recordedChunks.value = []

                            newRecorder.ondataavailable = (event) => {
                                if (event.data && event.data.size > 0) {
                                    recordedChunks.value.push(event.data)
                                }
                            }

                            newRecorder.onstop = async () => {
                                await saveVideo()
                            }

                            newRecorder.start(1000)
                            segmentStartTime.value = Date.now()

                            // 设置下一个分段定时器
                            const nextSegmentMs = recordingSettings.value.segmentMinutes * 60 * 1000
                            segmentTimer.value = window.setTimeout(saveSegmentAndContinue, nextSegmentMs)
                        }
                    }
                }
            }

            segmentTimer.value = window.setTimeout(saveSegmentAndContinue, segmentMs)
        }

        ElMessage.success('录制已开始')
    } catch (error) {
        console.error('开始录制失败:', error)
        ElMessage.error('开始录制失败: ' + (error instanceof Error ? error.message : '未知错误'))
    }
}

// 停止录制
const handleStopRecording = () => {
    if (mediaRecorder.value && mediaRecorder.value.state !== 'inactive') {
        mediaRecorder.value.stop()
    }
    isRecording.value = false

    if (recordingTimer.value !== null) {
        clearInterval(recordingTimer.value)
        recordingTimer.value = null
    }

    if (segmentTimer.value !== null) {
        clearTimeout(segmentTimer.value)
        segmentTimer.value = null
    }

    ElMessage.info('正在保存视频...')
}

// 保存视频
const saveVideo = async () => {
    try {
        const blob = new Blob(recordedChunks.value, { type: 'video/webm' })
        const formData = new FormData()

        // 生成文件名
        const now = new Date()
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
        const fileName = `video_${timestamp}.webm`

        formData.append('video', blob, fileName)

        const response = await fetch('/api/videos/upload', {
            method: 'POST',
            body: formData
        })

        const result = await response.json()

        if (result.success) {
            ElMessage.success('视频保存成功')
            recordedChunks.value = []
        } else {
            ElMessage.error('视频保存失败: ' + (result.error || '未知错误'))
        }
    } catch (error) {
        console.error('保存视频失败:', error)
        ElMessage.error('保存视频失败: ' + (error instanceof Error ? error.message : '未知错误'))
    }
}

// 加载视频列表
const loadVideoList = async () => {
    try {
        const response = await fetch('/api/videos/list')
        const result = await response.json()

        if (result.success) {
            videoList.value = result.folders || []
            // 默认展开第一个文件夹
            if (videoList.value.length > 0) {
                defaultExpandKeys.value = [videoList.value[0].folder]
            }
        } else {
            ElMessage.error('加载视频列表失败: ' + (result.error || '未知错误'))
        }
    } catch (error) {
        console.error('加载视频列表失败:', error)
        ElMessage.error('加载视频列表失败: ' + (error instanceof Error ? error.message : '未知错误'))
    }
}

// 重命名视频
const handleRenameVideo = (video: { name: string; folder: string }) => {
    renameCurrentVideo.value = video
    renameNewName.value = video.name.replace(/\.webm$/, '')
    showRenameDialog.value = true
}

const confirmRenameVideo = async () => {
    if (!renameCurrentVideo.value || !renameNewName.value.trim()) {
        ElMessage.warning('请输入新文件名')
        return
    }

    try {
        const newFileName = renameNewName.value.trim() + '.webm'
        const response = await fetch('/api/videos/rename', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                oldName: renameCurrentVideo.value.name,
                newName: newFileName,
                folder: renameCurrentVideo.value.folder
            })
        })

        const result = await response.json()

        if (result.success) {
            ElMessage.success('重命名成功')
            showRenameDialog.value = false
            await loadVideoList()
        } else {
            ElMessage.error('重命名失败: ' + (result.error || '未知错误'))
        }
    } catch (error) {
        console.error('重命名视频失败:', error)
        ElMessage.error('重命名视频失败: ' + (error instanceof Error ? error.message : '未知错误'))
    }
}

// 下载视频
const handleDownloadVideo = (video: { name: string; folder: string }) => {
    const url = `/api/videos/download?fileName=${encodeURIComponent(video.name)}&folder=${encodeURIComponent(video.folder)}`
    const link = document.createElement('a')
    link.href = url
    link.download = video.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

// 删除视频
const handleDeleteVideo = async (video: { name: string; folder: string }) => {
    try {
        await ElMessageBox.confirm(
            `确定要删除视频 "${video.name}" 吗？`,
            '确认删除',
            {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }
        )

        const response = await fetch('/api/videos/delete', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                fileName: video.name,
                folder: video.folder
            })
        })

        const result = await response.json()

        if (result.success) {
            ElMessage.success('删除成功')
            await loadVideoList()
        } else {
            ElMessage.error('删除失败: ' + (result.error || '未知错误'))
        }
    } catch (error) {
        if (error !== 'cancel') {
            console.error('删除视频失败:', error)
            ElMessage.error('删除视频失败: ' + (error instanceof Error ? error.message : '未知错误'))
        }
    }
}

onUnmounted(() => {
    // 注意：切换面板时组件会被卸载，但不应该停止录制和 PTZ
    // 只在页面真正关闭时才清理资源（由浏览器自动处理）
    // 如果需要手动清理，可以在 beforeunload 事件中处理
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

/* 录制控制样式 */
.recording-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.recording-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background-color: #f0f9ff;
    border-radius: 4px;
    font-size: 12px;
    color: #606266;
}

.recording-dot {
    width: 8px;
    height: 8px;
    background-color: #f56c6c;
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.3;
    }
}

/* 视频操作按钮样式 */
.video-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}

.video-actions .el-button {
    flex: 0 0 auto;
    white-space: nowrap;
}
</style>
