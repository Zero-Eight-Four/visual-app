<template>
    <div class="image-panel">
        <div v-if="rosStore.loadingTopics" class="loading-topics">
            <el-icon class="is-loading"><Loading /></el-icon>
            <p>正在获取话题列表...</p>
        </div>
        <div v-else-if="fetchError" class="no-topic error-state">
            <el-icon class="error-icon"><Warning /></el-icon>
            <p>获取话题列表失败: {{ fetchError }}</p>
            <el-button type="primary" size="small" @click="retryFetchTopics">重试</el-button>
        </div>
        <div v-else-if="!selectedTopic" class="no-topic">
            <p>请在右侧设置中选择摄像头</p>
        </div>
        <div v-else class="image-container">
            <canvas ref="imageCanvas" class="image-canvas"></canvas>
            <div v-if="!hasImage" class="loading">
                <el-icon class="is-loading">
                    <Loading />
                </el-icon>
                <span>等待图像数据...</span>
            </div>
            <!-- 放大/缩小按钮 -->
            <div class="fullscreen-btn">
                <el-button size="small" @click="toggleFullscreen" :title="isExpanded ? '恢复大小' : '放大显示'">
                    <el-icon>
                        <FullScreen v-if="!isExpanded" />
                        <Close v-else />
                    </el-icon>
                </el-button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, onMounted, computed } from 'vue'
import { API_BASE_URL } from '@/config'
import { ElIcon, ElButton, ElMessage } from 'element-plus'
import { Loading, FullScreen, Close, Warning } from '@element-plus/icons-vue'
import { useImageSettingsStore } from '@/stores/imageSettings'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'
import type { RosMessage } from '@/types/ros'

// 定义 props
defineProps<{
    isExpanded?: boolean
}>()

const settingsStore = useImageSettingsStore()
const rosStore = useRosStore()
const imageCanvas = ref<HTMLCanvasElement>()
const hasImage = ref(false)
const selectedTopic = ref('')
let lastBlobUrl: string | null = null
let isProcessing = false
let nextMessage: RosMessage | null = null

// 计算是否有错误信息
const fetchError = computed(() => rosStore.topicFetchError)

// 手动重试
const retryFetchTopics = async () => {
    await rosStore.fetchTopics()
}

// 默认摄像头话题列表（按优先级）
const defaultCameraTopics = [
    '/camera/image_raw/compressed',
    '/camera/image_raw',
    '/usb_cam/image_raw/compressed',
    '/usb_cam/image_raw',
    '/head_camera/rgb/image_raw/compressed',
    '/head_camera/rgb/image_raw'
]

