<template>
    <div class="workspace">
        <!-- Top App Bar -->
        <div class="app-bar">
            <div class="app-title">机器狗控制平台</div>
        </div>

        <!-- Main Content - New Layout -->
        <div class="workspace-content">
            <!-- Left Sidebar -->
            <div class="left-sidebar">
                <!-- Robot Status Panel -->
                <div class="left-panel status-panel">
                    <RobotStatusPanel />
                </div>
                <!-- Map Tools Panel -->
                <div class="left-panel tools-panel">
                    <div class="panel-header">
                        <h3>地图工具</h3>
                    </div>
                    <div class="panel-content">
                        <MapToolsPanel />
                    </div>
                </div>
            </div>

            <!-- Center Area -->
            <div class="center-area">
                <!-- 3D Panel (Full or Minimized) -->
                <div class="center-panel threed-panel"
                    :class="{ 'swap-to-corner': isImagePanelExpanded }" :style="threeDPanelStyle"
                    @click="selectPanel('3d')">
                    <div class="panel-header">
                        <h3>任务规划</h3>
                    </div>
                    <div class="panel-content">
                        <ThreeDPanel ref="threeDPanelRef" />
                    </div>
                </div>

                <!-- Image Panel (Bottom Left Corner or Expanded) -->
                <div class="floating-image-panel"
                    :class="{ 'swap-to-full': isImagePanelExpanded }" @click="selectPanel('image')">
                    <div class="panel-header">
                        <h3>摄像头图像</h3>
                    </div>
                    <div class="panel-content">
                        <ImagePanel ref="imagePanelRef" :isExpanded="isImagePanelExpanded" @toggleExpand="toggleImagePanelExpand" />
                    </div>
                </div>
            </div>

            <!-- Right Sidebar -->
            <div class="right-sidebar">
                <!-- Settings Panel (Top) -->
                <div class="right-panel settings-panel">
                    <div class="panel-header">
                        <h3>{{ currentSettingsTitle }}</h3>
                    </div>
                    <div class="panel-content">
                        <keep-alive>
                            <ImageSettings v-if="selectedPanel === 'image'" />
                            <ThreeDSettings v-else-if="selectedPanel === '3d'" />
                        </keep-alive>
                        <div v-if="!selectedPanel" class="empty-settings">
                            <p>点击左侧面板查看设置</p>
                        </div>
                    </div>
                </div>

                <!-- AI Panel (Bottom) -->
                <div class="right-panel ai-panel" @click="openAIDialog">
                    <div class="panel-header">
                        <h3>AI功能</h3>
                    </div>
                    <div class="panel-content ai-trigger">
                        <el-icon :size="48" color="#409EFF">
                            <DataAnalysis />
                        </el-icon>
                        <p>点击打开AI助手</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- 断连警告弹窗 -->
        <el-dialog v-model="disconnectWarningVisible" title="连接断开" width="400px" :close-on-click-modal="false"
            :close-on-press-escape="false" :show-close="false">
            <div class="disconnect-warning">
                <el-icon :size="64" color="#F56C6C" style="margin-bottom: 16px;">
                    <Connection />
                </el-icon>
                <h3 style="margin-bottom: 12px; color: #F56C6C;">机器狗连接已断开</h3>
                <p style="color: #666; margin-bottom: 20px;">
                    与机器狗的 WebSocket 连接已断开，请检查网络连接或机器狗状态。
                </p>
                <div class="disconnect-info">
                    <p style="font-size: 12px; color: #999;">
                        断开时间: {{ disconnectTime }}
                    </p>
                </div>
            </div>
            <template #footer>
                <el-button @click="handleDisconnectConfirm" type="primary">确认</el-button>
            </template>
        </el-dialog>

        <!-- 断连警告弹窗 -->
        <el-dialog v-model="disconnectWarningVisible" title="连接断开" width="400px" :close-on-click-modal="false"
            :close-on-press-escape="false" :show-close="false">
            <div class="disconnect-warning">
                <el-icon :size="64" color="#F56C6C" style="margin-bottom: 16px;">
                    <Connection />
                </el-icon>
                <h3 style="margin-bottom: 12px; color: #F56C6C;">机器狗连接已断开</h3>
                <p style="color: #666; margin-bottom: 20px;">
                    与机器狗的连接已断开，请检查网络连接或机器狗状态。
                </p>
                <div class="disconnect-info">
                    <p style="font-size: 12px; color: #999;">
                        断开时间: {{ disconnectTime }}
                    </p>
                </div>
            </div>
            <template #footer>
                <el-button @click="handleDisconnectConfirm" type="primary">确认</el-button>
            </template>
        </el-dialog>

        <!-- AI Dialog -->
        <el-dialog v-model="aiDialogVisible" title="AI助手" width="800px" :before-close="handleAIClose">
            <div class="ai-dialog-content">
                <div class="ai-feature-view">
                    <div style="height: 600px;">
                        <AIPanel initialTab="video" />
                    </div>
                </div>
            </div>
            <template #footer>
                <el-button @click="aiDialogVisible = false">关闭</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, onMounted, onUnmounted } from 'vue'
