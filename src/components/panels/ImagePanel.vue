<template>
  <div class="image-panel">
    <div
      v-if="rosStore.loadingTopics"
      class="loading-topics"
    >
      <el-icon class="is-loading">
        <Loading />
      </el-icon>
      <p>正在获取话题列表...</p>
    </div>
    <div
      v-else-if="fetchError"
      class="no-topic error-state"
    >
      <el-icon class="error-icon">
        <Warning />
      </el-icon>
      <p>获取话题列表失败: {{ fetchError }}</p>
      <el-button
        type="primary"
        size="small"
        @click="retryFetchTopics"
      >
        重试
      </el-button>
    </div>
    <div
      v-else-if="!selectedTopic"
      class="no-topic"
    >
      <p>请在右侧设置中选择摄像头</p>
    </div>
    <div
      v-else
      class="image-container"
    >
      <canvas
        ref="imageCanvas"
        class="image-canvas"
      />
      <div
        v-if="!hasImage"
        class="loading"
      >
        <el-icon class="is-loading">
          <Loading />
        </el-icon>
        <span>等待图像数据...</span>
      </div>
      <!-- 放大/缩小按钮 -->
      <div class="fullscreen-btn">
        <el-button
          size="small"
          :title="isExpanded ? '恢复大小' : '放大显示'"
          @click="toggleFullscreen"
        >
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
    '/camera/visible/image_raw/compressed',
    '/camera/visible/image_raw',
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
const isAutoCapturing = computed(() => rosStore.isAutoCapturing)
let captureSessionId = 0

const cancelAutoCaptureOnDisconnect = () => {
    ++captureSessionId
    if (!rosStore.isAutoCapturing) return
    rosStore.setAutoCapturing(false)
    ElMessage.warning('连接中断，自动采集已停止，请确认后再继续任务')
}


const publishPtzCommand = async (command: string) => {
    const topicMap: Record<string, string> = {
        rotate_up: '/camera_control/tilt_up',
        rotate_down: '/camera_control/tilt_down',
        rotate_left: '/camera_control/continuous_pan_left',
        rotate_right: '/camera_control/continuous_pan_right',
        center: '/camera_control/center',
        stop: '/camera_control/stop'
    }
    const topic = topicMap[command]
    if (!topic || !rosConnection.isConnected()) return

    await rosConnection.publish(topic, 'std_msgs/Empty', {})
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const uploadCurrentFrame = async (folderName: string) => {
    const canvas = imageCanvas.value
    if (!canvas || !hasImage.value) {
        throw new Error('暂无可采集的摄像头图像')
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob)
            } else {
                reject(new Error('生成采集图片失败'))
            }
        }, 'image/png')
    })

    const formData = new FormData()
    formData.append('image', blob, `img_${Date.now()}.png`)
    formData.append('folderName', folderName)
    formData.append('sourceUrl', rosStore.connectionState.url)

    const response = await fetch(`${API_BASE_URL}/images/upload`, {
        method: 'POST',
        body: formData
    })
    if (!response.ok) {
        throw new Error(`上传采集图片失败: HTTP ${response.status}`)
    }
}

const runThreeLevelScan = async (sessionId: number) => {
    const SETTLE_MS = 1000
    const TILT_PULSE_MS = 2000
    const PAN_HALF_WIDTH_MS = 5000
    const PAN_FULL_WIDTH_MS = PAN_HALF_WIDTH_MS * 2
    const isCurrentSession = () => isAutoCapturing.value && captureSessionId === sessionId && rosConnection.isConnected()

    const runPan = async (command: 'rotate_left' | 'rotate_right', duration: number) => {
        if (!isCurrentSession()) return false
        await publishPtzCommand(command)
        await sleep(duration)
        if (!isCurrentSession()) return false
        await publishPtzCommand('stop')
        if (!isCurrentSession()) return false
        await sleep(SETTLE_MS)
        return isCurrentSession()
    }

    const pulseTilt = async (command: 'rotate_up' | 'rotate_down', count: number) => {
        for (let i = 0; i < count; i += 1) {
            if (!isCurrentSession()) return false
            await publishPtzCommand(command)
            await sleep(TILT_PULSE_MS)
            if (!isCurrentSession()) return false
            await publishPtzCommand('stop')
            if (!isCurrentSession()) return false
            await sleep(SETTLE_MS)
        }
        return isCurrentSession()
    }

    // 从中心移动到左上，依次扫描上层、中层、下层。
    if (!await pulseTilt('rotate_up', 2)) return
    if (!await runPan('rotate_left', PAN_HALF_WIDTH_MS)) return
    if (!await runPan('rotate_right', PAN_FULL_WIDTH_MS)) return
    if (!await pulseTilt('rotate_down', 2)) return
    if (!await runPan('rotate_left', PAN_FULL_WIDTH_MS)) return
    if (!await pulseTilt('rotate_down', 2)) return
    await runPan('rotate_right', PAN_FULL_WIDTH_MS)
}