const processMessage = (message: RosMessage) => {
    if (!imageCanvas.value) {
        isProcessing = false
        return
    }

    try {
        let imageBlob: Blob | null = null

        // 处理 sensor_msgs/Image (未压缩图像)
        if (message.encoding && message.width && message.height && message.data) {
            const canvas = imageCanvas.value
            const ctx = canvas.getContext('2d')
            if (!ctx) {
                isProcessing = false
                return
            }

            canvas.width = message.width
            canvas.height = message.height

            const encoding = String(message.encoding).toLowerCase()

            // 处理不同的图像编码格式
            if (encoding.includes('rgb8') || encoding.includes('bgr8')) {
                // RGB/BGR 格式
                let data: Uint8Array

                if (message.data instanceof Uint8Array) {
                    data = message.data
                } else if (typeof message.data === 'string') {
                    // roslib.js 将二进制数据编码为 base64 字符串,需要解码
                    const binaryString = atob(message.data)
                    data = new Uint8Array(binaryString.length)
                    for (let i = 0; i < binaryString.length; i++) {
                        data[i] = binaryString.charCodeAt(i)
                    }
                } else {
                    data = new Uint8Array(message.data)
                }

                const imgData = ctx.createImageData(message.width, message.height)
                const isBGR = encoding.includes('bgr')
                const d = imgData.data
                let idx = 0
                const len = data.length

                if (isBGR) {
                    for (let i = 0; i < len; i += 3) {
                        d[idx] = data[i + 2]     // R
                        d[idx + 1] = data[i + 1] // G
                        d[idx + 2] = data[i]     // B
                        d[idx + 3] = 255         // A
                        idx += 4
                    }
                } else {
                    for (let i = 0; i < len; i += 3) {
                        d[idx] = data[i]         // R
                        d[idx + 1] = data[i + 1] // G
                        d[idx + 2] = data[i + 2] // B
                        d[idx + 3] = 255         // A
                        idx += 4
                    }
                }
                ctx.putImageData(imgData, 0, 0)
                hasImage.value = true
                
                // 处理完成，检查是否有新消息
                checkNextMessage()
                return
            } else if (encoding.includes('mono8') || encoding === '8uc1') {
                // 灰度图像
                let data: Uint8Array

                if (message.data instanceof Uint8Array) {
                    data = message.data
                } else if (typeof message.data === 'string') {
                    // roslib.js 将二进制数据编码为 base64 字符串,需要解码
                    const binaryString = atob(message.data)
                    data = new Uint8Array(binaryString.length)
                    for (let i = 0; i < binaryString.length; i++) {
                        data[i] = binaryString.charCodeAt(i)
                    }
                } else {
                    data = new Uint8Array(message.data)
                }

                const imgData = ctx.createImageData(message.width, message.height)
                const d = imgData.data
                const len = data.length
                let idx = 0
                for (let i = 0; i < len; i++) {
                    const val = data[i]
                    d[idx] = val     // R
                    d[idx + 1] = val // G
                    d[idx + 2] = val // B
                    d[idx + 3] = 255 // A
                    idx += 4
                }
                ctx.putImageData(imgData, 0, 0)
                hasImage.value = true
                
                // 处理完成，检查是否有新消息
                checkNextMessage()
                return
            }
        }

        // 处理 CompressedImage 消息
        if (message.data) {
            // 检查是否是 base64 字符串
            if (typeof message.data === 'string') {
                // 确定图像格式
                let format = 'jpeg' // 默认格式
                if (message.format) {
                    // format 可能是 "jpeg", "png", 或 "image/jpeg", "image/png" 等
                    const formatStr = String(message.format).toLowerCase()
                    if (formatStr.includes('png')) {
                        format = 'png'
                    } else if (formatStr.includes('jpeg') || formatStr.includes('jpg')) {
                        format = 'jpeg'
                    }
                }
                
                // 将 base64 转换为 Blob
                try {
                    const binaryString = atob(message.data)
                    const len = binaryString.length
                    const bytes = new Uint8Array(len)
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i)
                    }
                    imageBlob = new Blob([bytes], { type: `image/${format}` })
                } catch (e) {
                    console.error('Base64 decode error:', e)
                }
            }
            // 处理 Uint8Array 格式 (CompressedImage 的二进制数据)
            else if (message.data instanceof Uint8Array || Array.isArray(message.data)) {
                const uint8Array = message.data instanceof Uint8Array
                    ? message.data
                    : new Uint8Array(message.data)

                let format = 'jpeg'
                if (message.format) {
                    const formatStr = String(message.format).toLowerCase()
                    if (formatStr.includes('png')) {
                        format = 'png'
                    }
                }
                
                imageBlob = new Blob([uint8Array], { type: `image/${format}` })
            }
        }

        if (imageBlob) {
            // 使用 createImageBitmap 直接从 Blob 创建位图，避免使用 URL.createObjectURL 导致 Network 面板刷屏
            createImageBitmap(imageBlob)
                .then(bitmap => {
                    const canvas = imageCanvas.value
                    if (!canvas) {
                        bitmap.close()
                        checkNextMessage()
                        return
                    }

                    const ctx = canvas.getContext('2d')
                    if (!ctx) {
                        bitmap.close()
                        checkNextMessage()
                        return
                    }

                    canvas.width = bitmap.width
                    canvas.height = bitmap.height
                    ctx.drawImage(bitmap, 0, 0)
                    bitmap.close() // 绘制完成后释放位图资源
                    hasImage.value = true
                    
                    checkNextMessage()
                })
                .catch(err => {
                    console.error('Failed to create image bitmap:', err)
                    checkNextMessage()
                })
        } else {
            checkNextMessage()
        }
    } catch (error) {
        console.error('Error processing image message:', error)
        checkNextMessage()
    }
}

