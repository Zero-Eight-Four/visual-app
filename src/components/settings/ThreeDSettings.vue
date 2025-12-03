<template>
    <div class="settings-panel">
        <el-scrollbar height="100%">
            <div class="settings-content">
                <!-- 导航控制 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <Location />
                        </el-icon>
                        <span>系统控制</span>
                    </div>
                    <div class="button-container">
                        <div style="width: 100%; display: flex; gap: 8px;">
                            <el-button :type="isNavigationRunning ? 'warning' : 'success'" plain size="small"
                                style="flex: 1" :loading="navigationLoading" @click="handleToggleNavigation">
                                <el-icon style="margin-right: 4px">
                                    <VideoPlay v-if="!isNavigationRunning" />
                                    <VideoPause v-else />
                                </el-icon>
                                {{ isNavigationRunning ? '停止' : '加载地图' }}
                            </el-button>
                        </div>
                        <div v-if="isNavigationRunning"
                            style="margin-top: 8px; padding: 8px; background-color: #f0f9ff; border-radius: 4px; font-size: 12px; color: #409eff;">
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
                        <span>路线管理</span>
                    </div>

                    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                        <el-select v-model="queueName" placeholder="选择路线名称" size="small" filterable clearable
                            class="queue-select" style="flex: 1;" :disabled="!isNavigationRunning || !isConnected">
                            <el-option v-for="name in availableQueues" :key="name" :label="name" :value="name" />
                        </el-select>
                        <el-button size="small" :loading="isRefreshingList" title="刷新列表"
                            :disabled="!isNavigationRunning || !isConnected" @click="refreshQueueList">
                            <el-icon>
                                <Refresh />
                            </el-icon>
                        </el-button>
                    </div>
                    <div class="button-grid compact">
                        <el-button size="small" :disabled="!isNavigationRunning || !isConnected"
                            @click="handleSaveQueue">
                            <el-icon>
                                <FolderAdd />
                            </el-icon>
                            保存
                        </el-button>
                        <el-button size="small" :disabled="!isNavigationRunning || !isConnected || !queueName"
                            @click="handleLoadQueue">
                            <el-icon>
                                <FolderOpened />
                            </el-icon>
                            加载
                        </el-button>
                        <el-button size="small" type="danger"
                            :disabled="!isNavigationRunning || !isConnected || !queueName" @click="confirmDeleteNamed">
                            <el-icon>
                                <FolderDelete />
                            </el-icon>
                            删除
                        </el-button>
                    </div>
                </div>

                <!-- 任务控制 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <Operation />
                        </el-icon>
                        <span>路线控制</span>
                    </div>
                    <div class="button-container">
                        <div style="width: 100%; display: flex; gap: 8px; margin-bottom: 8px;">
                            <el-button type="success" plain size="small" style="flex: 1"
                                :disabled="!isNavigationRunning || !isConnected"
                                @click="publishCommand('/goal_queue/start')">
                                <el-icon style="margin-right: 4px">
                                    <VideoPlay />
                                </el-icon>
                                开始
                            </el-button>
                            <el-button type="warning" plain size="small" style="flex: 1"
                                :disabled="!isNavigationRunning || !isConnected"
                                @click="publishCommand('/goal_queue/stop')">
                                <el-icon style="margin-right: 4px">
                                    <VideoPause />
                                </el-icon>
                                停止
                            </el-button>
                        </div>
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <el-button type="danger" plain size="small" style="flex: 1"
                                :disabled="!isNavigationRunning || !isConnected"
                                @click="publishCommand('/goal_queue/clear')">
                                <el-icon style="margin-right: 4px">
                                    <Delete />
                                </el-icon>
                                清空
                            </el-button>
                        </div>

                        <!-- 定时启动 -->
                        <div class="control-group-label" style="margin-top: 0;">
                            定时启动
                        </div>
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <el-button :type="scheduledStartTimer ? 'warning' : 'info'" plain size="small"
                                style="flex: 1" :disabled="!isNavigationRunning || !isConnected"
                                @click="handleScheduledStartSimple">
                                <el-icon style="margin-right: 4px">
                                    <Clock v-if="!scheduledStartTimer" />
                                    <Close v-else />
                                </el-icon>
                                {{ scheduledStartTimer ? '取消定时' : '定时启动' }}
                            </el-button>
                        </div>
                        <div v-if="scheduledStartTimer"
                            style="margin-bottom: 8px; padding: 8px; background-color: #fff7e6; border-radius: 4px; font-size: 12px;">
                            <div
                                style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span style="color: #606266;">
                                    <el-icon style="margin-right: 4px;">
                                        <Timer />
                                    </el-icon>
                                    倒计时：
                                </span>
                                <span style="color: #e6a23c; font-weight: 500; font-size: 14px;">
                                    {{ formatCountdown(scheduledStartCountdown) }}
                                </span>
                            </div>
                            <div
                                style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #909399;">
                                <span>目标时间：</span>
                                <span>{{ formatScheduledTime(scheduledStartTime) }}</span>
                            </div>
                        </div>

                        <!-- 循环模式设置 -->
                        <div class="control-group-label" style="margin-top: 0;">
                            循环模式设置
                        </div>
                        <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                            <el-button :type="loopMode === -1 ? 'primary' : 'default'" plain size="small"
                                style="flex: 1" :disabled="!isNavigationRunning || !isConnected"
                                @click="setLoopMode(-1)">
                                无限循环
                            </el-button>
                            <el-button :type="loopMode === 0 ? 'primary' : 'default'" plain size="small" style="flex: 1"
                                :disabled="!isNavigationRunning || !isConnected" @click="setLoopMode(0)">
                                单次运行
                            </el-button>
                            <el-button :type="loopMode > 0 ? 'primary' : 'default'" plain size="small" style="flex: 1"
                                :disabled="!isNavigationRunning || !isConnected" @click="handleSetLoopCount">
                                指定次数
                            </el-button>
                        </div>
                        <div v-if="loopMode > 0"
                            style="margin-bottom: 8px; padding: 6px; background-color: #f5f7fa; border-radius: 4px; font-size: 12px; color: #606266;">
                            <el-icon style="margin-right: 4px;">
                                <InfoFilled />
                            </el-icon>
                            当前设置：循环 {{ loopMode }} 次
                        </div>

                        <!-- 任务状态显示 -->
                        <div v-if="taskStatus.queueSize > 0"
                            style="margin-top: 8px; padding: 8px; background-color: #f0f9ff; border-radius: 4px; font-size: 12px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span style="color: #606266;">队列点数：</span>
                                <span style="color: #409eff; font-weight: 500;">{{ taskStatus.queueSize }}</span>
                            </div>
                            <div v-if="taskStatus.isRunning"
                                style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span style="color: #606266;">当前点：</span>
                                <span style="color: #67c23a; font-weight: 500;">{{ taskStatus.currentIndex + 1 }} / {{
                                    taskStatus.queueSize }}</span>
                            </div>
                            <div v-if="taskStatus.isRunning && loopMode !== 0"
                                style="display: flex; justify-content: space-between;">
                                <span style="color: #606266;">循环进度：</span>
                                <span style="color: #409eff; font-weight: 500;">
                                    <span v-if="loopMode === -1">第 {{ taskStatus.currentLoop + 1 }} 轮</span>
                                    <span v-else>{{ taskStatus.currentLoop }} / {{ loopMode }} 轮</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 任务编辑 -->
                <div class="settings-section">
                    <div class="section-header">
                        <el-icon>
                            <EditPen />
                        </el-icon>
                        <span>路线编辑</span>
                    </div>

                    <div class="control-group-label">
                        添加点位
                    </div>
                    <div class="button-grid">
                        <el-button :type="publishType === 'pose_estimate' ? 'primary' : 'default'" size="small"
                            :disabled="!isNavigationRunning || !isConnected"
                            @click="handlePublishCommand('pose_estimate')">
                            <el-icon>
                                <Position />
                            </el-icon>
                            初始位姿
                        </el-button>
                        <el-button :type="publishType === 'pose' ? 'primary' : 'default'" size="small"
                            :disabled="!isNavigationRunning || !isConnected" @click="handlePublishCommand('pose')">
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
                        <el-button size="small" style="flex: 1" :disabled="!isNavigationRunning || !isConnected"
                            @click="handleModifyPoint">
                            <el-icon style="margin-right: 4px">
                                <Edit />
                            </el-icon>
                            修改
                        </el-button>
                        <el-button size="small" style="flex: 1" :disabled="!isNavigationRunning || !isConnected"
                            @click="handleInsertPoint">
                            <el-icon style="margin-right: 4px">
                                <Plus />
                            </el-icon>
                            插入
                        </el-button>
                        <el-button size="small" type="danger" plain style="flex: 1"
                            :disabled="!isNavigationRunning || !isConnected" @click="handleDeletePoint">
                            <el-icon style="margin-right: 4px">
                                <Minus />
                            </el-icon>
                            删除
                        </el-button>
                    </el-button-group>
                </div>
            </div>
        </el-scrollbar>

        <!-- 时间选择对话框 -->
        <el-dialog v-model="showTimePickerDialog" title="定时启动任务（24小时制）" width="400px" :close-on-click-modal="false">
            <div style="padding: 20px 0;">
                <div style="margin-bottom: 15px; color: #606266; font-size: 13px;">
                    请选择启动时间（24小时制）：
                </div>
                <el-time-picker v-model="selectedTime" format="HH:mm" value-format="HH:mm" placeholder="选择时间"
                    style="width: 100%" size="default" />
                <div style="margin-top: 15px; color: #909399; font-size: 12px;">
                    当前时间：{{ new Date().toLocaleTimeString('zh-CN', { hour12: false }) }}
                </div>
                <div style="margin-top: 8px; color: #909399; font-size: 11px;">
                    提示：只能选择当前时间之后的时间，如果选择的时间已过今天，将自动设置为明天该时间
                </div>
            </div>
            <template #footer>
                <el-button @click="showTimePickerDialog = false">取消</el-button>
                <el-button type="primary" @click="confirmScheduledStart">确定</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, inject, type Ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { ElScrollbar, ElButton, ElButtonGroup, ElMessage, ElMessageBox, ElSelect, ElOption, ElIcon, ElTimePicker, ElDialog } from 'element-plus'
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
    Location,
    CircleCheck,
    InfoFilled,
    Clock,
    Close,
    Timer
} from '@element-plus/icons-vue'
import { rosConnection } from '@/services/rosConnection'
import { use3DSettingsStore } from '@/stores/threeDSettings'
import { useRosStore } from '@/stores/ros'
import type { PublishClickType } from '@/utils/PublishClickTool'

