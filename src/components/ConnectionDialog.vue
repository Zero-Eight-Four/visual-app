<template>
    <el-dialog v-model="visible" title="连接到机器狗" width="500px" :close-on-click-modal="false">
        <el-form :model="form" label-width="100px">
            <el-form-item label="选择连接" prop="url">
                <div style="display: flex; gap: 10px; align-items: center;">
                    <el-select id="ros-websocket-url" ref="selectRef" v-model="form.url" filterable placeholder="请选择连接"
                        style="flex: 1;" @keyup.enter="handleConnect">
                        <el-option v-for="historyItem in connectionHistory" :key="historyItem.url"
                            :label="historyItem.name" :value="historyItem.url">
                            <div
                                style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                                <span>{{ historyItem.name }}</span>
                                <el-button size="small" text type="primary" @click.stop="editConnection(historyItem)">
                                    编辑
                                </el-button>
                            </div>
                        </el-option>
                    </el-select>
                    <el-button type="primary" :icon="Plus" @click="showAddConnectionDialog" plain>
                        新增连接
                    </el-button>
                </div>
            </el-form-item>
        </el-form>

        <template #footer>
            <el-button @click="visible = false">
                取消
            </el-button>
            <el-button type="primary" :loading="connecting" @click="handleConnect" :disabled="!form.url">
                连接
            </el-button>
        </template>
    </el-dialog>

    <!-- 新连接输入对话框 -->
    <el-dialog v-model="newConnectionDialogVisible" title="添加新连接" width="400px" :close-on-click-modal="false">
        <el-form label-width="80px">
            <el-form-item label="连接地址">
                <el-input v-model="newConnectionForm.url" placeholder="ws://192.168.1.100:9090"
                    @keyup.enter="saveNewConnection" />
            </el-form-item>
            <el-form-item label="连接名称">
                <el-input v-model="newConnectionForm.name" placeholder="例如: 机器狗1号" @keyup.enter="saveNewConnection" />
            </el-form-item>
        </el-form>
        <template #footer>
            <el-button @click="cancelNewConnection">
                取消
            </el-button>
            <el-button type="primary" @click="saveNewConnection"
                :disabled="!newConnectionForm.url || !newConnectionForm.name.trim()">
                保存
            </el-button>
        </template>
    </el-dialog>

    <!-- 编辑连接名称对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑连接名称" width="400px">
        <el-form label-width="80px">
            <el-form-item label="名称">
                <el-input v-model="editForm.name" placeholder="例如: 机器狗1号" @keyup.enter="saveEdit" />
            </el-form-item>
            <el-form-item label="地址">
                <el-input v-model="editForm.url" disabled />
            </el-form-item>
        </el-form>
        <template #footer>
            <el-button @click="editDialogVisible = false">取消</el-button>
            <el-button type="danger" @click="deleteConnection">删除</el-button>
            <el-button type="primary" @click="saveEdit">保存</el-button>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { ElDialog, ElForm, ElFormItem, ElSelect, ElOption, ElButton, ElMessage, ElInput } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'

interface ConnectionHistoryItem {
    name: string
    url: string
}

const props = defineProps<{
    modelValue: boolean
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void
    (e: 'connected'): void
}>()

const rosStore = useRosStore()
const visible = ref(props.modelValue)
const connecting = ref(false)
const connectionHistory = ref<ConnectionHistoryItem[]>([])
const editDialogVisible = ref(false)
const selectRef = ref<InstanceType<typeof ElSelect>>()
const newConnectionDialogVisible = ref(false)
const editForm = ref({
    url: '',
    name: ''
})
const newConnectionForm = ref({
    url: '',
    name: ''
})

const form = ref({
    url: 'ws://localhost:9090',
    autoReconnect: true
})

