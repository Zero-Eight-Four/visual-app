<template>
    <div class="connection-status">
        <div class="status-indicator" :class="statusClass">
            <span class="dot"></span>
            <span class="text">{{ statusText }}</span>
        </div>
        <el-button v-if="!isConnected" type="primary" size="small" @click="handleConnect" :loading="isConnecting">
            {{ isConnecting ? '连接中...' : '连接' }}
        </el-button>
        <el-button v-else type="danger" size="small" @click="handleDisconnect">
            断开
        </el-button>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElMessage } from 'element-plus'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'

const rosStore = useRosStore()

const isConnected = computed(() => rosStore.isConnected)
const isConnecting = computed(() => rosStore.connectionState.connecting)

const statusClass = computed(() => {
    if (isConnected.value) return 'connected'
    if (isConnecting.value) return 'connecting'
    return 'disconnected'
})

const statusText = computed(() => {
    if (isConnected.value) return '已连接'
    if (isConnecting.value) return '连接中'
    return '未连接'
})

const handleConnect = async () => {
    rosStore.setConnectionState({ connecting: true, error: null })

    try {
        await rosConnection.connect({
            url: rosStore.connectionState.url
        })

        rosStore.setConnectionState({ connected: true, connecting: false })

        // 获取话题列表
        const topics = await rosConnection.getTopics()
        rosStore.setTopics(topics)

        ElMessage.success('成功连接到ROS')
    } catch (error) {
        rosStore.setConnectionState({
            connected: false,
            connecting: false,
            error: error instanceof Error ? error.message : '连接失败'
        })
        ElMessage.error('连接失败: ' + (error instanceof Error ? error.message : '未知错误'))
    }
}

const handleDisconnect = () => {
    rosConnection.disconnect()
    rosStore.setConnectionState({ connected: false, connecting: false })
    ElMessage.info('已断开连接')
}
</script>

<style scoped>
.connection-status {
    display: flex;
    align-items: center;
    gap: 10px;
}

.status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 4px;
    background-color: rgba(255, 255, 255, 0.05);
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
}

.connected .dot {
    background-color: #67c23a;
}

.connecting .dot {
    background-color: #e6a23c;
}

.disconnected .dot {
    background-color: #f56c6c;
}

.text {
    font-size: 13px;
    color: #fff;
}

@keyframes pulse {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.5;
    }
}
</style>
