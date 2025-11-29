<template>
    <div class="robot-status-panel">
        <div class="status-header">
            <h3>机器狗状态</h3>
            <template v-if="isConnected">
                <el-tag type="success" size="small">
                    已连接
                </el-tag>
                <el-button size="small" @click="handleDisconnect">
                    切换
                </el-button>
            </template>
        </div>

        <!-- 未连接时只显示连接提示 -->
        <template v-if="!isConnected">
            <div class="connect-prompt">
                <div class="prompt-icon">
                    🤖
                </div>
                <p>请先连接到机器狗</p>
                <el-button type="primary" @click="showConnectionDialog = true">
                    立即连接
                </el-button>
            </div>
        </template>

        <!-- 连接后显示状态信息 -->
        <div v-else class="status-scroll-container">
            <div class="status-content">
                <template v-if="statusData">
                    <!-- 系统状态 -->
                    <div class="status-section">
                        <h4 class="section-title">
                            系统状态
                        </h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="label">状态:</span>
                                <span class="value"
                                    :class="statusData.motor_error_count ? 'error' : getSystemStatusClass(statusData.system_status)">
                                    {{ statusData.motor_error_count ? `${statusData.motor_error_count}个电机错误` :
                                        (statusData.system_status || 'N/A') }}
                                </span>
                            </div>
                            <div class="info-item">
                                <span class="label">主板温度:</span>
                                <span class="value">{{ (statusData.temp_ntc1 || 0).toFixed(0) }}°C</span>
                            </div>
                        </div>
                    </div>

                    <!-- 运动状态 -->
                    <div class="status-section">
                        <h4 class="section-title">
                            运动状态
                        </h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="label">位置:</span>
                                <span class="value">
                                    ({{ (statusData.position_x || 0).toFixed(2) }},
                                    {{ (statusData.position_y || 0).toFixed(2) }})m
                                </span>
                            </div>
                            <div class="info-item">
                                <span class="label">速度:</span>
                                <span class="value">{{ getTotalVelocity() }} m/s</span>
                            </div>
                        </div>
                    </div>

                    <!-- 电池状态 -->
                    <div class="status-section">
                        <h4 class="section-title">
                            电池状态
                        </h4>
                        <div class="battery-info">
                            <el-progress :percentage="batteryPercentage" :color="batteryColor" :stroke-width="20">
                                <span class="battery-text">{{ batteryPercentage }}%</span>
                            </el-progress>
                        </div>
                        <div class="info-grid" style="margin-top: 12px">
                            <div class="info-item">
                                <span class="label">模式:</span>
                                <span class="value">{{ getBatteryModeText(statusData.battery_mode) }}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">电池温度:</span>
                                <span class="value">{{ getBatteryAvgTemp() }}°C</span>
                            </div>
                        </div>
                    </div>

                    <!-- 电机状态 -->
                    <div class="status-section" v-if="statusData.motor_hottest_name">
                        <h4 class="section-title">
                            电机状态
                        </h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="label">最热:</span>
                                <span class="value">
                                    {{ getMotorNameText(statusData.motor_hottest_name) }}
                                    {{ (statusData.motor_hottest_temp || 0).toFixed(0) }}°C
                                </span>
                            </div>
                            <div class="info-item">
                                <span class="label">最冷:</span>
                                <span class="value">
                                    {{ getMotorNameText(statusData.motor_coolest_name) }}
                                    {{ (statusData.motor_coolest_temp || 0).toFixed(0) }}°C
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- 足端力 -->
                    <div class="status-section" v-if="statusData.foot_force_fr !== undefined">
                        <h4 class="section-title">
                            足端力
                        </h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="label">右前:</span>
                                <span class="value">{{ getFootForceInKg(statusData.foot_force_fr) }}kg</span>
                            </div>
                            <div class="info-item">
                                <span class="label">左前:</span>
                                <span class="value">{{ getFootForceInKg(statusData.foot_force_fl) }}kg</span>
                            </div>
                            <div class="info-item">
                                <span class="label">右后:</span>
                                <span class="value">{{ getFootForceInKg(statusData.foot_force_rr) }}kg</span>
                            </div>
                            <div class="info-item">
                                <span class="label">左后:</span>
                                <span class="value">{{ getFootForceInKg(statusData.foot_force_rl) }}kg</span>
                            </div>
                        </div>
                    </div>

                    <!-- 更新时间 -->
                    <div class="status-footer">
                        <span class="update-time">更新时间: {{ lastUpdateTime }}</span>
                    </div>
                </template>

                <template v-else>
                    <el-empty description="暂无数据" :image-size="100">
                        <template #image>
                            <div style="font-size: 48px">
                                🤖
                            </div>
                        </template>
                    </el-empty>
                </template>
            </div>
        </div>

        <!-- Connection Dialog -->
        <ConnectionDialog v-model="showConnectionDialog" @connected="onConnected" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElTag, ElProgress, ElEmpty, ElButton, ElMessage } from 'element-plus'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'