// 从 localStorage 加载连接历史
const loadConnectionHistory = () => {
    try {
        const history = localStorage.getItem('ros_connection_history')
        if (history) {
            const parsed = JSON.parse(history)
            // 兼容旧格式(字符串数组)
            if (Array.isArray(parsed) && parsed.length > 0) {
                if (typeof parsed[0] === 'string') {
                    // 旧格式: 字符串数组,转换为新格式
                    connectionHistory.value = parsed.map((url: string, index: number) => ({
                        name: `机器狗${index + 1}`,
                        url: url
                    }))
                    // 保存新格式
                    localStorage.setItem('ros_connection_history', JSON.stringify(connectionHistory.value))
                } else {
                    // 新格式: 对象数组
                    connectionHistory.value = parsed
                }
            }
        }
    } catch (error) {
        console.error('Failed to load connection history:', error)
    }
}

// 保存连接历史
const saveConnectionHistory = (url: string, name: string) => {
    try {
        // 移除相同URL的项(如果存在)
        const filtered = connectionHistory.value.filter(h => h.url !== url)
        // 添加到开头
        const newItem: ConnectionHistoryItem = {
            name: name || url,
            url: url
        }
        connectionHistory.value = [newItem, ...filtered].slice(0, 5) // 只保留最近5个
        localStorage.setItem('ros_connection_history', JSON.stringify(connectionHistory.value))
    } catch (error) {
        console.error('Failed to save connection history:', error)
    }
}

// 编辑连接名称
const editConnection = (item: ConnectionHistoryItem) => {
    // 先关闭下拉框
    selectRef.value?.blur()

    // 使用 nextTick 确保下拉框完全关闭后再打开编辑对话框
    setTimeout(() => {
        editForm.value = {
            url: item.url,
            name: item.name
        }
        editDialogVisible.value = true
    }, 100)
}

// 保存编辑
const saveEdit = () => {
    if (!editForm.value.name.trim()) {
        ElMessage.warning('请输入连接名称')
        return
    }

    // 更新历史记录中的名称
    const index = connectionHistory.value.findIndex(h => h.url === editForm.value.url)
    if (index !== -1) {
        connectionHistory.value[index].name = editForm.value.name.trim()
        localStorage.setItem('ros_connection_history', JSON.stringify(connectionHistory.value))
        ElMessage.success('连接名称已更新')
    }

    editDialogVisible.value = false
}

// 删除连接
const deleteConnection = () => {
    connectionHistory.value = connectionHistory.value.filter(h => h.url !== editForm.value.url)
    localStorage.setItem('ros_connection_history', JSON.stringify(connectionHistory.value))
    ElMessage.success('连接已删除')
    editDialogVisible.value = false
}

// 从URL提取默认名称
const extractNameFromUrl = (url: string): string => {
    try {
        const match = url.match(/\/\/([\d.]+)/)
        if (match && match[1]) {
            return `机器狗 ${match[1]}`
        }
    } catch (error) {
        // ignore
    }
    return '新连接'
}

// 验证WebSocket URL格式
const isValidWebSocketUrl = (url: string): boolean => {
    try {
        const urlObj = new URL(url)
        return urlObj.protocol === 'ws:' || urlObj.protocol === 'wss:'
    } catch {
        return false
    }
}

// 显示新增连接对话框
const showAddConnectionDialog = () => {
    newConnectionForm.value = {
        url: '',
        name: ''
    }
    newConnectionDialogVisible.value = true
}

// 取消添加新连接
const cancelNewConnection = () => {
    newConnectionDialogVisible.value = false
    newConnectionForm.value = {
        url: '',
        name: ''
    }
}

// 保存新连接
const saveNewConnection = () => {
    if (!newConnectionForm.value.url.trim()) {
        ElMessage.warning('请输入连接地址')
        return
    }

    if (!newConnectionForm.value.name.trim()) {
        ElMessage.warning('请输入连接名称')
        return
    }

    // 验证URL格式
    if (!isValidWebSocketUrl(newConnectionForm.value.url)) {
        ElMessage.warning('请输入有效的WebSocket地址，例如: ws://192.168.1.100:9090')
        return
    }

    // 检查是否已存在
    const existing = connectionHistory.value.find(h => h.url === newConnectionForm.value.url)
    if (existing) {
        ElMessage.warning('该连接地址已存在')
        return
    }

    // 如果没有输入名称，使用默认名称
    if (!newConnectionForm.value.name.trim()) {
        newConnectionForm.value.name = extractNameFromUrl(newConnectionForm.value.url)
    }

    // 保存到历史记录
    saveConnectionHistory(newConnectionForm.value.url, newConnectionForm.value.name.trim())

    // 自动选中新添加的连接
    form.value.url = newConnectionForm.value.url

    // 关闭对话框
    newConnectionDialogVisible.value = false

    ElMessage.success('连接已添加')
}