const stopAutoCapture = async (succeeded: boolean) => {
    const stoppingSession = ++captureSessionId

    // 扫描完成或异常退出时，先停止，再明确发送居中指令。
    try {
        await publishPtzCommand('stop')
        if (captureSessionId !== stoppingSession || !rosConnection.isConnected()) return
        await publishPtzCommand('center')
    } catch (error) {
        console.error('Failed to center PTZ:', error)
    }

    if (captureSessionId !== stoppingSession || !rosConnection.isConnected()) return
    rosStore.setAutoCapturing(false)

    // 图片上传结束后继续导航。
    try {
        await rosConnection.publish('/goal_queue/continue', 'std_msgs/Empty', {})
    } catch (e) {
        console.error('Failed to publish continue message:', e)
    }

    if (succeeded) {
        ElMessage.success('自动采集任务完成')
    }
}

const startAutoCapture = async (folderName: string) => {
    const sessionId = ++captureSessionId
    rosStore.setAutoCapturing(true, folderName)
    ElMessage.info(`开始自动采集任务: ${folderName}`)

    let succeeded = false
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined
    const captureFrames = async () => {
        while (isAutoCapturing.value && captureSessionId === sessionId) {
            try {
                await uploadCurrentFrame(folderName)
            } catch (error) {
                console.error('Capture frame failed:', error)
            }
            await sleep(1000)
        }
    }

    try {
        const capturePromise = captureFrames()
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutTimer = setTimeout(() => reject(new Error('三层扫描超时')), 90000)
        })
        await Promise.race([runThreeLevelScan(sessionId), timeoutPromise])
        if (captureSessionId !== sessionId || !rosConnection.isConnected()) return
        await uploadCurrentFrame(folderName)
        succeeded = true
        void capturePromise
    } catch (error) {
        console.error('Auto capture failed:', error)
        if (captureSessionId === sessionId) {
            ElMessage.error(error instanceof Error ? error.message : '自动采集图片失败')
        }
    } finally {
        if (timeoutTimer) clearTimeout(timeoutTimer)
        if (captureSessionId === sessionId) {
            await stopAutoCapture(succeeded)
        }
    }
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
            key: 'image-panel-task-status',
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

let cameraSubscriptionVersion = 0

// 监听 ROS 连接状态变化
watch([() => rosStore.isConnected, () => rosStore.connectionState.reconnecting], async ([connected]) => {
    if (connected) {
        subscribeToTaskStatus()
        if (settingsStore.selectedTopic) {
            await subscribeToSelectedCamera()
        } else {
            await autoSubscribeDefaultCamera()
        }
    } else {
        cancelAutoCaptureOnDisconnect()
        if (rosConnection.isReconnecting()) return
        // 自动重连时保留摄像头选择，由连接模块恢复订阅。
        // 清理订阅
        if (selectedTopic.value) {
            rosConnection.unsubscribe(selectedTopic.value, 'image-panel-camera')
            selectedTopic.value = ''
            hasImage.value = false
        }
        // 清空store中的话题选择
        settingsStore.setSelectedTopic('')
    }
}, { flush: 'sync' })

// 监听话题列表变化（当话题列表更新时尝试自动订阅）
watch(() => rosStore.topics.length, async (newLength, oldLength) => {
    // 当话题列表从无到有时，如果还没选中话题，自动订阅
    if (newLength > 0 && oldLength === 0 && rosStore.isConnected && !settingsStore.selectedTopic) {
        await autoSubscribeDefaultCamera()
    }
})

const subscribeToSelectedCamera = async () => {
    const version = ++cameraSubscriptionVersion
    const topic = settingsStore.selectedTopic
    if (!topic || !rosConnection.isConnected()) return
    try {
        const topics = await rosConnection.getTopics()
        if (version !== cameraSubscriptionVersion || settingsStore.selectedTopic !== topic || !rosConnection.isConnected()) return
        const topicInfo = topics.find(t => t.name === topic)
        if (!topicInfo) return
        await rosConnection.subscribe({
            topic,
            key: 'image-panel-camera',
            messageType: topicInfo.messageType,
            callback: handleImageMessage
        })
    } catch (error) {
        if (version === cameraSubscriptionVersion && rosConnection.isConnected()) {
            console.error('Failed to subscribe to image topic:', error)
        }
    }
}

// Selection may change offline or while discovery is in flight. Recovery always
// reconciles the latest choice, and old discovery replies cannot re-subscribe it.
watch(() => settingsStore.selectedTopic, async (newTopic, oldTopic) => {
    ++cameraSubscriptionVersion
    if (oldTopic) rosConnection.unsubscribe(oldTopic, 'image-panel-camera')
    selectedTopic.value = newTopic
    hasImage.value = false
    await subscribeToSelectedCamera()
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

    // 检查是否有未完成的采集任务
    if (rosStore.isAutoCapturing && rosStore.currentCaptureFolder) {
        ElMessage.warning('检测到上次未完成的自动采集任务，尝试恢复...')
        // 恢复采集逻辑：重新调用 startAutoCapture 并传入相同的 folderName
        startAutoCapture(rosStore.currentCaptureFolder)
    }
})

onUnmounted(() => {
    ++cameraSubscriptionVersion
    rosConnection.unsubscribe('/goal_queue/task_status', 'image-panel-task-status')
    // 使已卸载组件的采集任务失效，由新组件恢复未完成任务。
    captureSessionId += 1

    if (selectedTopic.value) {
        rosConnection.unsubscribe(selectedTopic.value, 'image-panel-camera')
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
