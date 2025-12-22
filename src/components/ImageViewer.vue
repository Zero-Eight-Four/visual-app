<template>
    <div class="image-viewer">
        <div class="viewer-header">
            <h3>图像显示</h3>
            <div class="header-controls">
                <el-select v-model="selectedImageTopic" placeholder="选择摄像头" size="small" style="width: 200px"
                    @change="handleTopicChange">
                    <el-option v-for="topic in imageTopics" :key="topic.name" :label="topic.name" :value="topic.name" />
                </el-select>
                <el-button-group style="margin-left: 10px;">
                    <el-button v-if="!isRecording" type="danger" size="small" @click="handleStartRecording">
                        <el-icon style="margin-right: 5px;">
                            <VideoCamera />
                        </el-icon>
                        开始录制
                    </el-button>
                    <el-button v-else type="success" size="small" @click="handleStopRecording">
                        <el-icon style="margin-right: 5px;">
                            <VideoPause />
                        </el-icon>
                        停止录制
                    </el-button>
                    <el-button size="small" @click="showVideoManagerDialog = true">
                        <el-icon style="margin-right: 5px;">
                            <FolderOpened />
                        </el-icon>
                        视频管理
                    </el-button>
                </el-button-group>
            </div>
        </div>
        <div class="image-container">
            <canvas ref="imageCanvas" class="image-canvas"></canvas>
            <div v-if="!currentImage" class="no-image">
                <span>{{ selectedImageTopic ? '等待图像数据...' : '请选择摄像头' }}</span>
            </div>
            <div v-if="isRecording" class="recording-indicator">
                <span class="recording-dot"></span>
                <span>录制中... {{ recordingTime }}</span>
            </div>
        </div>

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
        <el-dialog v-model="showVideoManagerDialog" title="视频管理" width="800px" @open="loadVideoList">
            <el-table :data="videoList" style="width: 100%" max-height="400">
                <el-table-column prop="name" label="文件名" width="300" />
                <el-table-column prop="size" label="大小" width="120">
                    <template #default="{ row }">
                        {{ typeof row.size === 'number' ? (row.size / 1024 / 1024).toFixed(2) + ' MB' : row.size }}
                    </template>
                </el-table-column>
                <el-table-column prop="modified" label="修改时间" width="180">
                    <template #default="{ row }">
                        {{ typeof row.modified === 'number' ? new Date(row.modified * 1000).toLocaleString() : row.modified }}
                    </template>
                </el-table-column>
                <el-table-column label="操作" width="200" fixed="right">
                    <template #default="{ row }">
                        <el-button size="small" @click="handleRenameVideo(row)">重命名</el-button>
                        <el-button size="small" type="primary" @click="handleDownloadVideo(row)">下载</el-button>
                        <el-button size="small" type="danger" @click="handleDeleteVideo(row)">删除</el-button>
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
import { API_BASE_URL } from '@/config'
import { ref, computed, onUnmounted } from 'vue'
import { ElSelect, ElOption, ElButton, ElButtonGroup, ElDialog, ElForm, ElFormItem, ElRadioGroup, ElRadio, ElInputNumber, ElTable, ElTableColumn, ElInput, ElMessage, ElMessageBox, ElIcon } from 'element-plus'
import { VideoCamera, VideoPause, FolderOpened } from '@element-plus/icons-vue'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'
import type { RosMessage } from '@/types/ros'

const rosStore = useRosStore()
const imageCanvas = ref<HTMLCanvasElement>()
const currentImage = ref<string | null>(null)
const selectedImageTopic = ref<string>('')

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
const videoList = ref<Array<{ name: string; size: string; modified: string }>>([])
const showRenameDialog = ref(false)
const renameNewName = ref('')
const renameCurrentVideo = ref<{ name: string } | null>(null)

const imageTopics = computed(() => rosStore.imageTopics)

const handleTopicChange = (topic: string) => {
    if (!topic) return

    // 取消之前的订阅
    if (selectedImageTopic.value) {
        rosConnection.unsubscribe(selectedImageTopic.value)
    }

    // 订阅新话题
    rosConnection.subscribe({
        topic,
        messageType: 'sensor_msgs/CompressedImage',
        callback: handleImageMessage
    })
}