const checkNextMessage = () => {
    if (nextMessage) {
        const msg = nextMessage
        nextMessage = null
        // 使用 requestAnimationFrame 避免阻塞 UI
        requestAnimationFrame(() => processMessage(msg))
    } else {
        isProcessing = false
    }
}

const handleImageMessage = (message: RosMessage) => {
    if (isProcessing) {
        // 如果正在处理，只更新最新消息，丢弃中间的消息
        nextMessage = message
        return
    }

    isProcessing = true
    processMessage(message)
}

// 自动选择并订阅默认摄像头话题
// --- 自动采集与任务监听逻辑 ---
const isAutoCapturing = ref(false)
let velocityTimer: ReturnType<typeof setInterval> | null = null

// 发布速度指令控制机器狗
/*
const publishVelocity = async (angularZ: number) => {
    if (!rosConnection.isConnected()) return
    try {
        await rosConnection.publish('/cmd_vel', 'geometry_msgs/Twist', {
            linear: { x: 0, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: angularZ }
        })
    } catch (error) {
        console.error('Failed to publish velocity:', error)
    }
}
*/

// PTZ 控制相关
const publishPtzCommand = async (command: string) => {
    // 映射命令到新的话题 (根据 ImageSettings.vue 中的定义)
    const topicMap: Record<string, string> = {
        'rotate_up': '/siyi_camera_control/rotate_up',
        'rotate_down': '/siyi_camera_control/rotate_down',
        'rotate_left': '/siyi_camera_control/rotate_left',
        'rotate_right': '/siyi_camera_control/rotate_right',
        'zoom_in': '/siyi_camera_control/zoom_in',
        'zoom_out': '/siyi_camera_control/zoom_out',
        'center': '/siyi_camera_control/ptz_stop',
        'stop': '/siyi_camera_control/ptz_stop',
        'spin_left': '/siyi_camera_control/ptz_spin_left',
        'spin_right': '/siyi_camera_control/ptz_spin_right'
    }

    const topic = topicMap[command]
    if (!topic || !rosConnection.isConnected()) return

    try {
        await rosConnection.publish(topic, 'std_msgs/Empty', {})
    } catch (error) {
        console.error(`Failed to publish PTZ command ${topic}:`, error)
    }
}

const stopAutoCapture = async () => {
    // 停止机器狗旋转
    /*
    if (velocityTimer) {
        clearInterval(velocityTimer)
        velocityTimer = null
    }
    await publishVelocity(0)
    */

    // 停止 PTZ (保险起见)
    await publishPtzCommand('stop')
    
    isAutoCapturing.value = false
    
    // 发布 continue 消息
    try {
        await rosConnection.publish('/goal_queue/continue', 'std_msgs/Empty', {})
    } catch (e) {
        console.error('Failed to publish continue message:', e)
    }

    // 任务结束后切换回灵动模式
    /*
    try {
        await rosConnection.publish('/mode_switch', 'std_msgs/String', { data: 'lingdong' })
        console.log('Switched back to lingdong mode')
    } catch (e) {
        console.error('Failed to switch to lingdong mode:', e)
    }
    */

    ElMessage.success('自动采集任务完成')
}