import ConnectionDialog from '@/components/ConnectionDialog.vue'
import type { RosMessage } from '@/types/ros'

const emit = defineEmits<{
    (e: 'switch-panel', panelId: string): void
}>()

const rosStore = useRosStore()
const showConnectionDialog = ref(false)

interface RobotStatus {
    // 电池信息
    battery_mode?: string          // 电池状态模式
    battery_soc?: number          // 电量百分比
    battery_cycle?: number        // 充电循环次数
    battery_temp_bat1?: number    // BAT1温度
    battery_temp_bat2?: number    // BAT2温度
    battery_current?: number      // 充放电电流(A)
    power_v?: number              // 主板电压(V)
    power_a?: number              // 主板电流(A)

    // 运动信息
    position_x?: number
    position_y?: number
    position_z?: number
    velocity_x?: number
    velocity_y?: number
    velocity_z?: number

    // 足端力
    foot_force_fr?: number
    foot_force_fl?: number
    foot_force_rr?: number
    foot_force_rl?: number

    // 电机信息
    motor_hottest_name?: string   // 最热电机名称
    motor_hottest_temp?: number   // 最热电机温度
    motor_coolest_name?: string   // 最冷电机名称
    motor_coolest_temp?: number   // 最冷电机温度
    motor_error_count?: number    // 错误电机数量

    // 系统状态
    system_status?: string        // 系统状态简述
    system_flags_detail?: string  // 系统标志详细描述
    temp_ntc1?: number           // 主板中心温度
    temp_ntc2?: number           // 自动充电温度
}

const statusData = ref<RobotStatus | null>(null)
const lastUpdateTime = ref<string>('--:--:--')
const isConnected = computed(() => rosStore.isConnected)

const handleDisconnect = () => {
    // 主动断开连接
    rosConnection.disconnect()
    ElMessage.info('已断开连接')
    showConnectionDialog.value = true
}

const onConnected = () => {
    ElMessage.success('连接成功')
    // 连接成功后切换到图像面板
    emit('switch-panel', 'image')
}

const batteryPercentage = computed(() => {
    return Math.round(statusData.value?.battery_soc || 0)
})

// 系统状态样式类
const getSystemStatusClass = (status?: string) => {
    if (!status) return ''
    if (status.includes('错误')) return 'error'
    if (status === '正常') return 'success'
    return 'warning'
}

// 电池模式翻译
const getBatteryModeText = (mode?: string) => {
    if (!mode) return 'N/A'
    const modeMap: Record<string, string> = {
        'dchg': '放电中',
        'chg': '充电中',
        'idle': '空闲',
        'discharge': '放电中',
        'charge': '充电中'
    }
    return modeMap[mode.toLowerCase()] || mode
}

// 电机名称翻译
const getMotorNameText = (name?: string) => {
    if (!name) return 'N/A'

    // 先处理带下划线的格式，如 RL_0, RR_1
    const match = name.match(/^(FR|FL|RR|RL)_?(\d*)$/i)
    if (match) {
        const position = match[1].toUpperCase()
        const motorNum = match[2] || ''
        const positionMap: Record<string, string> = {
            'FR': '右前',
            'FL': '左前',
            'RR': '右后',
            'RL': '左后'
        }
        return motorNum ? `${positionMap[position]}${motorNum}` : positionMap[position]
    }

    return name
}

