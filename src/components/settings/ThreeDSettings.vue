<template>
    <div class="settings-panel">
        <el-scrollbar height="100%">
            <div class="settings-content">
                <!-- 任务编辑 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <EditPen />
                        </el-icon>
                        <span>任务编辑</span>
                    </div>

                    <div class="control-group-label">
                        添加点位
                    </div>
                    <div class="button-grid">
                        <el-button :type="publishType === 'pose_estimate' ? 'primary' : 'default'" size="small"
                            @click="handlePublishCommand('pose_estimate')">
                            <el-icon>
                                <Position />
                            </el-icon>
                            初始位姿
                        </el-button>
                        <el-button :type="publishType === 'pose' ? 'primary' : 'default'" size="small"
                            @click="handlePublishCommand('pose')">
                            <el-icon>
                                <Aim />
                            </el-icon>
                            目标点位
                        </el-button>
                    </div>

                    <div class="control-group-label" style="margin-top: 12px;">
                        修改点位
                    </div>
                    <el-button-group style="width: 100%; display: flex;">
                        <el-button size="small" style="flex: 1" @click="handleModifyPoint">
                            <el-icon style="margin-right: 4px">
                                <Edit />
                            </el-icon>
                            修改
                        </el-button>
                        <el-button size="small" style="flex: 1" @click="handleInsertPoint">
                            <el-icon style="margin-right: 4px">
                                <Plus />
                            </el-icon>
                            插入
                        </el-button>
                        <el-button size="small" type="danger" plain style="flex: 1" @click="handleDeletePoint">
                            <el-icon style="margin-right: 4px">
                                <Minus />
                            </el-icon>
                            删除
                        </el-button>
                    </el-button-group>
                </div>

                <!-- 任务控制 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <Operation />
                        </el-icon>
                        <span>任务控制</span>
                    </div>
                    <div class="button-container">
                        <div style="width: 100%; display: flex; gap: 8px; margin-bottom: 8px;">
                            <el-button type="success" plain size="small" style="flex: 1"
                                @click="publishCommand('/goal_queue/start')">
                                <el-icon style="margin-right: 4px">
                                    <VideoPlay />
                                </el-icon>
                                开始执行
                            </el-button>
                            <el-button type="warning" plain size="small" style="flex: 1"
                                @click="publishCommand('/goal_queue/stop')">
                                <el-icon style="margin-right: 4px">
                                    <VideoPause />
                                </el-icon>
                                停止执行
                            </el-button>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <el-button type="info" plain size="small" style="flex: 1" @click="handleLoopMode">
                                <el-icon style="margin-right: 4px">
                                    <Refresh />
                                </el-icon>
                                循环模式
                            </el-button>
                            <el-button type="danger" plain size="small" style="flex: 1"
                                @click="publishCommand('/goal_queue/clear')">
                                <el-icon style="margin-right: 4px">
                                    <Delete />
                                </el-icon>
                                清空队列
                            </el-button>
                        </div>
                    </div>
                </div>

                <!-- 导航控制 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <Location />
                        </el-icon>
                        <span>导航控制</span>
                    </div>
                    <div class="button-container">
                        <div style="width: 100%; display: flex; gap: 8px;">
                            <el-button 
                                type="success" 
                                plain 
                                size="small" 
                                style="flex: 1"
                                :loading="startNavigationLoading"
                                :disabled="isNavigationRunning"
                                @click="handleStartNavigation">
                                <el-icon style="margin-right: 4px">
                                    <VideoPlay />
                                </el-icon>
                                启动导航
                            </el-button>
                            <el-button 
                                type="warning" 
                                plain 
                                size="small" 
                                style="flex: 1"
                                :loading="stopNavigationLoading"
                                :disabled="!isNavigationRunning"
                                @click="handleStopNavigation">
                                <el-icon style="margin-right: 4px">
                                    <VideoPause />
                                </el-icon>
                                停止导航
                            </el-button>
                        </div>
                        <div v-if="isNavigationRunning" style="margin-top: 8px; padding: 8px; background-color: #f0f9ff; border-radius: 4px; font-size: 12px; color: #409eff;">
                            <el-icon style="margin-right: 4px">
                                <CircleCheck />
                            </el-icon>
                            导航系统运行中
                        </div>
                    </div>
                </div>

                <!-- 任务文件管理 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <FolderOpened />
                        </el-icon>
                        <span>任务文件管理</span>
                    </div>

                    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                        <el-select v-model="queueName" placeholder="选择任务名称" size="small" filterable clearable
                            class="queue-select" style="flex: 1;">
                            <el-option v-for="name in availableQueues" :key="name" :label="name" :value="name" />
                        </el-select>
                        <el-button size="small" :loading="isRefreshingList" title="刷新列表" @click="refreshQueueList">
                            <el-icon>
                                <Refresh />
                            </el-icon>
                        </el-button>
                    </div>

                    <div class="control-group-label" style="margin-top: 0;">
                        命名队列操作
                    </div>
                    <div class="button-grid compact">
                        <el-button size="small" @click="handleSaveQueue">
                            <el-icon>
                                <FolderAdd />
                            </el-icon>
                            保存
                        </el-button>
                        <el-button size="small" :disabled="!queueName" @click="handleLoadQueue">
                            <el-icon>
                                <FolderOpened />
                            </el-icon>
                            加载
                        </el-button>
                        <el-button size="small" type="danger" :disabled="!queueName" @click="confirmDeleteNamed">
                            <el-icon>
                                <FolderDelete />
                            </el-icon>
                            删除
                        </el-button>
                    </div>

                    <div class="control-group-label" style="margin-top: 12px;">
                        默认队列操作
                    </div>
                    <div class="button-grid">
                        <el-button size="small" @click="publishCommand('/goal_queue/save')">
                            <el-icon>
                                <DocumentAdd />
                            </el-icon>
                            保存默认
                        </el-button>
                        <el-button size="small" @click="publishCommand('/goal_queue/load')">
                            <el-icon>
                                <Document />
                            </el-icon>
                            加载默认
                        </el-button>
                    </div>

                    <div style="margin-top: 12px; border-top: 1px dashed #eee; padding-top: 12px;">
                        <el-button size="small" type="danger" plain style="width: 100%" @click="confirmDeleteAll">
                            <el-icon>
                                <DeleteFilled />
                            </el-icon>
                            删除所有文件
                        </el-button>
                    </div>
                </div>
            </div>
        </el-scrollbar>
    </div>
