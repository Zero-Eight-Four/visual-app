<template>
    <div class="settings-panel">
        <el-scrollbar height="100%">
            <div class="settings-content">
                <!-- 位姿发布 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <Location />
                        </el-icon>
                        <span>任务发布</span>
                    </div>
                    <div class="button-grid">
                        <el-button :type="publishType === 'pose_estimate' ? 'primary' : 'default'" size="small"
                            @click="handlePublishCommand('pose_estimate')">
                            <el-icon>
                                <Position />
                            </el-icon>
                            初始化位置
                        </el-button>
                        <el-button :type="publishType === 'pose' ? 'primary' : 'default'" size="small"
                            @click="handlePublishCommand('pose')">
                            <el-icon>
                                <Aim />
                            </el-icon>
                            添加目标点
                        </el-button>
                    </div>
                </div>

                <!-- 队列控制 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <Operation />
                        </el-icon>
                        <span>任务控制</span>
                    </div>
                    <div class="button-grid">
                        <el-button type="primary" size="small" @click="publishCommand('/goal_queue/start')">
                            <el-icon>
                                <VideoPlay />
                            </el-icon>
                            <span>开始</span>
                        </el-button>
                        <el-button type="warning" size="small" @click="publishCommand('/goal_queue/stop')">
                            <el-icon>
                                <VideoPause />
                            </el-icon>
                            <span>停止</span>
                        </el-button>
                        <el-button type="info" size="small" @click="publishCommand('/goal_queue/toggle_loop')">
                            <el-icon>
                                <Refresh />
                            </el-icon>
                            <span>循环</span>
                        </el-button>
                        <el-button type="danger" size="small" @click="publishCommand('/goal_queue/clear')">
                            <el-icon>
                                <Delete />
                            </el-icon>
                            <span>清空</span>
                        </el-button>
                    </div>
                </div>

                <!-- 队列管理 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <Files />
                        </el-icon>
                        <span>任务管理</span>
                    </div>
                    <div class="button-grid compact">
                        <el-button size="small" @click="publishCommand('/goal_queue/save')">
                            <el-icon>
                                <Download />
                            </el-icon>
                            保存
                        </el-button>
                        <el-button size="small" @click="publishCommand('/goal_queue/load')">
                            <el-icon>
                                <Upload />
                            </el-icon>
                            加载
                        </el-button>
                        <el-button size="small" @click="publishCommand('/goal_queue/list')">
                            <el-icon>
                                <List />
                            </el-icon>
                            列表
                        </el-button>
                        <el-button size="small" type="danger" @click="confirmDeleteAll">
                            <el-icon>
                                <DeleteFilled />
                            </el-icon>
                            删除全部
                        </el-button>
                    </div>
                </div>

                <!-- 命名队列 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <FolderOpened />
                        </el-icon>
                        <span>任务命名 </span>
                    </div>
                    <el-select v-model="queueName" placeholder="输入或选择任务名称" size="small" filterable allow-create
                        clearable class="queue-select">
                        <el-option v-for="name in availableQueues" :key="name" :label="name" :value="name" />
                    </el-select>
                    <div class="button-grid compact" style="margin-top: 12px;">
                        <el-button size="small" @click="publishNamedCommand('/goal_queue/save_named')"
                            :disabled="!queueName">
                            <el-icon>
                                <FolderAdd />
                            </el-icon>
                            保存为
                        </el-button>
                        <el-button size="small" @click="publishNamedCommand('/goal_queue/load_named')"
                            :disabled="!queueName">
                            <el-icon>
                                <FolderOpened />
                            </el-icon>
                            加载
                        </el-button>
                        <el-button size="small" type="danger" @click="confirmDeleteNamed" :disabled="!queueName">
                            <el-icon>
                                <FolderDelete />
                            </el-icon>
                            删除
                        </el-button>
                    </div>
                </div>
            </div>
        </el-scrollbar>
    </div>
</template>

<script setup lang="ts">
import { ref, inject, type Ref } from 'vue'
import { ElScrollbar, ElButton, ElMessage, ElMessageBox, ElSelect, ElOption, ElIcon } from 'element-plus'
import {
    Operation,
    VideoPlay,
    VideoPause,
    Refresh,
    Delete,
    Files,
    Download,
    Upload,
    List,
    DeleteFilled,
    FolderOpened,
    FolderAdd,
    FolderDelete,
    Location,
    Position,
    Aim
} from '@element-plus/icons-vue'
import { rosConnection } from '@/services/rosConnection'
import { use3DSettingsStore } from '@/stores/threeDSettings'
import type { PublishClickType } from '@/utils/PublishClickTool'

const settingsStore = use3DSettingsStore()
const activeTab = ref('goalQueue')
const queueName = ref('')
const availableQueues = ref<string[]>([])
const publishType = ref<PublishClickType>('pose')

