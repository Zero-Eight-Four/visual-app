<template>
    <div class="state-info">
        <div class="info-header">
            <h3>状态信息</h3>
            <el-button size="small" @click="clearInfo">清除</el-button>
        </div>
        <div class="info-content">
            <el-scrollbar height="100%">
                <div class="info-section">
                    <div class="info-item">
                        <span class="label">连接状态:</span>
                        <span class="value" :class="connectionClass">{{ connectionStatus }}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">服务器:</span>
                        <span class="value">{{ serverUrl }}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">话题数量:</span>
                        <span class="value">{{ topicCount }}</span>
                    </div>
                </div>

                <div v-if="selectedTopic" class="info-section">
                    <h4>当前话题</h4>
                    <div class="info-item">
                        <span class="label">名称:</span>
                        <span class="value">{{ selectedTopic }}</span>
                    </div>
                </div>

                <div v-if="latestMessage" class="info-section">
                    <h4>最新消息</h4>
                    <pre class="message-data">{{ formattedMessage }}</pre>
                </div>
            </el-scrollbar>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElButton, ElScrollbar } from 'element-plus'
import { useRosStore } from '@/stores/ros'

const rosStore = useRosStore()
const selectedTopic = ref<string>('')
const latestMessage = ref<any>(null)

const connectionStatus = computed(() =>
    rosStore.isConnected ? '已连接' : '未连接'
)

const connectionClass = computed(() =>
    rosStore.isConnected ? 'connected' : 'disconnected'
)

const serverUrl = computed(() => rosStore.connectionState.url)
const topicCount = computed(() => rosStore.topics.length)

const formattedMessage = computed(() =>
    latestMessage.value ? JSON.stringify(latestMessage.value, null, 2) : ''
)

const clearInfo = () => {
    latestMessage.value = null
}
</script>

<style scoped>
.state-info {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.info-header {
    padding: 10px 15px;
    background-color: #2a2a2a;
    border-bottom: 1px solid #3a3a3a;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.info-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
}

.info-content {
    flex: 1;
    overflow: hidden;
}

.info-section {
    padding: 15px;
    border-bottom: 1px solid #3a3a3a;
}

.info-section h4 {
    margin: 0 0 10px 0;
    font-size: 13px;
    color: #909399;
}

.info-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    font-size: 13px;
}

.label {
    color: #909399;
    font-weight: 500;
}

.value {
    color: #fff;
}

.value.connected {
    color: #67c23a;
}

.value.disconnected {
    color: #f56c6c;
}

.message-data {
    background-color: #1a1a1a;
    padding: 10px;
    border-radius: 4px;
    font-size: 12px;
    color: #e6e6e6;
    overflow-x: auto;
    margin: 0;
}
</style>