const startAutoCapture = async (folderName: string) => {
    isAutoCapturing.value = true
    ElMessage.info(`开始自动采集任务: ${folderName}`)
    
    // 切换到经典模式 (行走更稳，适合定点旋转)
    /*
    try {
        await rosConnection.publish('/mode_switch', 'std_msgs/String', { data: 'classic' })
        console.log('Switched to classic mode for capture')
    } catch (e) {
        console.error('Failed to switch to classic mode:', e)
    }
    */

    // 1. 开始旋转机器狗
    // 5秒旋转360度(2pi) -> angular.z ≈ 1.256 rad/s
    // 负值向右旋转（顺时针）
    /*
    const angularVelocity = -0.8
    
    publishVelocity(angularVelocity)
    velocityTimer = setInterval(() => {
        publishVelocity(angularVelocity)
    }, 100) // 10Hz 频率发布速度指令
    */
    
    // 2. 采集循环
    const captureInterval = 500 // 500ms 采集一次 (配合更快的旋转速度)
    const duration = 8000 // 8秒旋转一周
    const startTime = Date.now()
    
    const captureTimer = setInterval(async () => {
        // 检查是否超时
        if (Date.now() - startTime > duration) {
            clearInterval(captureTimer)
            await stopAutoCapture()
            return
        }
        
        // 采集并上传
        if (imageCanvas.value) {
            try {
                imageCanvas.value.toBlob(async (blob) => {
                    if (blob) {
                        const formData = new FormData()
                        const fileName = `img_${Date.now()}.png`
                        formData.append('image', blob, fileName)
                        formData.append('folderName', folderName)
                        
                        try {
                            await fetch(`${API_BASE_URL}/images/upload`, {
                                method: 'POST',
                                body: formData
                            })
                        } catch (e) {
                            console.error('Upload failed:', e)
                        }
                    }
                }, 'image/png')
            } catch (e) {
                console.error('Capture failed:', e)
            }
        }
    }, captureInterval)
}

const handleTaskStatusMessage = async (message: any) => {
    if (isAutoCapturing.value) return // 防止并发任务
    
    const taskId = message.data
    console.log(`Received task status: ${taskId}`)
    
    // 生成文件夹名称: YYYYMMDDHHmmss_taskId
    const now = new Date()
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const folderName = `${timestamp}_${taskId}`
    
    startAutoCapture(folderName)
}

const subscribeToTaskStatus = async () => {
    if (!rosConnection.isConnected()) return

    try {
        await rosConnection.subscribe({
            topic: '/goal_queue/task_status',
            messageType: 'std_msgs/Int32',
            callback: handleTaskStatusMessage
        })
    } catch (error) {
        console.error('Failed to subscribe to task status:', error)
    }
}

const autoSubscribeDefaultCamera = async () => {
    if (!rosConnection.isConnected()) {
        return
    }

    try {
        // 如果正在加载话题，等待加载完成，但最长只等45秒
        if (rosStore.loadingTopics) {
            await Promise.race([
                new Promise<void>(resolve => {
                    const unwatch = watch(() => rosStore.loadingTopics, (loading) => {
                        if (!loading) {
                            unwatch()
                            resolve()
                        }
                    })
                }),
                new Promise<void>((_, reject) => 
                    setTimeout(() => reject(new Error('等待话题加载超时')), 45000)
                )
            ]).catch(err => {
                console.warn('[摄像头自动订阅] 等待话题加载超时:', err)
                // 超时后不抛出异常，继续执行后续逻辑(尝试使用已有缓存或什么都不做)
            })
        }

        // 检查是否有话题数据
        if (!rosStore.topics || rosStore.topics.length === 0) {
            // 如果话题为空且未在加载，尝试主动获取
            await rosStore.fetchTopics()
        }
        
        const topics = rosStore.topics || []

        if (topics.length === 0) {
            console.warn('[摄像头自动订阅] 没有可用的话题列表')
            return
        }

        // 查找第一个可用的默认摄像头话题
        let selectedDefault = ''
        for (const defaultTopic of defaultCameraTopics) {
            const found = topics.find(t => t.name === defaultTopic)
            if (found) {
                selectedDefault = defaultTopic
                break
            }
        }

        // 如果没有找到默认话题,查找任何图像话题
        if (!selectedDefault) {
            const imageTopic = topics.find(t =>
                t.messageType.includes('Image') ||
                t.messageType.includes('CompressedImage')
            )
            if (imageTopic) {
                selectedDefault = imageTopic.name
            }
        }

        if (selectedDefault) {
            // 更新 store 中的选中话题
            settingsStore.setSelectedTopic(selectedDefault)
        }
    } catch (err) {
        console.error('[摄像头自动订阅] ❌ 自动订阅摄像头失败:', err)
    }
}