// 将足端力从牛顿(N)转换为千克(kg)
const getFootForceInKg = (force?: number) => {
    if (!force) return '0.0'
    // 1N = 0.10197kg, 约等于 1/9.8
    return (force / 9.8).toFixed(1)
}

// 计算电池平均温度
const getBatteryAvgTemp = () => {
    const temp1 = statusData.value?.battery_temp_bat1 || 0
    const temp2 = statusData.value?.battery_temp_bat2 || 0
    return ((temp1 + temp2) / 2).toFixed(0)
}

// 计算总速度
const getTotalVelocity = () => {
    const vx = statusData.value?.velocity_x || 0
    const vy = statusData.value?.velocity_y || 0
    const vz = statusData.value?.velocity_z || 0
    return Math.sqrt(vx * vx + vy * vy + vz * vz).toFixed(2)
}

const batteryColor = computed(() => {
    const percentage = batteryPercentage.value
    if (percentage > 60) return '#67c23a'
    if (percentage > 30) return '#e6a23c'
    return '#f56c6c'
})

// 订阅状态话题
const subscribeToStatus = async () => {
    if (!rosConnection.isConnected()) {
        return
    }

    try {
        await rosConnection.subscribe({
            topic: '/go2/status',
            messageType: 'std_msgs/String',
            callback: (message: RosMessage) => {
                handleStatusMessage(message)
            }
        })
    } catch (error) {
        console.error('❌ 订阅状态话题失败:', error)
    }
}