onMounted(() => {
    loadConnectionHistory()
})

watch(() => props.modelValue, (val) => {
    visible.value = val
    if (val) {
        form.value.url = rosStore.connectionState.url
    }
})

watch(visible, (val) => {
    emit('update:modelValue', val)
})

const handleConnect = async () => {
    connecting.value = true

    // 确保 url 是字符串类型(el-select allow-create 模式可能返回对象)
    const urlValue = typeof form.value.url === 'string'
        ? form.value.url
        : String(form.value.url)

    rosStore.setConnectionState({ connecting: true, error: null, url: urlValue })

    try {
        await rosConnection.connect({
            url: urlValue,
            autoConnect: form.value.autoReconnect
        })

        rosStore.setConnectionState({ connected: true, connecting: false })

        // 保存到连接历史(仅当不在历史记录中时)
        const existing = connectionHistory.value.find(h => h.url === urlValue)
        if (!existing) {
            saveConnectionHistory(urlValue, extractNameFromUrl(urlValue))
        }

        // 获取话题列表（添加超时处理）
        try {
            const topics = await Promise.race([
                rosConnection.getTopics(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('获取话题列表超时')), 5000))
            ]) as any[]
            rosStore.setTopics(topics)
        } catch (topicError) {
            // 即使获取话题失败，连接也是成功的
        }
        visible.value = false
        emit('connected')
    } catch (error) {
        console.error('连接失败详情:', error)

        // 处理不同类型的错误
        let errorMessage = '未知错误'
        if (error instanceof Error) {
            errorMessage = error.message
        } else if (error && typeof error === 'object' && 'type' in error) {
            errorMessage = 'WebSocket 连接失败'
        }

        rosStore.setConnectionState({
            connected: false,
            connecting: false,
            error: errorMessage
        })

        // 显示更详细的错误信息
        const ip = urlValue.replace('ws://', '').split(':')[0]
        let userMessage = ''

        if (errorMessage.includes('无法加载') || errorMessage.includes('网络连接失败')) {
            userMessage = `模块加载失败！\n\n可能的原因：\n• 网络连接不稳定\n• Vite 开发服务器未运行\n• 浏览器缓存问题\n\n建议：\n• 检查网络连接\n• 刷新页面重试\n• 检查 Vite 服务器状态`
        } else         if (errorMessage.includes('无法加载') || errorMessage.includes('网络连接失败')) {
            userMessage = `模块加载失败！\n\n可能的原因：\n• 网络连接不稳定\n• Vite 开发服务器未运行\n• 浏览器缓存问题\n\n建议：\n• 检查网络连接\n• 刷新页面重试\n• 检查 Vite 服务器状态`
        } else if (errorMessage.includes('超时')) {
            userMessage = `连接超时！\n\n请检查：\n• 机器狗是否开机\n• IP ${ip} 是否正确\n`
        } else if (errorMessage.includes('WebSocket')) {
            userMessage = `无法连接到 ${ip}:9090\n\n可能原因：\n• 机器狗未启动\n• 防火墙阻止连接\n• 网络不通`
        } else {
            userMessage = `连接失败: ${errorMessage}`
        }

        ElMessage.error({
            message: userMessage,
            duration: 8000,
            showClose: true
        })
    } finally {
        connecting.value = false
    }
}
</script>

<style scoped>
.el-dialog {
    border-radius: 8px;
}

/* 确保编辑对话框在下拉菜单上方 */
:deep(.el-dialog__wrapper) {
    z-index: 3000 !important;
}
</style>

<style scoped>
.el-dialog {
    border-radius: 8px;
}
</style>
