<template>
    <div ref="imagePanelRef" class="image-panel">
        <div v-if="!selectedTopic" class="no-topic">
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
import { ref, watch, onUnmounted, onMounted } from 'vue'
import { ElIcon, ElButton } from 'element-plus'
import { Loading, FullScreen, Close } from '@element-plus/icons-vue'
import { useImageSettingsStore } from '@/stores/imageSettings'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'
import type { RosMessage } from '@/types/ros'

// 定义 props
const props = defineProps<{
    isExpanded?: boolean
}>()

const settingsStore = useImageSettingsStore()
const rosStore = useRosStore()
const imagePanelRef = ref<HTMLDivElement>()
const imageCanvas = ref<HTMLCanvasElement>()
const hasImage = ref(false)
const selectedTopic = ref('')

// 默认摄像头话题列表（按优先级）
const defaultCameraTopics = [
    '/camera/image_raw/compressed',
    '/camera/image_raw',
    '/usb_cam/image_raw/compressed',
    '/usb_cam/image_raw',
    '/head_camera/rgb/image_raw/compressed',
    '/head_camera/rgb/image_raw'
]

const handleImageMessage = (message: RosMessage) => {
    if (!imageCanvas.value) return

    try {
        let imageData: string | null = null

        // 处理 sensor_msgs/Image (未压缩图像)
        if (message.encoding && message.width && message.height && message.data) {
            const canvas = imageCanvas.value
            const ctx = canvas.getContext('2d')
            if (!ctx) return

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

                for (let i = 0; i < data.length; i += 3) {
                    const idx = (i / 3) * 4
                    if (isBGR) {
                        imgData.data[idx] = data[i + 2]     // R
                        imgData.data[idx + 1] = data[i + 1] // G
                        imgData.data[idx + 2] = data[i]     // B
                    } else {
                        imgData.data[idx] = data[i]         // R
                        imgData.data[idx + 1] = data[i + 1] // G
                        imgData.data[idx + 2] = data[i + 2] // B
                    }
                    imgData.data[idx + 3] = 255 // A
                }
                ctx.putImageData(imgData, 0, 0)
                hasImage.value = true
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
                for (let i = 0; i < data.length; i++) {
                    const idx = i * 4
                    imgData.data[idx] = data[i]     // R
                    imgData.data[idx + 1] = data[i] // G
                    imgData.data[idx + 2] = data[i] // B
                    imgData.data[idx + 3] = 255     // A
                }
                ctx.putImageData(imgData, 0, 0)
                hasImage.value = true
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
                imageData = `data:image/${format};base64,${message.data}`
            }
            // 处理 Uint8Array 格式 (CompressedImage 的二进制数据)
            else if (message.data instanceof Uint8Array || Array.isArray(message.data)) {
                const uint8Array = message.data instanceof Uint8Array
                    ? message.data
                    : new Uint8Array(message.data)

                // 转换为 base64
                let binary = ''
                const len = uint8Array.byteLength
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(uint8Array[i])
                }
                const base64 = btoa(binary)

                let format = 'jpeg'
                if (message.format) {
                    const formatStr = String(message.format).toLowerCase()
                    if (formatStr.includes('png')) {
                        format = 'png'
                    }
                }
                imageData = `data:image/${format};base64,${base64}`
            }
        }

        if (imageData) {
            const img = new Image()

            img.onload = () => {
                const canvas = imageCanvas.value
                if (!canvas) return

                const ctx = canvas.getContext('2d')
                if (!ctx) return

                canvas.width = img.width
                canvas.height = img.height
                ctx.drawImage(img, 0, 0)
                hasImage.value = true
            }

            img.onerror = (err) => {
                console.error('Failed to load image:', err)
            }

            img.src = imageData
        }
    } catch (error) {
        console.error('Error processing image message:', error)
    }
}

// 自动选择并订阅默认摄像头话题
const autoSubscribeDefaultCamera = async () => {
    if (!rosConnection.isConnected()) {
        return
    }

    try {
        // 获取所有可用话题（添加超时和错误处理）
        let topics: any[] = []
        try {
            topics = await Promise.race([
                rosConnection.getTopics(),
                new Promise<any[]>((_, reject) => 
                    setTimeout(() => reject(new Error('获取话题列表超时')), 5000)
                )
            ])
        } catch (error) {
            // 如果获取话题失败，尝试使用 store 中已保存的话题
            console.warn('[摄像头自动订阅] 获取话题列表失败，使用已保存的话题列表:', error)
            topics = rosStore.topics || []
            
            // 如果 store 中也没有话题，直接返回
            if (topics.length === 0) {
                console.warn('[摄像头自动订阅] 没有可用的话题列表')
                return
            }
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
        // 延迟等待话题列表更新
        setTimeout(async () => {
            // 只有当还没有选中话题时才自动订阅
            if (!settingsStore.selectedTopic) {
                await autoSubscribeDefaultCamera()
            }
        }, 3000)
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
    // 如果已经连接且没有选中话题,立即尝试自动订阅
    if (rosStore.isConnected && !settingsStore.selectedTopic) {
        setTimeout(async () => {
            await autoSubscribeDefaultCamera()
        }, 1000)
    }
})

onUnmounted(() => {
    if (selectedTopic.value) {
        rosConnection.unsubscribe(selectedTopic.value)
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