const handleImageMessage = (message: RosMessage) => {
    if (!imageCanvas.value) return

    // 处理压缩图像
    if (message.format && message.data) {
        const imageData = 'data:image/' + message.format.split('/')[1] + ';base64,' + message.data
        const img = new Image()

        img.onload = () => {
            const canvas = imageCanvas.value
            if (!canvas) return

            const ctx = canvas.getContext('2d')
            if (!ctx) return

            canvas.width = img.width
            canvas.height = img.height
            ctx.drawImage(img, 0, 0)
            currentImage.value = imageData

            // 如果正在录制，将当前帧添加到录制流
            if (isRecording.value && mediaRecorder.value && mediaRecorder.value.state === 'recording') {
                // MediaRecorder 会自动处理帧，这里不需要手动添加
            }
        }

        img.src = imageData
    }
}

// 开始录制
const handleStartRecording = () => {
    if (!imageCanvas.value || !currentImage.value) {
        ElMessage.warning('请先选择摄像头并等待图像加载')
        return
    }
    showRecordingDialog.value = true
}

const confirmStartRecording = async () => {
    showRecordingDialog.value = false

    try {
        // 创建 MediaStream 从 canvas
        const stream = imageCanvas.value!.captureStream(30) // 30 FPS

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
                    if (isRecording.value && imageCanvas.value) {
                        const newStream = imageCanvas.value.captureStream(30)
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

        const response = await fetch(`${API_BASE_URL}/videos/upload`, {
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
        const response = await fetch(`${API_BASE_URL}/videos/list`)
        const result = await response.json()

        if (result.dates && result.videos) {
            // Flatten videos for table
            const allVideos: any[] = []
            result.dates.forEach((date: string) => {
                if (result.videos[date]) {
                    const folderName = date.replace(/-/g, '')
                    const videosWithFolder = result.videos[date].map((v: any) => ({ ...v, folder: folderName }))
                    allVideos.push(...videosWithFolder)
                }
            })
            videoList.value = allVideos
        } else if (result.success && result.folders) {
             // Fallback for old format
             const allVideos: any[] = []
             result.folders.forEach((folder: any) => {
                 if (folder.videos) {
                     allVideos.push(...folder.videos)
                 }
             })
             videoList.value = allVideos
        } else if (result.success && result.videos) {
            // Another potential old format
            videoList.value = result.videos || []
        } else {
            ElMessage.error('加载视频列表失败: 格式错误')
        }
    } catch (error) {
        console.error('加载视频列表失败:', error)
        ElMessage.error('加载视频列表失败: ' + (error instanceof Error ? error.message : '未知错误'))
    }
}

// 重命名视频
const handleRenameVideo = (video: { name: string }) => {
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
        const response = await fetch(`${API_BASE_URL}/videos/rename`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                oldName: renameCurrentVideo.value.name,
                newName: newFileName
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
const handleDownloadVideo = (video: { name: string; folder?: string }) => {
    console.log('Download video:', video)
    console.log('Current origin:', window.location.origin)

    let path = `/api/videos/download?fileName=${encodeURIComponent(video.name)}`
    if (video.folder) {
        path += `&folder=${encodeURIComponent(video.folder)}`
    }
    
    // Construct absolute URL using current origin to ensure protocol matches
    let url = new URL(path, window.location.origin).href
    if (import.meta.env.PROD) {
        const baseUrl = API_BASE_URL.replace(/\/api$/, '')
        url = `${baseUrl}${path}`
    }
    console.log('Download URL:', url)

    const link = document.createElement('a')
    link.href = url
    link.download = video.name
    link.target = '_blank' // Open in new tab to avoid mixed content issues
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

// 删除视频
const handleDeleteVideo = async (video: { name: string; folder?: string }) => {
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

        const response = await fetch(`${API_BASE_URL}/videos/delete`, {
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
    if (selectedImageTopic.value) {
        rosConnection.unsubscribe(selectedImageTopic.value)
    }

    // 清理录制相关资源
    if (mediaRecorder.value && mediaRecorder.value.state !== 'inactive') {
        mediaRecorder.value.stop()
    }

    if (recordingTimer.value !== null) {
        clearInterval(recordingTimer.value)
    }

    if (segmentTimer.value !== null) {
        clearTimeout(segmentTimer.value)
    }
})
</script>

<style scoped>
.image-viewer {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.viewer-header {
    padding: 10px 15px;
    background-color: #2a2a2a;
    border-bottom: 1px solid #3a3a3a;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.header-controls {
    display: flex;
    align-items: center;
}

.viewer-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
}

.image-container {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    background-color: #1a1a1a;
}

.image-canvas {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
}

.no-image {
    color: #8c8c8c;
    font-size: 14px;
}

.recording-indicator {
    position: absolute;
    top: 10px;
    right: 10px;
    background-color: rgba(0, 0, 0, 0.7);
    color: #fff;
    padding: 8px 12px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
}

.recording-dot {
    width: 10px;
    height: 10px;
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
</style>