</template>

<script setup lang="ts">
import { ref, inject, type Ref, onMounted, onUnmounted } from 'vue'
import { ElScrollbar, ElButton, ElButtonGroup, ElMessage, ElMessageBox, ElSelect, ElOption, ElIcon } from 'element-plus'
import {
    Operation,
    VideoPlay,
    VideoPause,
    Refresh,
    Delete,
    DeleteFilled,
    FolderOpened,
    FolderAdd,
    FolderDelete,
    Position,
    Aim,
    Edit,
    EditPen,
    Plus,
    Minus,
    DocumentAdd,
    Document,
    Location,
    CircleCheck
} from '@element-plus/icons-vue'
import { rosConnection } from '@/services/rosConnection'
import { use3DSettingsStore } from '@/stores/threeDSettings'
import type { PublishClickType } from '@/utils/PublishClickTool'

const settingsStore = use3DSettingsStore()
const queueName = ref('')
const availableQueues = ref<string[]>([])
const publishType = ref<PublishClickType>('pose')
const isRefreshingList = ref(false)

// 导航控制状态
const isNavigationRunning = ref(false)
const startNavigationLoading = ref(false)
const stopNavigationLoading = ref(false)

// 获取3D面板的引用
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const threeDPanelRef = inject<Ref<any>>('threeDPanelRef', ref(null))