import { ElDialog, ElButton, ElIcon, ElMessage } from 'element-plus'
import { DataAnalysis, Connection } from '@element-plus/icons-vue'
import ThreeDPanel from '@/components/panels/ThreeDPanel.vue'
import ImagePanel from '@/components/panels/ImagePanel.vue'
import RobotStatusPanel from '@/components/panels/RobotStatusPanel.vue'
import MapToolsPanel from '@/components/panels/MapToolsPanel.vue'
import AIPanel from '@/components/panels/AIPanel.vue'
import ThreeDSettings from '@/components/settings/ThreeDSettings.vue'
import ImageSettings from '@/components/settings/ImageSettings.vue'
import { rosConnection } from '@/services/rosConnection'

// 3D面板引用
const threeDPanelRef = ref()

// 图像面板引用（用于录制功能）
const imagePanelRef = ref<InstanceType<typeof ImagePanel> | null>(null)

// 通过provide传递给设置面板
provide('threeDPanelRef', threeDPanelRef)
provide('imagePanelRef', imagePanelRef)

// 当前选中的面板（默认显示任务规划）
const selectedPanel = ref<'image' | '3d' | null>('3d')

// AI对话框状态
const aiDialogVisible = ref(false)

// 断连警告状态
const disconnectWarningVisible = ref(false)
const disconnectTime = ref('')

// 断连回调函数
const handleDisconnect = () => {
    // 仅在意外断连时触发（由 rosConnection.ts 的 intentionalDisconnect 标志控制）
    const now = new Date()
    disconnectTime.value = now.toLocaleString('zh-CN')
    disconnectWarningVisible.value = true

    // 同时显示消息提示
    ElMessage.error({
        message: '机器狗连接已断开！',
        duration: 5000,
        showClose: true
    })
}// 确认断连警告
const handleDisconnectConfirm = () => {
    disconnectWarningVisible.value = false
}

// 组件挂载时注册断连监听
onMounted(() => {
    rosConnection.onDisconnect(handleDisconnect)
})

// 组件卸载时移除监听
onUnmounted(() => {
    rosConnection.offDisconnect(handleDisconnect)
})

// 面板引用

// 摄像头面板放大状态
const isImagePanelExpanded = ref(false)

// 面板样式占位（用于未来扩展）
const threeDPanelStyle = computed(() => ({}))

// 切换摄像头面板放大/缩小
const toggleImagePanelExpand = () => {
    isImagePanelExpanded.value = !isImagePanelExpanded.value
}

// 选择面板
const selectPanel = (panel: 'image' | '3d') => {
    selectedPanel.value = panel
}

// 当前设置面板标题
const currentSettingsTitle = computed(() => {
    if (selectedPanel.value === 'image') return '图像设置'
    if (selectedPanel.value === '3d') return '地图设置'
    return '设置'
})

// 当前选中的AI功能
const currentAIFeature = ref<string | null>(null)

// 打开AI对话框
const openAIDialog = () => {
    currentAIFeature.value = 'vision'
    aiDialogVisible.value = true
}

// 处理AI对话框关闭
const handleAIClose = () => {
    aiDialogVisible.value = false
    currentAIFeature.value = null
}
</script>

<style scoped>
.workspace {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #f5f5f5;
}