const settingsStore = use3DSettingsStore()
const rosStore = useRosStore()
const queueName = ref('')

// 计算属性：检查是否已连接
const isConnected = computed(() => rosStore.connectionState.connected)
const availableQueues = ref<string[]>([])
const publishType = ref<PublishClickType>('pose')
const isRefreshingList = ref(false)

// 导航控制状态
const isNavigationRunning = ref(false)
const navigationLoading = ref(false)

// 任务控制状态
const loopMode = ref(0) // -1=无限循环, 0=不循环（单次执行）, >0=指定次数
const taskStatus = ref({
    queueSize: 0,
    currentIndex: 0,
    currentLoop: 0,
    isRunning: false
})

// 定时启动状态
const scheduledStartTimer = ref<number | null>(null) // 定时器ID
const scheduledStartCountdown = ref(0) // 倒计时（秒）
const scheduledStartTime = ref<Date | null>(null) // 目标启动时间（北京时间）
const countdownInterval = ref<number | null>(null) // 倒计时更新定时器
const showTimePickerDialog = ref(false) // 显示时间选择对话框
const selectedTime = ref<string>('') // 选择的时间（HH:mm:ss格式）

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
        // 如果是列表命令，订阅 /goal_queue/list 话题（后端会定期发布，无需发送命令）
        if (topic === '/goal_queue/list') {
            ElMessage.success('正在获取队列列表...')
            await subscribeToQueueList()
            // 后端以 1Hz 频率自动发布，且使用 latch=true，订阅后立即能收到最新消息
            // 等待一下确保消息到达
            setTimeout(() => {
                if (availableQueues.value.length > 0) {
                    ElMessage.success(`已获取 ${availableQueues.value.length} 个队列`)
                } else {
                    ElMessage.info('没有可用的队列')
                }
            }, 500)
        } else {
            await rosConnection.publish(topic, 'std_msgs/Empty', {})
            ElMessage.success('命令已发送')
        }
    } catch (error) {
        console.error('Failed to publish command:', error)
        ElMessage.error('命令发送失败')
    }
}