// 处理发布命令
const handlePublishCommand = (command: PublishClickType) => {
    // 如果切换了模式，且不是因为修改/插入操作触发的，则重置修改/插入状态
    if (!isModifying.value && !isInserting.value) {
        // 正常切换模式
    } else {
        // 如果正在修改/插入，但用户点击了其他按钮（比如初始化位置），是否应该取消修改/插入？
        // 这里我们假设用户点击按钮是想切换功能，所以取消修改/插入状态
        // 但如果是代码内部调用（如 startModifyPoint），我们需要保留状态
        // 由于无法区分来源，我们需要在 startModifyPoint 中设置状态后，立即调用此函数
        // 所以这里不能简单重置。

        // 修正逻辑：我们不在这里重置，而是在发布成功后重置
    }

    publishType.value = command
    if (threeDPanelRef.value?.handlePublishCommand) {
        threeDPanelRef.value.handlePublishCommand(command)

        if (isModifying.value) {
            // 不显示默认提示
        } else if (isInserting.value) {
            // 不显示默认提示
        } else {
            const typeMap = {
                'pose_estimate': '当前位姿',
                'pose': '目标位姿'
            }
            // @ts-expect-error: typeMap index signature issue
            ElMessage.success(`${typeMap[command]}发布模式已激活，点击地图发布`)
        }
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

// 处理导航启动
const handleStartNavigation = async () => {
    if (!rosConnection.isConnected()) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    if (isNavigationRunning.value) {
        ElMessage.warning('导航系统已在运行中')
        return
    }

    startNavigationLoading.value = true
    try {
        // 发布启动消息到 /trigger_launch 话题
        await rosConnection.publish('/trigger_launch', 'std_msgs/String', { data: 'start' })
        
        // 更新状态
        isNavigationRunning.value = true
        ElMessage.success('导航系统已启动')
    } catch (error) {
        console.error('Failed to start navigation:', error)
        ElMessage.error('启动导航失败')
    } finally {
        startNavigationLoading.value = false
    }
}

// 处理导航停止
const handleStopNavigation = async () => {
    if (!rosConnection.isConnected()) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    if (!isNavigationRunning.value) {
        ElMessage.warning('导航系统未运行')
        return
    }

    stopNavigationLoading.value = true
    try {
        // 发布停止消息到 /trigger_launch 话题
        await rosConnection.publish('/trigger_launch', 'std_msgs/String', { data: 'stop' })
        
        // 更新状态
        isNavigationRunning.value = false
        ElMessage.success('导航系统已停止')
    } catch (error) {
        console.error('Failed to stop navigation:', error)
        ElMessage.error('停止导航失败')
    } finally {
        stopNavigationLoading.value = false
    }
}

const refreshQueueList = async () => {
    isRefreshingList.value = true
    try {
        await publishCommand('/goal_queue/list')
    } finally {
        isRefreshingList.value = false
    }
}

const handleSaveQueue = async () => {
    try {
        const { value } = await ElMessageBox.prompt('请输入要保存的任务队列名称（留空则保存为default）', '保存任务', {
            confirmButtonText: '保存',
            cancelButtonText: '取消',
            inputValue: queueName.value || 'default' // 预填当前选中的名称，如果没有则默认为default
        })

        // 如果用户没有输入或输入为空，使用默认名称"default"
        const queueNameToSave = (value && value.trim()) ? value.trim() : 'default'
        await publishNamedCommand('/goal_queue/save_named', queueNameToSave)
    } catch (error) {
        // 用户取消，不执行保存
    }
}

const handleLoadQueue = () => publishNamedCommand('/goal_queue/load_named')

// 处理修改点
const handleModifyPoint = async () => {
    try {
        const { value } = await ElMessageBox.prompt('请输入要修改的点索引 (从1开始)', '修改点', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            inputPattern: /^[1-9]\d*$/,
            inputErrorMessage: '请输入有效的正整数'
        })

        if (value) {
            const index = parseInt(value) - 1
            // 这里简化处理，只发送索引，实际可能需要更多交互来获取新的坐标
            // 为了完整实现，我们可能需要先获取当前点的信息，或者让用户在地图上点击新位置
            // 鉴于当前上下文，我们先提示用户在地图上点击新位置

            ElMessage.info(`请在地图上点击新的位置以修改点 #${value}`)

            // 激活修改模式，这需要 ThreeDPanel 的支持
            if (threeDPanelRef.value?.handlePublishCommand) {
                // 我们需要一种方式传递 index 给 ThreeDPanel 或者 PublishClickTool
                // 这里暂时使用一个临时方案：通过 store 或者全局变量，或者扩展 handlePublishCommand
                // 简单起见，我们假设用户点击后，我们捕获点击事件并构造 JSON 发送

                // 更好的方式是扩展 PublishClickTool 支持 'modify' 模式
                // 但为了不修改太多文件，我们这里使用 'pose' 模式，但拦截发布逻辑

                // 实际上，C++代码接收的是 JSON 字符串：
                // {"index": idx, "x": ..., "y": ..., "z": ..., "qx": ..., ...}

                // 让我们定义一个新的发布类型 'modify_point' 在前端逻辑中处理
                // 但 PublishClickTool 需要知道这个类型

                // 临时方案：提示用户该功能需要结合地图点击，目前仅支持通过命令发送
                // 或者，我们可以弹出一个对话框让用户手动输入坐标（不太友好）

                // 让我们尝试一种交互方式：
                // 1. 用户输入索引
                // 2. 激活地图点击
                // 3. 点击后，发送修改命令

                startModifyPoint(index)
            }
        }
    } catch (error) {
        // 用户取消
    }
}

const isModifying = ref(false)
const modifyIndex = ref(-1)

const startModifyPoint = (index: number) => {
    isModifying.value = true
    modifyIndex.value = index

    // 激活 Pose 发布模式作为选点工具
    handlePublishCommand('pose')
    ElMessage.success(`已进入修改模式，请在地图上点击点 #${index + 1} 的新位置和方向`)
}

// 处理插入点
const handleInsertPoint = async () => {
    try {
        const { value } = await ElMessageBox.prompt('请输入插入位置的索引 (从1开始，插入到该点之前)', '插入点', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            inputPattern: /^[1-9]\d*$/,
            inputErrorMessage: '请输入有效的正整数'
        })

        if (value) {
            const index = parseInt(value) - 1
            startInsertPoint(index)
        }
    } catch (error) {
        // 用户取消
    }
}