// 监听 ROS 连接状态变化
watch(() => rosStore.isConnected, async (connected) => {
    if (connected) {
        subscribeToTaskStatus()
        // 只有当还没有选中话题时才自动订阅
        if (!settingsStore.selectedTopic) {
            await autoSubscribeDefaultCamera()
        }
    } else {
        // 清理订阅
        if (selectedTopic.value) {
            rosConnection.unsubscribe(selectedTopic.value)
            selectedTopic.value = ''
            hasImage.value = false
        }
        // 清空store中的话题选择
        settingsStore.setSelectedTopic('')
    }
})

// 监听话题列表变化（当话题列表更新时尝试自动订阅）
watch(() => rosStore.topics.length, async (newLength, oldLength) => {
    // 当话题列表从无到有时，如果还没选中话题，自动订阅
    if (newLength > 0 && oldLength === 0 && rosStore.isConnected && !settingsStore.selectedTopic) {
        await autoSubscribeDefaultCamera()
    }
})

// 监听话题变化
watch(() => settingsStore.selectedTopic, async (newTopic, oldTopic) => {
    // 取消旧订阅
    if (oldTopic) {
        rosConnection.unsubscribe(oldTopic)
    }

    selectedTopic.value = newTopic
    hasImage.value = false

    // 订阅新话题
    if (newTopic) {
        // 检查是否已连接
        if (!rosConnection.isConnected()) {
            return
        }

        try {
            // 获取话题的消息类型
            const topics = await rosConnection.getTopics()
            const topicInfo = topics.find(t => t.name === newTopic)

            if (!topicInfo) {
                console.error('Topic not found:', newTopic)
                return
            }

            const messageType = topicInfo.messageType

            await rosConnection.subscribe({
                topic: newTopic,
                messageType: messageType,
                callback: handleImageMessage
            })
        } catch (err) {
            console.error('Failed to subscribe to image topic:', err)
        }
    }
}, { immediate: true })

// 定义 emits
const emit = defineEmits<{
    toggleExpand: []
}>()

// 暴露 canvas 引用和状态给父组件
defineExpose({
    imageCanvas,
    hasImage,
    selectedTopic
})

// 切换放大/缩小
const toggleFullscreen = () => {
    emit('toggleExpand')
}

onMounted(() => {
    // 如果已连接,订阅任务状态
    if (rosStore.isConnected) {
        subscribeToTaskStatus()
    }

    // 如果已经连接且没有选中话题,立即尝试自动订阅
    if (rosStore.isConnected && !settingsStore.selectedTopic) {
        autoSubscribeDefaultCamera()
    }
})

onUnmounted(() => {
    // 清理速度发布定时器
    if (velocityTimer) {
        clearInterval(velocityTimer)
        velocityTimer = null
    }

    if (selectedTopic.value) {
        rosConnection.unsubscribe(selectedTopic.value)
    }
    if (lastBlobUrl && lastBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(lastBlobUrl)
    }
})
</script>

<style scoped>
.image-panel {
    width: 100%;
    height: 100%;
    background-color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
}

.no-topic {
    text-align: center;
    color: #999;
}

.no-topic p {
    font-size: 14px;
}

.error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: #f56c6c;
}

.error-icon {
    font-size: 32px;
}

.loading-topics {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #999;
}

.loading-topics .el-icon {
    font-size: 24px;
}

.image-container {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background-color: #1a1a1a;
}

.image-canvas {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
}

.loading {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: #999;
}

.loading .el-icon {
    font-size: 32px;
}

.fullscreen-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 100;
}

.fullscreen-btn .el-button {
    background-color: rgba(255, 255, 255, 0.95);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.fullscreen-btn .el-button:hover {
    background-color: #ecf5ff;
    border-color: #409eff;
    color: #409eff;
}
</style>