// 处理导航启动/停止切换
const handleToggleNavigation = async () => {
    if (!rosConnection.isConnected()) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    navigationLoading.value = true
    try {
        const command = isNavigationRunning.value ? 'stop' : 'start'
        // 发布消息到 /trigger_launch 话题
        await rosConnection.publish('/trigger_launch', 'std_msgs/String', { data: command })

        // 注意：状态更新将通过订阅的状态话题来更新，这里不直接修改状态
        // 但为了用户体验，可以立即更新UI（状态话题会最终确认）
        if (command === 'start') {
            ElMessage.success('正在启动导航系统...')
        } else {
            ElMessage.success('正在停止导航系统...')
        }
    } catch (error) {
        console.error('Failed to toggle navigation:', error)
        ElMessage.error(isNavigationRunning.value ? '停止导航失败' : '加载地图失败')
    } finally {
        navigationLoading.value = false
    }
}

// 订阅导航状态话题
const subscribeToNavigationStatus = async () => {
    if (!rosConnection.isConnected()) {
        return
    }

    try {
        await rosConnection.subscribe({
            topic: '/launch_trigger_status',
            messageType: 'std_msgs/String',
            callback: (message: any) => {
                try {
                    let statusString: string
                    if (typeof message === 'string') {
                        statusString = message
                    } else if (message.data && typeof message.data === 'string') {
                        statusString = message.data
                    } else {
                        console.error('未知的状态消息格式:', message)
                        return
                    }

                    // 解析状态字符串，格式: "status:running,pid:123,package:xxx,file:xxx" 或 "status:stopped,package:xxx,file:xxx"
                    if (statusString.includes('status:running')) {
                        isNavigationRunning.value = true
                    } else if (statusString.includes('status:stopped')) {
                        isNavigationRunning.value = false
                    }
                } catch (error) {
                    console.error('解析导航状态失败:', error, message)
                }
            }
        })
    } catch (error) {
        console.error('订阅导航状态话题失败:', error)
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
            inputValue: queueName.value || '', // 如果有选中的队列则预填，否则留空
            inputPlaceholder: '留空则保存为 default'
        })

        // 如果用户没有输入或输入为空，使用默认名称"default"
        const queueNameToSave = (value && value.trim()) ? value.trim() : 'default'
        await publishNamedCommand('/goal_queue/save_named', queueNameToSave)
        // 保存成功后，延迟刷新队列列表
        setTimeout(() => {
            refreshQueueList()
        }, 500)
    } catch (error) {
        // 用户取消，不执行保存
    }
}