const isInserting = ref(false)
const insertIndex = ref(-1)

const startInsertPoint = (index: number) => {
    isInserting.value = true
    insertIndex.value = index

    // 激活 Pose 发布模式作为选点工具
    handlePublishCommand('pose')
    ElMessage.success(`已进入插入模式，请在地图上点击新点的位置和方向 (将插入到 #${index + 1} 之前)`)
}

// 处理删除点
const handleDeletePoint = async () => {
    try {
        const { value } = await ElMessageBox.prompt('请输入要删除的点索引 (从1开始)', '删除点', {
            confirmButtonText: '删除',
            cancelButtonText: '取消',
            inputPattern: /^[1-9]\d*$/,
            inputErrorMessage: '请输入有效的正整数',
            inputType: 'number'
        })

        if (value) {
            const index = parseInt(value) - 1
            await rosConnection.publish('/goal_queue/delete_point', 'std_msgs/Int32', { data: index })
            ElMessage.success(`已删除点 #${value}`)
        }
    } catch (error) {
        // 用户取消
    }
}

// 处理循环模式设置
const handleLoopMode = async () => {
    try {
        const { value } = await ElMessageBox.prompt(
            '请输入循环次数 (-1: 无限循环, 0: 单次运行, >0: 指定次数)',
            '循环模式设置',
            {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                inputPattern: /^-?\d+$/,
                inputErrorMessage: '请输入有效的整数',
                inputValue: '-1', // 默认无限循环
                inputType: 'number'
            }
        )

        if (value !== null) {
            const loopCount = parseInt(value)
            await rosConnection.publish('/goal_queue/set_loop_count', 'std_msgs/Int32', { data: loopCount })

            if (loopCount === -1) {
                ElMessage.success('已设置为无限循环模式')
            } else if (loopCount === 0) {
                ElMessage.success('已设置为单次运行模式')
            } else {
                ElMessage.success(`已设置为循环 ${loopCount} 次`)
            }
        }
    } catch (error) {
        // 用户取消
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
const publishNamedCommand = async (topic: string, name?: string) => {
    if (!rosConnection.isConnected()) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    const targetName = name || queueName.value.trim()

    if (!targetName) {
        ElMessage.warning('请输入队列名称')
        return
    }

    try {
        await rosConnection.publish(topic, 'std_msgs/String', { data: targetName })
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

// 监听 ThreeDPanel 的发布事件
onMounted(() => {
    if (threeDPanelRef.value?.setOnPosePublishedCallback) {
        threeDPanelRef.value.setOnPosePublishedCallback(handlePosePublished)
    }
})

onUnmounted(() => {
    if (threeDPanelRef.value?.setOnPosePublishedCallback) {
        threeDPanelRef.value.setOnPosePublishedCallback(null)
    }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlePosePublished = async (pose: any) => {
    if (isModifying.value) {
        // 构造修改消息
        const data = {
            index: modifyIndex.value,
            x: pose.position.x,
            y: pose.position.y,
            z: pose.position.z,
            qx: pose.orientation.x,
            qy: pose.orientation.y,
            qz: pose.orientation.z,
            qw: pose.orientation.w
        }

        try {
            await rosConnection.publish('/goal_queue/modify_point', 'std_msgs/String', { data: JSON.stringify(data) })
            ElMessage.success(`已修改点 #${modifyIndex.value + 1}`)
        } catch (error) {
            ElMessage.error('修改失败')
        } finally {
            isModifying.value = false
            modifyIndex.value = -1
        }
    } else if (isInserting.value) {
        // 构造插入消息
        const data = {
            index: insertIndex.value,
            x: pose.position.x,
            y: pose.position.y,
            z: pose.position.z,
            qx: pose.orientation.x,
            qy: pose.orientation.y,
            qz: pose.orientation.z,
            qw: pose.orientation.w
        }

        try {
            await rosConnection.publish('/goal_queue/insert_point', 'std_msgs/String', { data: JSON.stringify(data) })
            ElMessage.success(`已在 #${insertIndex.value + 1} 之前插入新点`)
        } catch (error) {
            ElMessage.error('插入失败')
        } finally {
            isInserting.value = false
            insertIndex.value = -1
        }
    } else {
        // 正常发布
        // 由于我们在 ThreeDPanel 中拦截了发布，这里需要手动发布
        // 但 ThreeDPanel 的逻辑是：如果有回调，调用回调；否则发布。
        // 所以这里不需要手动发布，除非我们想在这里处理所有发布逻辑。
        // 但我们只想拦截修改/插入。

        // 等等，如果我们在 ThreeDPanel 中设置了回调，那么 ThreeDPanel 就不会发布了。
        // 所以我们需要在这里处理正常的发布逻辑。

        const frameId = 'map'
        // 构造 geometry_msgs/PoseStamped 消息
        // 对应 Python 文件: cb_add_pose 接收 msg.pose.position 和 msg.pose.orientation
        // 或 cb_modify_point / cb_insert_point 处理修改/插入操作
        const now = new Date()
        const message = {
            header: {
                frame_id: frameId,
                stamp: {
                    sec: Math.floor(now.getTime() / 1000),
                    nsec: (now.getTime() % 1000) * 1000000
                }
            },
            pose: {
                position: {
                    x: pose.position.x,
                    y: pose.position.y,
                    z: pose.position.z || 0.0
                },
                orientation: {
                    x: pose.orientation.x,
                    y: pose.orientation.y,
                    z: pose.orientation.z,
                    w: pose.orientation.w
                }
            }
        }

        try {
            await rosConnection.publish(
                settingsStore.publishPoseTopic, // '/goal_queue/add_pose'
                'geometry_msgs/PoseStamped',
                message
            )
            ElMessage.success('发布成功')
        } catch (error) {
            ElMessage.error('发布失败')
        }
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

.control-group-label {
    font-size: 12px;
    color: #606266;
    margin-bottom: 8px;
    font-weight: 500;
}

:deep(.el-button span) {
    display: flex;
    align-items: center;
    gap: 4px;
}
</style>
