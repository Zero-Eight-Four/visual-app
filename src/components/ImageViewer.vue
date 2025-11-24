<template>
    <div class="image-viewer">
        <div class="viewer-header">
            <h3>图像显示</h3>
            <el-select v-model="selectedImageTopic" placeholder="选择摄像头" size="small" style="width: 200px"
                @change="handleTopicChange">
                <el-option v-for="topic in imageTopics" :key="topic.name" :label="topic.name" :value="topic.name" />
            </el-select>
        </div>
        <div class="image-container">
            <canvas ref="imageCanvas" class="image-canvas"></canvas>
            <div v-if="!currentImage" class="no-image">
                <span>{{ selectedImageTopic ? '等待图像数据...' : '请选择摄像头' }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { ElSelect, ElOption } from 'element-plus'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'
import type { RosMessage } from '@/types/ros'

const rosStore = useRosStore()
const imageCanvas = ref<HTMLCanvasElement>()
const currentImage = ref<string | null>(null)
const selectedImageTopic = ref<string>('')

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
        }

        img.src = imageData
    }
}

onUnmounted(() => {
    if (selectedImageTopic.value) {
        rosConnection.unsubscribe(selectedImageTopic.value)
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
</style>