const handleLoadQueue = async () => {
    await publishNamedCommand('/goal_queue/load_named')
    // 加载队列后不再自动刷新列表，用户需要手动点击刷新按钮
}

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

// 设置循环模式（快速选择）
const setLoopMode = async (mode: number) => {
    if (!rosConnection.isConnected()) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    try {
        await rosConnection.publish('/goal_queue/set_loop_count', 'std_msgs/Int32', { data: mode })
        loopMode.value = mode

        if (mode === -1) {
            ElMessage.success('已设置为无限循环模式')
        } else if (mode === 0) {
            ElMessage.success('已设置为单次运行模式')
        } else {
            ElMessage.success(`已设置为循环 ${mode} 次`)
        }
    } catch (error) {
        console.error('Failed to set loop mode:', error)
        ElMessage.error('设置循环模式失败')
    }
}

// 设置指定循环次数
const handleSetLoopCount = async () => {
    if (!rosConnection.isConnected()) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    try {
        const { value } = await ElMessageBox.prompt(
            '请输入循环次数 (>0: 指定次数)',
            '设置循环次数',
            {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                inputPattern: /^[1-9]\d*$/,
                inputErrorMessage: '请输入大于0的整数',
                inputValue: loopMode.value > 0 ? String(loopMode.value) : '1',
                inputType: 'number'
            }
        )

        if (value !== null) {
            const loopCount = parseInt(value)
            await rosConnection.publish('/goal_queue/set_loop_count', 'std_msgs/Int32', { data: loopCount })
            loopMode.value = loopCount
            ElMessage.success(`已设置为循环 ${loopCount} 次`)
        }
    } catch (error) {
        // 用户取消
    }
}