.app-bar {
    height: 48px;
    background-color: #ffffff;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    align-items: center;
    padding: 0 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.app-title {
    font-size: 16px;
    font-weight: 600;
    color: #333;
}

.workspace-content {
    flex: 1;
    display: grid;
    grid-template-columns: 280px 1fr 280px;
    gap: 12px;
    padding: 12px;
    background-color: #f5f5f5;
    overflow: hidden;
}

/* Left Sidebar */
.left-sidebar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
}

.left-panel {
    background-color: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.left-panel.status-panel {
    flex: 3.4;
    min-height: 0;
}

.left-panel.tools-panel {
    flex: 1.5;
    min-height: 0;
}

/* Center Area */
.center-area {
    position: relative;
    min-height: 0;
    overflow: hidden;
}

.center-panel {
    background-color: #ffffff;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    cursor: pointer;
    transition: all 0.2s ease;
}

.center-panel:hover {
    border-color: #409EFF;
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.2);
}

.center-panel.threed-panel {
    width: 100%;
    height: 100%;
    transition: all 0.3s ease;
}

.center-panel.threed-panel .panel-content {
    overflow: hidden;
}

/* 任务规划面板互换到角落 */
.center-panel.threed-panel.swap-to-corner {
    position: absolute;
    left: 16px;
    bottom: 16px;
    width: 320px;
    height: 240px;
    z-index: 15;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

/* Floating Image Panel */
.floating-image-panel {
    position: absolute;
    left: 16px;
    bottom: 16px;
    width: 320px;
    height: 240px;
    background-color: #ffffff;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    cursor: pointer;
    transition: all 0.3s ease;
    z-index: 10;
    user-select: none;
}

.floating-image-panel:hover {
    border-color: #409EFF;
    box-shadow: 0 6px 20px rgba(64, 158, 255, 0.3);
}

/* 摄像头面板互换到全屏 */
.floating-image-panel.swap-to-full {
    position: absolute;
    left: 0 !important;
    top: 0 !important;
    bottom: 0 !important;
    right: 0 !important;
    width: 100%;
    height: 100%;
    z-index: 5;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.floating-image-panel .panel-header {
    padding: 8px 12px;
    background-color: #fafafa;
    border-bottom: 1px solid #e0e0e0;
    user-select: none;
}

.floating-image-panel .panel-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #333;
}

.floating-image-panel .panel-content {
    flex: 1;
    overflow: hidden;
    position: relative;
}

/* Right Sidebar */
.right-sidebar {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.right-panel {
    background-color: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.right-panel.settings-panel {
    flex: 3.0;
    min-height: 0;
}

.right-panel.ai-panel {
    flex: 1.0;
    cursor: pointer;
    transition: all 0.2s ease;
}

.right-panel.ai-panel:hover {
    border-color: #409EFF;
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.2);
    transform: translateY(-2px);
}

.panel-header {
    padding: 12px 16px;
    background-color: #fafafa;
    border-bottom: 1px solid #e0e0e0;
}

.panel-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #333;
}

.panel-content {
    flex: 1;
    overflow: auto;
    position: relative;
}

/* 隐藏所有滚动条 */
.panel-content::-webkit-scrollbar {
    display: none;
}

.panel-content {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

.empty-settings {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #999;
    font-size: 13px;
}

.ai-trigger {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #409EFF;
}

.ai-trigger p {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
}

/* AI Dialog */
.ai-dialog-content {
    padding: 20px 0;
}

.ai-feature-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

.ai-feature-item {
    padding: 20px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    text-align: center;
    transition: all 0.2s ease;
    cursor: pointer;
}

.ai-feature-item:hover {
    border-color: #409EFF;
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.2);
    transform: translateY(-2px);
}

.ai-feature-item h4 {
    margin: 12px 0 8px 0;
    font-size: 16px;
    color: #333;
}

.ai-feature-item p {
    margin: 0;
    font-size: 13px;
    color: #666;
}

/* 断连警告样式 */
.disconnect-warning {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 20px;
}

.disconnect-info {
    background-color: #f5f5f5;
    padding: 12px;
    border-radius: 4px;
    width: 100%;
    margin-top: 12px;
}

/* 响应式调整 */
@media (max-width: 1200px) {
    .workspace-content {
        grid-template-columns: 220px 1fr 250px;
    }
}
</style>
