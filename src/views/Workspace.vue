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
                        <p style="text-align: center; color: #999; padding: 20px;">
                            地图工具功能开发中...
                        </p>
                    </div>
                </div>
            </div>

            <!-- Center Area -->
            <div class="center-area">
                <!-- 3D Panel (Full or Minimized) -->
                <div ref="threeDPanelContainerRef" class="center-panel threed-panel"
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
                <div ref="floatingPanelRef" class="floating-image-panel"
                    :class="{ 'swap-to-full': isImagePanelExpanded }" @click="selectPanel('image')">
                    <div class="panel-header">
                        <h3>摄像头图像</h3>
                    </div>
                    <div class="panel-content">
                        <ImagePanel :isExpanded="isImagePanelExpanded" @toggleExpand="toggleImagePanelExpand" />
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
                        <ImageSettings v-if="selectedPanel === 'image'" />
                        <ThreeDSettings v-else-if="selectedPanel === '3d'" />
                        <div v-else class="empty-settings">
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

        <!-- AI Dialog -->
        <el-dialog v-model="aiDialogVisible" title="AI助手" width="600px">
            <div class="ai-dialog-content">
                <div class="ai-feature-list">
                    <div class="ai-feature-item">
                        <el-icon :size="32" color="#409EFF">
                            <View />
                        </el-icon>
                        <h4>图像识别</h4>
                        <p>识别场景中的物体和障碍物</p>
                    </div>
                    <div class="ai-feature-item">
                        <el-icon :size="32" color="#E6A23C">
                            <Connection />
                        </el-icon>
                        <h4>语音交互</h4>
                        <p>通过语音控制机器狗</p>
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
import { ref, computed, provide } from 'vue'
import { ElDialog, ElButton, ElIcon } from 'element-plus'
import { DataAnalysis, View, Position, Connection, TrendCharts } from '@element-plus/icons-vue'
import ThreeDPanel from '@/components/panels/ThreeDPanel.vue'
import ImagePanel from '@/components/panels/ImagePanel.vue'
import RobotStatusPanel from '@/components/panels/RobotStatusPanel.vue'
import ThreeDSettings from '@/components/settings/ThreeDSettings.vue'
import ImageSettings from '@/components/settings/ImageSettings.vue'

// 3D面板引用
const threeDPanelRef = ref()

// 通过provide传递给设置面板
provide('threeDPanelRef', threeDPanelRef)

// 当前选中的面板
const selectedPanel = ref<'image' | '3d' | null>('image')

// AI对话框状态
const aiDialogVisible = ref(false)

// 面板引用
const floatingPanelRef = ref<HTMLElement>()
const threeDPanelContainerRef = ref<HTMLElement>()

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
    if (selectedPanel.value === '3d') return '任务规划设置'
    return '设置'
})

// 打开AI对话框
const openAIDialog = () => {
    aiDialogVisible.value = true
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
    flex: 2;
    min-height: 0;
}

.left-panel.tools-panel {
    flex: 1;
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
    flex: 2;
    min-height: 0;
}

.right-panel.ai-panel {
    flex: 1;
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

/* 响应式调整 */
@media (max-width: 1200px) {
    .workspace-content {
        grid-template-columns: 220px 1fr 250px;
    }
}
</style>