// 处理定时启动（使用滑动选择时间）
const handleScheduledStartSimple = async () => {
    if (!rosConnection.isConnected()) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    // 如果已有定时器，取消它
    if (scheduledStartTimer.value !== null) {
        cancelScheduledStart()
        return
    }

    // 设置默认时间为当前时间+10分钟
    const now = new Date()
    now.setMinutes(now.getMinutes() + 10)
    const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    selectedTime.value = defaultTime

    // 显示时间选择对话框
    showTimePickerDialog.value = true
}

// 确认定时启动
const confirmScheduledStart = () => {
    if (!selectedTime.value) {
        ElMessage.warning('请选择启动时间')
        return
    }

    // 解析选择的时间（HH:mm格式）
    const [hours, minutes] = selectedTime.value.split(':')
    const selectedHour = parseInt(hours)
    const selectedMinute = parseInt(minutes)

    if (isNaN(selectedHour) || isNaN(selectedMinute) || selectedHour < 0 || selectedHour > 23 || selectedMinute < 0 || selectedMinute > 59) {
        ElMessage.error('时间格式错误')
        return
    }

    // 计算目标时间（秒数默认为0）
    const now = new Date()
    const targetTime = new Date()
    targetTime.setHours(selectedHour, selectedMinute, 0, 0)

    // 如果选择的时间在今天已经过了，设置为明天
    if (targetTime.getTime() <= now.getTime()) {
        targetTime.setDate(targetTime.getDate() + 1)
    }

    // 再次检查，确保目标时间一定在当前时间之后
    const delay = targetTime.getTime() - now.getTime()
    const delaySeconds = Math.floor(delay / 1000)

    if (delaySeconds <= 0) {
        ElMessage.warning('启动时间必须晚于当前时间，请重新选择')
        return
    }

    // 如果延迟时间太短（小于1分钟），提示用户
    if (delaySeconds < 60) {
        ElMessage.warning('定时启动时间至少需要1分钟后，请重新选择')
        return
    }

    startScheduledStart(delaySeconds, targetTime)
    showTimePickerDialog.value = false
}