// 解析字符串格式的状态数据（基于C++输出格式）
const parseStatusString = (statusString: string): RobotStatus => {
    const data: RobotStatus = {}
    const lines = statusString.split('\n')

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()

        // [Battery] 节
        if (line.includes('Mode:') && line.includes('SOC:')) {
            const modeMatch = line.match(/Mode:\s*(\w+)/)
            const socMatch = line.match(/SOC:\s*(\d+)%/)
            const cycleMatch = line.match(/Cycle:\s*(\d+)/)

            if (modeMatch) data.battery_mode = modeMatch[1]
            if (socMatch) data.battery_soc = parseInt(socMatch[1])
            if (cycleMatch) data.battery_cycle = parseInt(cycleMatch[1])
        }

        if (line.includes('Temp(BAT1/BAT2):')) {
            const tempMatch = line.match(/Temp\(BAT1\/BAT2\):\s*([-\d]+)°C\/([-\d]+)°C/)
            if (tempMatch) {
                data.battery_temp_bat1 = parseFloat(tempMatch[1])
                data.battery_temp_bat2 = parseFloat(tempMatch[2])
            }
        }

        if (line.includes('Current:') && line.includes('Power Board:')) {
            const currentMatch = line.match(/Current:\s*([-\d.]+)A/)
            const powerMatch = line.match(/Power Board:\s*([\d.]+)V,\s*([\d.]+)A/)

            if (currentMatch) data.battery_current = parseFloat(currentMatch[1])
            if (powerMatch) {
                data.power_v = parseFloat(powerMatch[1])
                data.power_a = parseFloat(powerMatch[2])
            }
        }

        // [Motion] 节
        if (line.includes('Pos (m):')) {
            const posMatch = line.match(/Pos \(m\):\s*\[([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\]/)
            if (posMatch) {
                data.position_x = parseFloat(posMatch[1])
                data.position_y = parseFloat(posMatch[2])
                data.position_z = parseFloat(posMatch[3])
            }
        }

        if (line.includes('Vel (m/s):')) {
            const velMatch = line.match(/Vel \(m\/s\):\s*\[([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\]/)
            if (velMatch) {
                data.velocity_x = parseFloat(velMatch[1])
                data.velocity_y = parseFloat(velMatch[2])
                data.velocity_z = parseFloat(velMatch[3])
            }
        }

        // [Foot Force] 节
        if (line.includes('FR:') && line.includes('FL:')) {
            const forceMatch = line.match(/FR:([-\d]+)N.*FL:([-\d]+)N.*RR:([-\d]+)N.*RL:([-\d]+)N/)
            if (forceMatch) {
                data.foot_force_fr = parseInt(forceMatch[1])
                data.foot_force_fl = parseInt(forceMatch[2])
                data.foot_force_rr = parseInt(forceMatch[3])
                data.foot_force_rl = parseInt(forceMatch[4])
            }
        }

        // [Motors] 节
        if (line.includes('Hottest') && line.includes('Coolest')) {
            const motorMatch = line.match(/Hottest\s+(\w+)=([-\d]+)°C.*Coolest\s+(\w+)=([-\d]+)°C.*Error Motors=(\d+)/)
            if (motorMatch) {
                data.motor_hottest_name = motorMatch[1]
                data.motor_hottest_temp = parseFloat(motorMatch[2])
                data.motor_coolest_name = motorMatch[3]
                data.motor_coolest_temp = parseFloat(motorMatch[4])
                data.motor_error_count = parseInt(motorMatch[5])
            }
        }

        // [System] 节
        if (line.includes('Flags:') && line.includes('->')) {
            const flagMatch = line.match(/Flags:\s*(\S+)\s*->\s*(.+)/)
            if (flagMatch) {
                data.system_status = flagMatch[1]
                data.system_flags_detail = flagMatch[2]
            }
        }

        if (line.includes('Main Board Temp:')) {
            const tempMatch = line.match(/Main Board Temp:\s*([-\d]+)°C.*Charging Temp:\s*([-\d]+)°C/)
            if (tempMatch) {
                data.temp_ntc1 = parseFloat(tempMatch[1])
                data.temp_ntc2 = parseFloat(tempMatch[2])
            }
        }
    }

    return data
}

// 处理状态消息
const handleStatusMessage = (message: RosMessage) => {
    try {
        let statusString: string

        if (typeof message === 'string') {
            statusString = message
        } else if (message.data && typeof message.data === 'string') {
            // std_msgs/String 类型
            statusString = message.data
        } else {
            console.error('❌ 未知的消息格式:', message)
            return
        }

        // 解析字符串格式的状态数据
        statusData.value = parseStatusString(statusString)
        lastUpdateTime.value = new Date().toLocaleTimeString()
    } catch (error) {
        console.error('❌ 解析状态消息失败:', error, message)
    }
}// 监听ROS连接状态，连接成功后订阅话题
watch(() => rosStore.isConnected, (connected) => {
    if (connected) {
        subscribeToStatus()
    }
}, { immediate: true })

onMounted(() => {
    // 如果已经连接，立即订阅
    if (rosStore.isConnected) {
        subscribeToStatus()
    }
})

onUnmounted(() => {
    if (rosConnection.isConnected()) {
        rosConnection.unsubscribe('/go2/status')
    }
})
</script>

<style scoped>
.robot-status-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #fff;
}

.status-header {
    padding: 16px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: #fafafa;
    gap: 8px;
}

.connect-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
}

.prompt-icon {
    font-size: 64px;
    margin-bottom: 16px;
}

.connect-prompt p {
    margin: 0 0 24px 0;
    color: #666;
    font-size: 14px;
}

.status-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #333;
}

.status-scroll-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
}

.status-content {
    padding: 16px;
}

.status-section {
    margin-bottom: 20px;
    padding: 12px;
    background-color: #fafafa;
    border-radius: 6px;
    border: 1px solid #e8e8e8;
}

.section-title {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: #1890ff;
    border-bottom: 1px solid #e0e0e0;
    padding-bottom: 8px;
}

.info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}

.info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.info-item .label {
    font-size: 12px;
    color: #666;
}

.info-item .value {
    font-size: 14px;
    font-weight: 500;
    color: #333;
}

.info-item .value.success {
    color: #67c23a;
}

.info-item .value.error {
    color: #f56c6c;
}

.info-item .value.warning {
    color: #e6a23c;
}

.info-item .value.charging {
    color: #409EFF;
}

.info-item .value.discharging {
    color: #666;
}

.info-item.full-width {
    grid-column: 1 / -1;
}

.battery-info {
    padding: 8px 0;
}

.battery-text {
    font-weight: 600;
}

.status-footer {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #e0e0e0;
    text-align: center;
}

.update-time {
    font-size: 12px;
    color: #999;
}
</style>