// 获取3D面板的引用
const threeDPanelRef = inject<Ref<any>>('threeDPanelRef', ref(null))

// 处理发布命令
const handlePublishCommand = (command: PublishClickType) => {
    publishType.value = command
    if (threeDPanelRef.value?.handlePublishCommand) {
        threeDPanelRef.value.handlePublishCommand(command)
        const typeMap = {
            'pose_estimate': '当前位姿',
            'pose': '目标位姿'
        }
        ElMessage.success(`${typeMap[command]}发布模式已激活，点击地图发布`)
    }
}

// 发布空消息命令
const publishCommand = async (topic: string) => {
    if (!rosConnection.isConnected()) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    try {
        // 如果是列表命令，先订阅rosout话题再发送命令
        if (topic === '/goal_queue/list') {
            ElMessage.success('正在获取队列列表...')
            await subscribeToQueueList()
            // 等待订阅完全建立后再发送命令（增加等待时间）
            await new Promise(resolve => setTimeout(resolve, 2000))
            await rosConnection.publish(topic, 'std_msgs/Empty', {})
        } else {
            await rosConnection.publish(topic, 'std_msgs/Empty', {})
            ElMessage.success('命令已发送')
        }
    } catch (error) {
        console.error('Failed to publish command:', error)
        ElMessage.error('命令发送失败')
    }
}

// 订阅rosout话题获取队列列表
const subscribeToQueueList = async () => {
    try {
        // 先取消旧订阅（如果有）
        rosConnection.unsubscribe('/rosout')

        await rosConnection.subscribe({
            topic: '/rosout',
            messageType: 'rosgraph_msgs/Log',
            callback: (message: any) => {
                // 只处理来自/goal_queue节点的消息
                if (message.name && message.name !== '/goal_queue') {
                    return
                }

                // 解析日志消息，查找队列列表
                if (message.msg && typeof message.msg === 'string') {
                    const msg = message.msg.trim()

                    // 检测并解析新格式: "Available queues: queue1 (5 points), queue2 (3 points), queue3 (7 points)"
                    if (msg.startsWith('Available queues:')) {

                        // 提取冒号后的内容
                        const queuesStr = msg.substring('Available queues:'.length).trim()

                        if (queuesStr) {
                            // 分割队列项，格式: "queueName (X points)"
                            const queueMatches = queuesStr.matchAll(/(\S+)\s+\((\d+)\s+points?\)/g)
                            const queues: string[] = []

                            for (const match of queueMatches) {
                                if (match[1]) {
                                    queues.push(match[1])
                                }
                            }

                            if (queues.length > 0) {
                                availableQueues.value = queues
                                ElMessage.success(`已获取 ${queues.length} 个队列`)
                            } else {
                                ElMessage.info('没有可用的队列')
                            }
                        } else {
                            ElMessage.info('队列列表为空')
                        }

                        // 获取到列表后取消订阅
                        setTimeout(() => {
                            rosConnection.unsubscribe('/rosout')
                        }, 500)
                    }
                }
            }
        })
    } catch (error) {
        console.error('Failed to subscribe to queue list:', error)
    }
}

// 发布带名称的命令
const publishNamedCommand = async (topic: string) => {
    if (!rosConnection.isConnected()) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    if (!queueName.value.trim()) {
        ElMessage.warning('请输入队列名称')
        return
    }

    try {
        await rosConnection.publish(topic, 'std_msgs/String', { data: queueName.value.trim() })
        ElMessage.success('命令已发送')
    } catch (error) {
        console.error('Failed to publish named command:', error)
        ElMessage.error('命令发送失败')
    }
}

// 确认删除命名队列
const confirmDeleteNamed = async () => {
    if (!queueName.value.trim()) {
        ElMessage.warning('请输入队列名称')
        return
    }

    try {
        await ElMessageBox.confirm(
            `确定要删除队列"${queueName.value}"吗？`,
            '确认删除',
            {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            }
        )
        await publishNamedCommand('/goal_queue/delete_named')
    } catch (error) {
        // 用户取消
    }
}

// 确认删除所有队列
const confirmDeleteAll = async () => {
    try {
        await ElMessageBox.confirm(
            '此操作将删除所有已保存的目标队列，是否继续？',
            '确认删除',
            {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            }
        )
        await publishCommand('/goal_queue/delete_all')
    } catch (error) {
        // 用户取消
    }
}
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
    margin-bottom: 12px;
    font-size: 13px;
    font-weight: 600;
    color: #333;
}

.section-header .el-icon {
    font-size: 16px;
    color: #409EFF;
}

.button-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
}

.button-grid.compact {
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
}

.button-grid .el-button {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
}

.queue-select {
    width: 100%;
}

:deep(.el-button span) {
    display: flex;
    align-items: center;
    gap: 4px;
}
</style>