// 格式化时间为字符串（只显示时间，不显示日期，不显示秒）
const formatTimeOnly = (date: Date): string => {
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${hour}:${minute}`
}

// 启动定时启动
const startScheduledStart = (delaySeconds: number, targetTime: Date) => {
    // 取消之前的定时器（如果有），但不显示消息
    if (scheduledStartTimer.value !== null) {
        clearTimeout(scheduledStartTimer.value)
        scheduledStartTimer.value = null
    }
    if (countdownInterval.value !== null) {
        clearInterval(countdownInterval.value)
        countdownInterval.value = null
    }

    scheduledStartCountdown.value = delaySeconds
    scheduledStartTime.value = targetTime

    // 启动倒计时更新
    countdownInterval.value = window.setInterval(() => {
        scheduledStartCountdown.value--
        if (scheduledStartCountdown.value <= 0) {
            clearInterval(countdownInterval.value!)
            countdownInterval.value = null
        }
    }, 1000)

    // 设置定时器，延迟执行任务启动
    scheduledStartTimer.value = window.setTimeout(() => {
        // 执行任务启动
        publishCommand('/goal_queue/start')
        ElMessage.success('定时启动任务已执行')

        // 清理定时器
        scheduledStartTimer.value = null
        scheduledStartCountdown.value = 0
        scheduledStartTime.value = null
        if (countdownInterval.value !== null) {
            clearInterval(countdownInterval.value)
            countdownInterval.value = null
        }
    }, delaySeconds * 1000)

    const timeStr = formatTimeOnly(targetTime)
    const isTomorrow = targetTime.getDate() !== new Date().getDate()
    const dateStr = isTomorrow ? '明天' : '今天'
    ElMessage.success(`已设置定时启动，将在 ${dateStr} ${timeStr} 执行`)
}

// 取消定时启动
const cancelScheduledStart = (showMessage: boolean = true) => {
    const hadTimer = scheduledStartTimer.value !== null || countdownInterval.value !== null

    if (scheduledStartTimer.value !== null) {
        clearTimeout(scheduledStartTimer.value)
        scheduledStartTimer.value = null
    }
    if (countdownInterval.value !== null) {
        clearInterval(countdownInterval.value)
        countdownInterval.value = null
    }
    scheduledStartCountdown.value = 0
    scheduledStartTime.value = null

    // 只有在有定时器且需要显示消息时才显示
    if (showMessage && hadTimer) {
        ElMessage.info('已取消定时启动')
    }
}

// 格式化倒计时显示
const formatCountdown = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    } else if (minutes > 0) {
        return `${minutes}:${String(secs).padStart(2, '0')}`
    } else {
        return `${secs} 秒`
    }
}

// 格式化定时启动时间显示（只显示时间）
const formatScheduledTime = (date: Date | null): string => {
    if (!date) return ''
    const isTomorrow = date.getDate() !== new Date().getDate()
    const dateStr = isTomorrow ? '明天' : '今天'
    return `${dateStr} ${formatTimeOnly(date)}`
}

// 订阅任务状态（通过 /rosout 获取任务执行信息）
// 注意：这个订阅会与 subscribeToQueueList 共享 /rosout 订阅
// 实际状态更新在 subscribeToQueueList 的回调中处理
const subscribeToTaskStatus = async () => {
    // 状态更新逻辑已合并到 subscribeToQueueList 中
    // 这里保留函数以保持接口一致性
}


// 订阅 /goal_queue/list 话题获取队列列表
let queueListSubscription: any = null

const subscribeToQueueList = async () => {
    try {
        // 先取消旧订阅（如果有）
        if (queueListSubscription) {
            rosConnection.unsubscribe('/goal_queue/list')
            queueListSubscription = null
        }

        await rosConnection.subscribe({
            topic: '/goal_queue/list',
            messageType: 'std_msgs/String',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            callback: (message: any) => {
                try {
                    // 解析消息数据
                    let jsonStr: string
                    if (typeof message === 'string') {
                        jsonStr = message
                    } else if (message.data && typeof message.data === 'string') {
                        jsonStr = message.data
                    } else {
                        return
                    }

                    // 解析 JSON
                    const data = JSON.parse(jsonStr)

                    if (data.queues && Array.isArray(data.queues)) {
                        const queues: string[] = []
                        const queueInfoMap = new Map<string, number>()

                        for (const queueInfo of data.queues) {
                            if (queueInfo.name && typeof queueInfo.name === 'string') {
                                const queueName = queueInfo.name.trim()
                                const pointCount = queueInfo.points || 0
                                if (queueName) {
                                    queues.push(queueName)
                                    queueInfoMap.set(queueName, pointCount)
                                }
                            }
                        }

                        if (queues.length > 0) {
                            availableQueues.value = queues
                            // 如果当前选中的队列在列表中，更新队列大小
                            if (queueName.value && queueInfoMap.has(queueName.value)) {
                                taskStatus.value.queueSize = queueInfoMap.get(queueName.value) || 0
                            }
                        } else {
                            availableQueues.value = []
                        }
                    } else {
                        availableQueues.value = []
                    }
                } catch (error) {
                    console.error('Failed to parse queue list message:', error)
                }
            }
        })

        // 保存订阅引用，用于后续取消
        queueListSubscription = true
    } catch (error) {
        console.error('Failed to subscribe to queue list:', error)
        ElMessage.error('订阅队列列表失败')
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
        ElMessage.warning('请输入路线名称')
        return
    }

    try {
        await ElMessageBox.confirm(
            `确定要删除路线"${queueName.value}"吗？`,
            '确认删除',
            {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            }
        )
        await publishNamedCommand('/goal_queue/delete_named')
        // 删除成功后，延迟刷新队列列表
        setTimeout(() => {
            refreshQueueList()
        }, 500)
    } catch (error) {
        // 用户取消
    }
}

// 监听导航状态变化，成功启动后自动刷新任务队列列表
watch(isNavigationRunning, (newValue, oldValue) => {
    // 当导航从停止状态变为运行状态时（成功启动），自动刷新任务队列列表
    if (newValue === true && oldValue === false) {
        // 延迟刷新，等待导航系统完全启动（延长等待时间）
        setTimeout(() => {
            refreshQueueList()
        }, 15000)
    }
})

// 监听 ROS 连接状态，连接成功后订阅导航状态话题和任务状态
watch(() => rosStore.isConnected, (connected) => {
    if (connected) {
        // 延迟订阅，等待话题列表更新
        setTimeout(() => {
            subscribeToNavigationStatus()
            subscribeToTaskStatus()
            // 自动订阅队列列表（后端会定期发布，使用 latch=true）
            subscribeToQueueList()
        }, 1000)
    } else {
        // 断开连接时取消订阅
        rosConnection.unsubscribe('/launch_trigger_status')
        rosConnection.unsubscribe('/goal_queue/list')
        if (queueListSubscription) {
            queueListSubscription = null
        }
        // 重置状态
        isNavigationRunning.value = false
        taskStatus.value = {
            queueSize: 0,
            currentIndex: 0,
            currentLoop: 0,
            isRunning: false
        }
        availableQueues.value = []
    }
}, { immediate: true })

// 监听 ThreeDPanel 的发布事件
onMounted(() => {
    if (threeDPanelRef.value?.setOnPosePublishedCallback) {
        threeDPanelRef.value.setOnPosePublishedCallback(handlePosePublished)
    }

    // 如果已经连接，立即订阅状态话题并设置默认循环模式
    if (rosStore.isConnected) {
        setTimeout(() => {
            subscribeToNavigationStatus()
            subscribeToTaskStatus()
            // 设置默认循环模式为单次执行（0）
            rosConnection.publish('/goal_queue/set_loop_count', 'std_msgs/Int32', { data: 0 }).catch(() => {
                // 静默失败，不影响其他初始化
            })
        }, 1000)
    }
})

onUnmounted(() => {
    // 取消队列列表订阅
    if (queueListSubscription) {
        rosConnection.unsubscribe('/goal_queue/list')
        queueListSubscription = null
    }

    if (threeDPanelRef.value?.setOnPosePublishedCallback) {
        threeDPanelRef.value.setOnPosePublishedCallback(null)
    }

    // 清理订阅
    rosConnection.unsubscribe('/launch_trigger_status')

    // 注意：不清理定时启动定时器，因为使用了 keep-alive，组件状态会被保持
    // 定时器会继续运行，即使切换面板也不会被清理
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
