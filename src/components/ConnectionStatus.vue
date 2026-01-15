<template>
    <div class="connection-status">
        <el-tooltip
            v-if="isConnected && rosStore.topicFetchError"
            :content="`连接正常，但话题获取失败: ${rosStore.topicFetchError}`"
            placement="bottom"
        >
            <div class="status-indicator connected-warning">
                <span class="dot"></span>
                <span class="text">已连接 (异常)</span>
                <el-icon class="warning-icon"><Warning /></el-icon>
            </div>
        </el-tooltip>
        <div v-else class="status-indicator" :class="statusClass">
            <span class="dot"></span>
            <span class="text">{{ statusText }}</span>
        </div>
        
        <el-select 
            v-model="selectedConnectionUrl" 
            placeholder="选择连接" 
            size="small" 
            style="width: 200px;"
            :disabled="isConnected || isConnecting"
            @change="handleConnectionSelect"
        >
            <el-option
                v-for="item in connectionHistory"
                :key="item.url"
                :label="item.name"
                :value="item.url"
            >
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>{{ item.name }}</span>
                    <span style="font-size: 11px; color: #999;">{{ item.url }}</span>
                </div>
            </el-option>
        </el-select>
        
        <el-button 
            type="primary" 
            size="small" 
            :icon="Plus"
            @click="showConnectionDialog = true"
            :disabled="isConnected || isConnecting"
            plain
        >
            新增连接
        </el-button>
        
        <el-button 
            v-if="!isConnected" 
            type="primary" 
            size="small" 
            @click="handleConnect" 
            :loading="isConnecting"
            :disabled="!selectedConnectionUrl"
        >
            {{ isConnecting ? '连接中...' : '连接' }}
        </el-button>
        <el-button 
            v-else 
            type="danger" 
            size="small" 
            @click="handleDisconnect"
        >
            断开
        </el-button>
    </div>
    
    <!-- 连接对话框 -->
    <ConnectionDialog 
        v-model="showConnectionDialog" 
        @connected="handleDialogConnected"
    />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElButton, ElSelect, ElOption, ElMessage, ElTooltip, ElIcon } from 'element-plus'
import { Plus, Warning } from '@element-plus/icons-vue'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'
import ConnectionDialog from '@/components/ConnectionDialog.vue'

interface ConnectionHistoryItem {
    name: string
    url: string
}

const rosStore = useRosStore()

const showConnectionDialog = ref(false)
const selectedConnectionUrl = ref<string>('')
const connectionHistory = ref<ConnectionHistoryItem[]>([])
let historyWatchInterval: number | null = null

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

// 加载连接历史
const loadConnectionHistory = () => {
    try {
        const stored = localStorage.getItem('ros_connection_history')
        if (stored) {
            const parsed = JSON.parse(stored)
            connectionHistory.value = Array.isArray(parsed) ? parsed : []
        }
    } catch (error) {
        console.error('加载连接历史失败:', error)
        connectionHistory.value = []
    }
}

// 处理连接选择
const handleConnectionSelect = (url: string) => {
    if (url) {
        rosStore.setConnectionState({ url })
    }
}

// 处理连接
const handleConnect = async () => {
    if (!selectedConnectionUrl.value) {
        ElMessage.warning('请先选择连接')
        return
    }

    rosStore.setConnectionState({ 
        connecting: true, 
        error: null,
        url: selectedConnectionUrl.value
    })

    try {
        await rosConnection.connect({
            url: selectedConnectionUrl.value
        })

        rosStore.setConnectionState({ connected: true, connecting: false })

        // 获取话题列表 (后台异步获取，不阻塞UI)
        rosStore.fetchTopics().then(() => {
            console.log('Initial topics fetched')
        }).catch(err => {
            console.warn('Initial topic fetch incomplete:', err)
        })

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

// 处理对话框连接成功
const handleDialogConnected = () => {
    loadConnectionHistory()
    // 如果对话框连接成功，更新选择框
    if (rosStore.connectionState.url) {
        selectedConnectionUrl.value = rosStore.connectionState.url
    }
}

const handleDisconnect = () => {
    rosConnection.disconnect()
    rosStore.setConnectionState({ connected: false, connecting: false })
    rosStore.setTopics([]) // 清空话题列表
    ElMessage.info('已断开连接')
}

// 监听连接历史变化（当其他组件修改历史记录时）
const watchHistoryChanges = () => {
    // 先清理之前的定时器（如果存在）
    if (historyWatchInterval !== null) {
        clearInterval(historyWatchInterval)
    }
    // 使用定时器定期检查localStorage变化（简单方法）
    historyWatchInterval = window.setInterval(() => {
        const stored = localStorage.getItem('ros_connection_history')
        if (stored) {
            try {
                const parsed = JSON.parse(stored)
                const newHistory = Array.isArray(parsed) ? parsed : []
                // 检查是否有变化
                if (JSON.stringify(newHistory) !== JSON.stringify(connectionHistory.value)) {
                    connectionHistory.value = newHistory
                }
            } catch (error) {
                // 忽略解析错误
            }
        }
    }, 1000) // 每秒检查一次
}

// 初始化
onMounted(() => {
    loadConnectionHistory()
    // 如果有当前URL，设置为选中
    if (rosStore.connectionState.url) {
        selectedConnectionUrl.value = rosStore.connectionState.url
    }
    // 开始监听历史记录变化
    watchHistoryChanges()
})

// 清理资源
onUnmounted(() => {
    // 清理连接历史监听定时器
    if (historyWatchInterval !== null) {
        clearInterval(historyWatchInterval)
        historyWatchInterval = null
    }
})
</script>

<style scoped>
.connection-status {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: nowrap;
    min-width: 0;
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

.connected-warning {
    background-color: rgba(230, 162, 60, 0.2);
    cursor: help;
}

.connected-warning .dot {
    background-color: #67c23a; /* 连接仍然是绿色的 */
}

.connected-warning .text {
    color: #e6a23c;
}

.warning-icon {
    margin-left: 4px;
    color: #e6a23c;
    font-size: 14px;
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
