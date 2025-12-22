<template>
    <div class="ai-panel">
        <el-tabs v-model="activeTab" class="demo-tabs">
            <el-tab-pane label="视频检测" name="video">
                <div class="tab-content">
                    <!-- Server Video Library -->
                    <div class="folder-section">
                        <div class="filter-bar">
                            <el-select v-model="selectedDate" placeholder="选择日期" style="width: 200px; margin-right: 10px;" @change="handleDateChange">
                                <el-option
                                    v-for="date in availableDates"
                                    :key="date"
                                    :label="date"
                                    :value="date"
                                />
                            </el-select>
                            <el-button @click="refreshVideoList" :icon="Refresh">刷新列表</el-button>
                        </div>

                        <div v-if="selectedDate && videosByDate && videosByDate[selectedDate]" class="video-list">
                            <el-table :data="videosByDate[selectedDate]" style="width: 100%" @selection-change="handleSelectionChange">
                                <el-table-column type="selection" width="55" />
                                <el-table-column prop="name" label="文件名" />
                                <el-table-column prop="size" label="大小" width="120">
                                    <template #default="scope">
                                        {{ (scope.row.size / 1024 / 1024).toFixed(2) }} MB
                                    </template>
                                </el-table-column>
                            </el-table>
                            
                            <div style="margin-top: 15px; text-align: left;">
                                <el-button type="primary" @click="submitBatchServerVideos" :disabled="selectedVideos.length === 0" :loading="loading">
                                    检测选中视频
                                </el-button>
                            </div>
                        </div>
                        <div v-else class="empty-state">
                            <el-empty description="请选择日期查看视频" />
                        </div>
                    </div>

                    <!-- Results Display -->
                    <div v-if="detectionResults.length > 0" class="results-section">
                        <h3>检测结果</h3>
                        <el-scrollbar height="400px">
                            <el-card v-for="(item, index) in detectionResults" :key="index" class="result-card" shadow="hover">
                                <template #header>
                                    <div class="card-header">
                                        <span>{{ item.filename }}</span>
                                        <el-tag :type="item.result?.['异常发现'] ? 'danger' : 'success'">
                                            {{ item.result?.['异常发现'] ? '异常' : '正常' }}
                                        </el-tag>
                                    </div>
                                </template>
                                <div class="result-content">
                                    <p><strong>异常类型:</strong> {{ item.result?.['异常类型']?.join(', ') || '无' }}</p>
                                    <p><strong>描述:</strong> {{ item.result?.['异常描述'] }}</p>
                                    <p><strong>严重程度:</strong> {{ item.result?.['严重程度'] }}</p>
                                    <p><strong>建议:</strong> {{ item.result?.['建议处理'] }}</p>
                                    <div v-if="item.report_url" style="margin-top: 10px;">
                                        <el-link :href="getReportFullUrl(item.report_url)" target="_blank" type="primary">查看报告</el-link>
                                    </div>
                                </div>
                            </el-card>
                        </el-scrollbar>
                    </div>
                </div>
            </el-tab-pane>

            <el-tab-pane label="视频流管理" name="streams">
                <div class="tab-content">
                    <div class="stream-actions">
                        <el-button type="primary" @click="showAddStreamDialog = true">添加视频流</el-button>
                        <el-button @click="refreshStreams">刷新列表</el-button>
                    </div>
                    
                    <el-table :data="streams" style="width: 100%; margin-top: 20px;" v-loading="streamsLoading">
                        <el-table-column prop="name" label="名称" width="150" />
                        <el-table-column prop="rtsp_url" label="RTSP地址" show-overflow-tooltip />
                        <el-table-column prop="location" label="位置" width="120" />
                        <el-table-column label="操作" width="250">
                            <template #default="scope">
                                <el-button size="small" @click="openScheduleDialog(scope.row)">定时录制</el-button>
                                <el-button type="danger" size="small" @click="deleteStream(scope.row.id)">删除</el-button>
                            </template>
                        </el-table-column>
                    </el-table>
                </div>
            </el-tab-pane>

            <el-tab-pane label="历史报告" name="reports">
                <div class="tab-content">
                    <el-button @click="refreshReports" style="margin-bottom: 20px;">刷新列表</el-button>
                    
                    <el-collapse v-model="activeReportDates">
                        <el-collapse-item v-for="(group, date) in groupedReports" :key="date" :title="date + ' (' + group.length + ')'" :name="date">
                            <el-table :data="group" style="width: 100%">
                                <el-table-column prop="name" label="报告名称" />
                                <el-table-column label="生成时间" width="180">
                                    <template #default="scope">
                                        {{ formatTime(scope.row.modified) }}
                                    </template>
                                </el-table-column>
                                <el-table-column label="操作" width="180">
                                    <template #default="scope">
                                        <el-link :href="getReportDownloadUrl(scope.row.name)" target="_blank" type="primary" style="margin-right: 10px;">查看</el-link>
                                        <el-button type="danger" size="small" link @click="deleteReport(scope.row.name)">删除</el-button>
                                    </template>
                                </el-table-column>
                            </el-table>
                        </el-collapse-item>
                    </el-collapse>
                </div>
            </el-tab-pane>
        </el-tabs>

        <!-- Add Stream Dialog -->
        <el-dialog v-model="showAddStreamDialog" title="添加视频流" width="500px">
            <el-form :model="streamForm" label-width="100px">
                <el-form-item label="RTSP地址">
                    <el-input v-model="streamForm.rtsp_url" placeholder="rtsp://..." />
                </el-form-item>
                <el-form-item label="名称">
                    <el-input v-model="streamForm.name" placeholder="摄像头1" />
                </el-form-item>
                <el-form-item label="位置">
                    <el-input v-model="streamForm.location" placeholder="正门" />
                </el-form-item>
                <el-form-item label="描述">
                    <el-input v-model="streamForm.description" type="textarea" />
                </el-form-item>
            </el-form>
            <template #footer>
                <span class="dialog-footer">
                    <el-button @click="showAddStreamDialog = false">取消</el-button>
                    <el-button type="primary" @click="submitAddStream" :loading="addStreamLoading">确定</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- Schedule Dialog -->
        <el-dialog v-model="showScheduleDialog" title="定时录制设置" width="600px">
            <div style="margin-bottom: 20px;">
                <p>当前视频流: <strong>{{ currentStream?.name || currentStream?.rtsp_url }}</strong></p>
            </div>
            
            <el-table :data="schedules" style="width: 100%; margin-bottom: 20px;" v-loading="schedulesLoading">
                <el-table-column prop="start_time" label="开始时间" width="100" />
                <el-table-column prop="duration_minutes" label="时长(分)" width="100" />
                <el-table-column label="重复" width="150">
                    <template #default="scope">
                        {{ formatDays(scope.row.days) }}
                    </template>
                </el-table-column>
                <el-table-column label="状态" width="100">
                    <template #default="scope">
                        <el-switch v-model="scope.row.enabled" @change="toggleSchedule(scope.row)" />
                    </template>
                </el-table-column>
                <el-table-column label="操作">
                    <template #default="scope">
                        <el-button type="danger" size="small" @click="deleteSchedule(scope.row.id)">删除</el-button>
                    </template>
                </el-table-column>
            </el-table>

            <el-divider>添加新计划</el-divider>
            
            <el-form :model="scheduleForm" label-width="100px">
                <el-form-item label="开始时间">
                    <el-time-select
                        v-model="scheduleForm.start_time"
                        start="00:00"
                        step="00:15"
                        end="23:45"
                        placeholder="选择时间"
                    />
                </el-form-item>
                <el-form-item label="录制时长">
                    <el-input-number v-model="scheduleForm.duration" :min="1" :max="1440" label="分钟" /> 分钟
                </el-form-item>
                <el-form-item label="重复周期">
                    <el-checkbox-group v-model="scheduleForm.days">
                        <el-checkbox label="1">周一</el-checkbox>
                        <el-checkbox label="2">周二</el-checkbox>
                        <el-checkbox label="3">周三</el-checkbox>
                        <el-checkbox label="4">周四</el-checkbox>
                        <el-checkbox label="5">周五</el-checkbox>
                        <el-checkbox label="6">周六</el-checkbox>
                        <el-checkbox label="0">周日</el-checkbox>
                    </el-checkbox-group>
                </el-form-item>
                <el-form-item label="启用">
                    <el-switch v-model="scheduleForm.enabled" />
                </el-form-item>
            </el-form>
            <template #footer>
                <span class="dialog-footer">
                    <el-button @click="showScheduleDialog = false">关闭</el-button>
                    <el-button type="primary" @click="submitAddSchedule" :loading="addScheduleLoading">添加计划</el-button>
                </span>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { ElMessage, ElEmpty, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { aiService, type Stream, type Report } from '../../services/aiService'

const props = defineProps<{
    initialTab?: string
}>()

const activeTab = ref(props.initialTab || 'video')
const loading = ref(false)
const detectionResults = ref<any[]>([])

// Watch active tab to refresh data
watch(activeTab, (newTab) => {
    if (newTab === 'streams') {
        refreshStreams()
    } else if (newTab === 'reports') {
        refreshReports()
    } else if (newTab === 'video') {
        refreshVideoList()
    }
})

// Server Video Library
const availableDates = ref<string[]>([])
const videosByDate = ref<Record<string, any[]>>({})
const selectedDate = ref('')
const selectedVideos = ref<any[]>([])

const refreshVideoList = async () => {
    try {
        const data = await aiService.getVideosList()
        availableDates.value = data.dates || []
        videosByDate.value = data.videos || {}
        if (availableDates.value.length > 0 && !selectedDate.value) {
            selectedDate.value = availableDates.value[0]
        }
    } catch (error) {
        console.error('获取视频列表失败', error)
        // ElMessage.error('获取视频列表失败') // Suppress error if backend is not ready
    }
}

const handleDateChange = () => {
    selectedVideos.value = []
}

const handleSelectionChange = (val: any[]) => {
    selectedVideos.value = val
}

const submitBatchServerVideos = async () => {
    if (selectedVideos.value.length === 0) return
    
    // 获取选中视频所在的文件夹路径
    // 假设同一日期的视频在同一文件夹下
    const firstVideo = selectedVideos.value[0]
    // 提取文件夹路径 (去掉文件名)
    let folderPath = firstVideo.path.substring(0, firstVideo.path.lastIndexOf('/')) || 'videos'

    // Fix path for Python backend (Docker /app/videos -> Host /home/zeroef/visual-app/videos)
    if (folderPath.startsWith('/app/videos')) {
        folderPath = folderPath.replace('/app/videos', '/home/zeroef/visual-app/videos')
    }
    
    loading.value = true
    detectionResults.value = []
    try {
        const response = await aiService.detectVideoFolder(folderPath)
        if (response.status === 'completed') {
            detectionResults.value = response.results
            ElMessage.success(`检测完成，共 ${response.summary.success} 个成功`)
        } else {
            ElMessage.error(response.error || '检测失败')
        }
    } catch (error) {
        ElMessage.error('请求失败: ' + error)
    } finally {
        loading.value = false
    }
}

import { API_BASE_URL } from '@/config'

// Video Detection (Single Upload) - Removed

const getReportFullUrl = (url: string) => {
    // 如果是生产环境，直接返回完整 URL
    if (import.meta.env.PROD) {
        if (url.startsWith('http')) return url
        // 如果是相对路径，拼接 API_BASE_URL
        // 假设 url 是 /reports/xxx.html
        // API_BASE_URL 是 https://ibl.zjypwy.com/cscec-robot-dog/api
        // 我们需要 https://ibl.zjypwy.com/cscec-robot-dog/api/reports/xxx.html
        // 或者如果 url 已经包含 /api，则不需要拼接
        if (url.startsWith('/api')) {
             const baseUrl = API_BASE_URL.replace(/\/api$/, '')
             return `${baseUrl}${url}`
        }
        // 假设 url 是 /reports/xxx
        return `${API_BASE_URL}${url}`
    }

    // If URL is absolute and points to the backend IP, convert to relative /api path
    if (url.startsWith('https://ibl.zjypwy.com/cscec-robot-dog/api')) {
        return url.replace('https://ibl.zjypwy.com/cscec-robot-dog/api', '/api')
    }
    if (url.startsWith('https://ibl.zjypwy.com/cscec-robot-dog')) {
        return url.replace('https://ibl.zjypwy.com/cscec-robot-dog', '')
    }
    
    if (url.startsWith('http')) return url
    // Use relative path to support both HTTP and HTTPS
    return url.startsWith('/') ? url : `/${url}`
}

// Streams
const streams = ref<Stream[]>([])
const streamsLoading = ref(false)
const showAddStreamDialog = ref(false)
const addStreamLoading = ref(false)
const streamForm = ref({
    rtsp_url: '',
    name: '',
    location: '',
    description: ''
})

// Schedules
const showScheduleDialog = ref(false)
const currentStream = ref<Stream | null>(null)
const schedules = ref<any[]>([])
const schedulesLoading = ref(false)
const addScheduleLoading = ref(false)
const scheduleForm = ref({
    start_time: '',
    duration: 60,
    days: [] as string[],
    enabled: true
})

const refreshStreams = async () => {
    streamsLoading.value = true
    try {
        streams.value = await aiService.getStreams()
    } catch (error) {
        ElMessage.error('获取视频流列表失败')
    } finally {
        streamsLoading.value = false
    }
}

const submitAddStream = async () => {
    if (!streamForm.value.rtsp_url) {
        ElMessage.warning('请输入RTSP地址')
        return
    }
    addStreamLoading.value = true
    try {
        await aiService.addStream(
            streamForm.value.rtsp_url,
            streamForm.value.name,
            streamForm.value.location,
            streamForm.value.description
        )
        ElMessage.success('添加成功')
        showAddStreamDialog.value = false
        streamForm.value = { rtsp_url: '', name: '', location: '', description: '' }
        refreshStreams()
    } catch (error) {
        ElMessage.error('添加失败')
    } finally {
        addStreamLoading.value = false
    }
}

const deleteStream = async (id: string) => {
    try {
        await aiService.deleteStream(id)
        ElMessage.success('删除成功')
        refreshStreams()
    } catch (error) {
        ElMessage.error('删除失败')
    }
}

const openScheduleDialog = async (stream: Stream) => {
    currentStream.value = stream
    showScheduleDialog.value = true
    schedulesLoading.value = true
    try {
        const res = await aiService.getSchedules(stream.id)
        schedules.value = res.schedules
    } catch (error) {
        ElMessage.error('获取计划失败')
    } finally {
        schedulesLoading.value = false
    }
}

const submitAddSchedule = async () => {
    if (!currentStream.value || !scheduleForm.value.start_time || scheduleForm.value.days.length === 0) {
        ElMessage.warning('请填写完整信息')
        return
    }
    addScheduleLoading.value = true
    try {
        await aiService.addSchedule(
            currentStream.value.id,
            scheduleForm.value.start_time,
            scheduleForm.value.duration,
            scheduleForm.value.days.join(','),
            scheduleForm.value.enabled
        )
        ElMessage.success('计划添加成功')
        // Refresh list
        const res = await aiService.getSchedules(currentStream.value.id)
        schedules.value = res.schedules
        // Reset form but keep days maybe?
        scheduleForm.value.start_time = ''
    } catch (error) {
        ElMessage.error('添加计划失败')
    } finally {
        addScheduleLoading.value = false
    }
}

const toggleSchedule = async (schedule: any) => {
    try {
        await aiService.updateSchedule(schedule.id, { enabled: schedule.enabled })
        ElMessage.success('状态更新成功')
    } catch (error) {
        schedule.enabled = !schedule.enabled // Revert on failure
        ElMessage.error('状态更新失败')
    }
}

const deleteSchedule = async (id: string) => {
    try {
        await aiService.deleteSchedule(id)
        ElMessage.success('删除成功')
        if (currentStream.value) {
            const res = await aiService.getSchedules(currentStream.value.id)
            schedules.value = res.schedules
        }
    } catch (error) {
        ElMessage.error('删除失败')
    }
}

const formatDays = (days: number[] | string[] | string) => {
    if (!days) return ''
    let daysArray: any[] = []
    if (Array.isArray(days)) {
        daysArray = days
    } else if (typeof days === 'string') {
        daysArray = days.split(',')
    } else {
        return ''
    }
    
    const map: Record<string, string> = { '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '0': '日' }
    return daysArray.map(d => '周' + (map[String(d).trim()] || String(d))).join(', ')
}

// Reports
const reports = ref<Report[]>([])
const reportsLoading = ref(false)
const activeReportDates = ref<string[]>([])

const groupedReports = computed(() => {
    const groups: Record<string, Report[]> = {}
    reports.value.forEach(report => {
        const date = new Date(report.modified * 1000).toLocaleDateString()
        if (!groups[date]) groups[date] = []
        groups[date].push(report)
    })
    return groups
})

const refreshReports = async () => {
    reportsLoading.value = true
    try {
        reports.value = await aiService.getReports()
        // Expand first date by default
        const dates = Object.keys(groupedReports.value)
        if (dates.length > 0) activeReportDates.value = [dates[0]]
    } catch (error) {
        ElMessage.error('获取报告列表失败')
    } finally {
        reportsLoading.value = false
    }
}

const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
}

const getReportDownloadUrl = (filename: string) => {
    return aiService.getReportUrl(filename)
}

const deleteReport = async (filename: string) => {
    try {
        await ElMessageBox.confirm('确定要删除该报告吗？', '提示', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
        })
        
        await aiService.deleteReport(filename)
        ElMessage.success('删除成功')
        refreshReports()
    } catch (error) {
        if (error !== 'cancel') {
            console.error('deleteReport error:', error)
            ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : String(error)))
        }
    }
}

onMounted(() => {
    if (activeTab.value === 'streams') refreshStreams()
    else if (activeTab.value === 'reports') refreshReports()
    else if (activeTab.value === 'video') refreshVideoList()
})
</script>

<style scoped>
.ai-panel {
    width: 100%;
    height: 100%;
    background-color: #fff;
    padding: 20px;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.demo-tabs {
    height: 100%;
    display: flex;
    flex-direction: column;
}

:deep(.el-tabs__content) {
    flex: 1;
    overflow: auto;
}

.tab-content {
    padding: 20px 0;
    height: 100%;
    box-sizing: border-box;
}

.upload-section, .folder-section {
    max-width: 800px;
    margin: 0 auto;
}

.upload-section {
    text-align: center;
}

.filter-bar {
    display: flex;
    align-items: center;
    margin-bottom: 20px;
}

.results-section {
    margin-top: 30px;
}

.result-card {
    margin-bottom: 15px;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.stream-actions {
    margin-bottom: 20px;
}

.empty-state {
    text-align: center;
    color: #999;
    padding: 40px 0;
}

.connection-warning {
    margin-bottom: 20px;
}
</style>
