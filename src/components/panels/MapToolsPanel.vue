<template>
    <div class="map-tools-panel">
        <div class="tools-content">
            <!-- 建图按钮组 -->
            <div class="button-group">
                <el-button type="primary" :icon="Location" @click="handleMapping" :disabled="!isConnected"
                    class="tool-button">
                    开始建图
                </el-button>
            </div>
            <div class="button-group">
                <el-button type="primary" :icon="FolderOpened" @click="showMapSelector = true" class="tool-button">
                    地图选择
                </el-button>
            </div>
            <div class="button-group">
                <el-button type="primary" :icon="Edit" @click="handleMapEdit" class="tool-button">
                    地图编辑
                </el-button>
            </div>
            <div class="button-group">
                <el-button type="primary" :icon="Upload" @click="handleUploadMap" class="tool-button">
                    上传地图
                </el-button>
            </div>

            <!-- 当前地图显示 -->
            <div v-if="currentMap" class="current-map-info">
                <div class="map-name">
                <span class="label">当前地图:</span>
                    <span class="value">{{ currentMap.displayName }}</span>
                </div>
                <div class="map-details">
                    <span class="detail-item">路线数: {{ currentMap.queueCount }}</span>
                </div>
            </div>
        </div>

        <!-- 地图选择对话框 -->
        <el-dialog v-model="showMapSelector" title="选择地图" width="600px">
            <template #header>
                <div class="dialog-header">
                    <span>选择地图</span>
                    <el-button :icon="Refresh" circle size="small" @click="handleRefreshMaps" :loading="refreshingMaps"
                        title="刷新地图列表" class="refresh-btn" />
                </div>
            </template>
            <div class="map-selector-content">
                <div class="map-list">
                    <div v-for="map in availableMaps" :key="map.folderName" class="map-item"
                        :class="{ active: currentMap?.folderName === map.folderName }" @click="selectMap(map)">
                        <div class="map-item-content">
                            <el-icon class="map-icon">
                                <FolderOpened />
                        </el-icon>
                            <div class="map-info">
                                <div class="map-name">{{ map.displayName }}</div>
                                <div class="map-meta">
                                    <span class="meta-item" v-if="map.createTime">创建时间: {{ map.createTime }}</span>
                                    <span class="meta-item">路线数: {{ map.queueCount }}</span>
                                </div>
                            </div>
                        </div>
                        <el-icon v-if="currentMap?.folderName === map.folderName" class="check-icon">
                            <Check />
                        </el-icon>
                    </div>
                    <div v-if="availableMaps.length === 0" class="empty-maps">
                        <el-icon :size="48" color="#ccc">
                            <FolderOpened />
                        </el-icon>
                        <p>未找到地图文件夹</p>
                        <p class="empty-hint">请确保 maps 文件夹下有地图文件夹，每个文件夹包含 map 和 queue 目录</p>
                    </div>
                </div>
            </div>
            <template #footer>
                <el-button @click="showMapSelector = false">取消</el-button>
                <el-button type="primary" @click="confirmMapSelection"
                    :disabled="!currentMap || isUploading">确定</el-button>
            </template>
        </el-dialog>

        <!-- 上传进度对话框 -->
        <el-dialog v-model="showUploadProgress" title="发送地图文件" width="500px" :close-on-click-modal="false"
            :close-on-press-escape="false">
            <div class="upload-progress-content">
                <div class="progress-info">
                    <div class="progress-text">{{ uploadStatusText }}</div>
                    <div class="progress-details" v-if="uploadCurrentFile">
                        当前文件: {{ uploadCurrentFile }}
                    </div>
                </div>
                <el-progress :percentage="Math.round(uploadProgress)"
                    :status="uploadProgress === 100 ? 'success' : undefined" :stroke-width="20"
                    :format="(percentage) => `${Math.round(percentage)}%`" style="margin-top: 20px;" />
                <div class="progress-stats" style="margin-top: 20px;">
                    <div class="stat-item" v-if="uploadTotalSize > 0">
                        <span class="stat-label">总大小:</span>
                        <span class="stat-value">{{ formatFileSize(uploadTotalSize) }}</span>
                    </div>
                    <div class="stat-item" v-if="uploadSentSize > 0">
                        <span class="stat-label">已发送:</span>
                        <span class="stat-value">{{ formatFileSize(uploadSentSize) }}</span>
                    </div>
                    <div class="stat-item" v-if="uploadTotalFiles > 0">
                        <span class="stat-label">总文件数:</span>
                        <span class="stat-value">{{ uploadTotalFiles }}</span>
                    </div>
                    <div class="stat-item" v-if="uploadTotalFiles > 0">
                        <span class="stat-label">已完成:</span>
                        <span class="stat-value">{{ uploadCompletedFiles }}</span>
                    </div>
                    <div class="stat-item" v-if="uploadEta > 0 && uploadProgress < 100">
                        <span class="stat-label">预计剩余:</span>
                        <span class="stat-value">{{ formatTime(uploadEta) }}</span>
                    </div>
                    <div class="stat-item" v-if="uploadProgress === 100 && uploadWaiting">
                        <span class="stat-label">等待写入:</span>
                        <span class="stat-value">{{ uploadWaitCountdown }}s</span>
                    </div>
                </div>
            </div>
        </el-dialog>

        <!-- 上传地图对话框 -->
        <el-dialog v-model="showUploadMapDialog" title="上传地图" width="600px" @close="handleCloseUploadDialog">
            <div class="upload-map-content">
                <el-alert v-if="uploadMapError" :title="uploadMapError" type="error" :closable="false"
                    style="margin-bottom: 20px;" />
                <div class="upload-section">
                    <el-button type="primary" @click="triggerFolderSelect" :loading="uploadingMap">
                        <el-icon style="margin-right: 5px;">
                            <Upload />
                        </el-icon>
                        从本地上传地图文件夹
                    </el-button>
                    <el-button type="success" @click="handleDownloadFromRobot" :loading="downloadingFromRobot"
                        :disabled="!isConnected">
                        <el-icon style="margin-right: 5px;">
                            <Upload />
                        </el-icon>
                        从机器狗上传
                    </el-button>
                    <input ref="folderInputRef" type="file" webkitdirectory directory multiple style="display: none;"
                        @change="handleFolderSelect" />
                </div>
                <div v-if="selectedFolderFiles.length > 0" class="folder-info">
                    <el-divider>文件夹信息</el-divider>
                    <div class="info-item">
                        <span class="label">文件数量:</span>
                        <span class="value">{{ selectedFolderFiles.length }}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">文件夹结构:</span>
                        <div class="structure-tree">
                            <div v-for="(files, dir) in folderStructure" :key="dir" class="structure-item">
                                <el-icon>
                                    <FolderOpened />
                                </el-icon>
                                <span>{{ dir }}</span>
                                <span class="file-count">({{ files.length }} 个文件)</span>
                            </div>
                        </div>
                    </div>
                    <div v-if="folderValidation" class="validation-result">
                        <el-icon v-if="folderValidation.valid" color="#67c23a" style="margin-right: 5px;">
                            <Check />
                        </el-icon>
                        <el-icon v-else color="#f56c6c" style="margin-right: 5px;">
                            <Delete />
                        </el-icon>
                        <span :style="{ color: folderValidation.valid ? '#67c23a' : '#f56c6c' }">
                            {{ folderValidation.message }}
                        </span>
                    </div>
                </div>
            </div>
            <template #footer>
                <el-button @click="showUploadMapDialog = false">取消</el-button>
                <el-button type="primary" @click="showMapNameDialog = true"
                    :disabled="!folderValidation?.valid || uploadingMap">
                    下一步：设置地图名称
                </el-button>
            </template>
        </el-dialog>

        <!-- 地图名称输入对话框 -->
        <el-dialog v-model="showMapNameDialog" title="设置地图信息" width="400px" @close="handleCloseMapNameDialog">
            <div class="map-name-input">
                <el-form :model="newMapNameForm" label-width="100px">
                    <el-form-item label="地图名称" required>
                        <el-input v-model="newMapNameForm.name" placeholder="请输入地图名称" maxlength="50" show-word-limit />
                    </el-form-item>
                    <el-form-item label="描述（可选）">
                        <el-input v-model="newMapNameForm.description" type="textarea" :rows="3" placeholder="请输入地图描述"
                            maxlength="200" show-word-limit />
                    </el-form-item>
                </el-form>
            </div>
            <template #footer>
                <el-button @click="showMapNameDialog = false">取消</el-button>
                <el-button type="primary" @click="confirmUploadMap" :loading="uploadingMap"
                    :disabled="!newMapNameForm.name.trim()">
                    确认上传
                </el-button>
            </template>
        </el-dialog>

        <!-- 上传地图进度对话框 -->
        <el-dialog v-model="showUploadMapProgress" :title="isFromRobot ? '从机器狗上传地图' : '上传地图'" width="500px" :close-on-click-modal="false"
            :close-on-press-escape="false">
            <div class="upload-map-progress-content">
                <div class="progress-text">{{ uploadMapStatusText }}</div>
                <el-progress :percentage="Math.round(uploadMapProgress)"
                    :status="uploadMapProgress === 100 ? 'success' : undefined" :stroke-width="20"
                    style="margin-top: 20px;" />
                <div class="progress-stats" style="margin-top: 20px;">
                    <div class="stat-item" v-if="uploadMapTotalSize > 0">
                        <span class="stat-label">总大小:</span>
                        <span class="stat-value">{{ formatFileSize(uploadMapTotalSize) }}</span>
                    </div>
                    <div class="stat-item" v-if="uploadMapDownloadedSize > 0">
                        <span class="stat-label">{{ isFromRobot ? '已上传' : '已上传' }}:</span>
                        <span class="stat-value">{{ formatFileSize(uploadMapDownloadedSize) }}</span>
                    </div>
                    <div class="stat-item" v-if="uploadMapEta > 0 && uploadMapProgress < 100">
                        <span class="stat-label">预计剩余:</span>
                        <span class="stat-value">{{ formatTime(uploadMapEta) }}</span>
                    </div>
                </div>
            </div>
        </el-dialog>

        <!-- 地图编辑选择对话框 -->
        <el-dialog v-model="showMapEditSelector" title="选择要编辑的地图" width="600px">
            <template #header>
                <div class="dialog-header">
                    <span>选择要编辑的地图</span>
                    <el-button :icon="Refresh" circle size="small" @click="handleRefreshMaps" :loading="refreshingMaps"
                        title="刷新地图列表" class="refresh-btn" />
                </div>
            </template>
            <div class="map-selector-content">
                <div class="map-list">
                    <div v-for="map in availableMaps" :key="map.folderName" class="map-item"
                        :class="{ active: selectedMapForEdit?.folderName === map.folderName }"
                        @click="selectMapForEdit(map)">
                        <div class="map-item-content">
                            <el-icon class="map-icon">
                                <FolderOpened />
                            </el-icon>
                            <div class="map-info">
                                <div class="map-name">{{ map.displayName }}</div>
                                <div class="map-meta">
                                    <span class="meta-item" v-if="map.createTime">创建时间: {{ map.createTime }}</span>
                                    <span class="meta-item">路线数: {{ map.queueCount }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="map-item-actions" @click.stop>
                            <el-icon v-if="selectedMapForEdit?.folderName === map.folderName" class="check-icon">
                                <Check />
                            </el-icon>
                            <el-button type="danger" :icon="Delete" circle size="small" @click="handleDeleteMap(map)"
                                title="删除地图" />
                        </div>
                    </div>
                    <div v-if="availableMaps.length === 0" class="empty-maps">
                        <el-icon :size="48" color="#ccc">
                            <FolderOpened />
                        </el-icon>
                        <p>未找到地图文件夹</p>
                        <p class="empty-hint">请确保 maps 文件夹下有地图文件夹，每个文件夹包含 map 和 queue 目录</p>
                    </div>
                </div>
            </div>
            <template #footer>
                <el-button @click="showMapEditSelector = false">取消</el-button>
                <el-button type="primary" @click="confirmMapEditSelection"
                    :disabled="!selectedMapForEdit">确定</el-button>
            </template>
        </el-dialog>

        <!-- 地图编辑对话框 -->
        <el-dialog v-model="showMapEditor" title="地图编辑" width="95%" :close-on-click-modal="false"
            class="map-editor-dialog" top="2vh">
            <div class="map-editor-content">
                <div class="editor-toolbar">
                    <div class="toolbar-left">
                        <span v-if="selectedMapForEdit" class="current-map-name">
                            当前地图: {{ selectedMapForEdit.displayName }}
                        </span>
                    </div>
                    <div class="toolbar-right">
                        <el-button-group>
                            <el-button :type="currentTool === 'brush' ? 'primary' : 'default'" @click="setTool('brush')"
                                title="画笔工具">
                                <el-icon>
                                    <Edit />
                                </el-icon>
                                画笔
                            </el-button>
                            <el-button :type="currentTool === 'rectangle' ? 'primary' : 'default'"
                                @click="setTool('rectangle')" title="框选工具">
                                <el-icon>
                                    <Document />
                                </el-icon>
                                框选
                            </el-button>
                            <el-button :type="currentTool === 'eraser' ? 'primary' : 'default'"
                                @click="setTool('eraser')" title="橡皮擦工具">
                                <el-icon>
                                    <Delete />
                                </el-icon>
                                橡皮擦
                            </el-button>
                            <el-button :type="currentTool === 'label' ? 'primary' : 'default'"
                                @click="setTool('label')" title="添加标签">
                                <el-icon>
                                    <Location />
                                </el-icon>
                                标签
                            </el-button>
                            <el-button @click="showLabelManager = true" title="管理标签" :disabled="labels.length === 0">
                                <el-icon>
                                    <List />
                                </el-icon>
                                管理标签
                            </el-button>
                        </el-button-group>
                        <el-input-number v-model="brushSize" :min="1" :max="50" :step="1"
                            style="width: 100px; margin-left: 10px;" title="画笔大小" />
                        <el-button-group style="margin-left: 10px;">
                            <el-button @click="zoomOut" title="缩小" :disabled="!mapLoaded">
                                <el-icon>
                                    <ZoomOut />
                                </el-icon>
                            </el-button>
                            <el-button @click="resetZoom" title="重置缩放" :disabled="!mapLoaded">
                                {{ Math.round(zoomLevel * 100) }}%
                            </el-button>
                            <el-button @click="zoomIn" title="放大" :disabled="!mapLoaded">
                                <el-icon>
                                    <ZoomIn />
                                </el-icon>
                            </el-button>
                        </el-button-group>
                    </div>
                </div>

                <div class="map-canvas-container" @mousemove="handleMouseMove"
                    @mouseup="handleMouseUp" @mouseleave="handleMouseUp">
                    <div v-if="mapLoaded || editing" class="canvas-wrapper"
                        :style="{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }">
                        <canvas ref="mapCanvasRef" @mousedown="handleMouseDownWithSave"
                            @contextmenu.prevent="handleContextMenu" @mousedown.right="handleRightMouseDown"></canvas>
                    </div>
                    <div v-else class="empty-editor">
                        <p>请选择地图文件</p>
                    </div>
                </div>

                <div class="editor-actions">
                    <el-button @click="clearMap" :disabled="!mapLoaded || editing">清空地图</el-button>
                    <el-button @click="invertMap" :disabled="!mapLoaded || editing">反转颜色</el-button>
                    <el-button @click="undoLastAction" :disabled="!mapLoaded || editing">撤销</el-button>
                    <el-button type="primary" @click="showSaveDialog = true" :disabled="!mapLoaded || saving">
                        {{ saving ? '保存中...' : '保存地图' }}
                    </el-button>
                </div>
            </div>
        </el-dialog>

        <!-- 标签管理对话框 -->
        <el-dialog v-model="showLabelManager" title="标签管理" width="500px" append-to-body>
            <div v-if="labels.length === 0" class="empty-labels">
                <p>暂无标签</p>
            </div>
            <el-table v-else :data="labels" style="width: 100%" max-height="400">
                <el-table-column prop="name" label="名称" />
                <el-table-column label="坐标" width="180">
                    <template #default="scope">
                        X: {{ scope.row.x }}, Y: {{ scope.row.y }}
                    </template>
                </el-table-column>
                <el-table-column label="操作" width="80" align="center">
                    <template #default="scope">
                        <el-button type="danger" :icon="Delete" circle size="small"
                            @click="removeLabel(scope.$index)" title="删除标签" />
                    </template>
                </el-table-column>
            </el-table>
            <template #footer>
                <el-button @click="showLabelManager = false">关闭</el-button>
            </template>
        </el-dialog>

        <!-- 保存地图对话框 -->
        <el-dialog v-model="showSaveDialog" title="保存地图" width="500px" :close-on-click-modal="false" @open="handleSaveDialogOpen">
            <div class="save-dialog-content">
                <el-radio-group v-model="saveMode" @change="handleSaveModeChange">
                    <el-radio label="overwrite">覆盖原图</el-radio>
                    <el-radio label="new">保存为新文件</el-radio>
                </el-radio-group>

                <div v-if="saveMode === 'new'" style="margin-top: 16px;">
                    <el-form :model="saveMapNameForm" label-width="100px">
                        <el-form-item label="地图名称" required>
                            <el-input v-model="saveMapNameForm.name" placeholder="请输入地图名称" maxlength="50"
                                show-word-limit />
                        </el-form-item>
                        <el-form-item label="描述（可选）">
                            <el-input v-model="saveMapNameForm.description" type="textarea" :rows="3"
                                placeholder="请输入地图描述" maxlength="200" show-word-limit />
                        </el-form-item>
                    </el-form>
                    <p style="font-size: 12px; color: #999; margin-top: 8px;">
                        将创建新地图文件夹，并复制原地图的其他文件（yaml、pcd等）
                    </p>
                </div>

                <div v-else style="margin-top: 16px;">
                    <el-alert :title="`将覆盖原文件: ${selectedMapForEdit?.mapPath || '未知'}`" type="warning" :closable="false"
                        show-icon />
                </div>
            </div>
            <template #footer>
                <el-button @click="showSaveDialog = false">取消</el-button>
                <el-button type="primary" @click="confirmSaveMap"
                    :disabled="saving || (saveMode === 'new' && !saveMapNameForm.name.trim())">
                    {{ saving ? '保存中...' : '确定保存' }}
                </el-button>
            </template>
        </el-dialog>

        <!-- 建图对话框 -->
        <el-dialog v-model="showMappingConfirmDialog" :title="isMapping ? '建图中' : '开始建图'" width="500px"
            :close-on-click-modal="false" @close="handleMappingDialogClose">
            <div class="mapping-confirm-content">
                <!-- 确认阶段：显示注意事项 -->
                <div v-if="!isMapping">
                    <el-alert type="warning" :closable="false" show-icon>
                        <template #title>
                            <div style="font-weight: bold; margin-bottom: 12px;">建图前请确认以下事项：</div>
                        </template>
                    </el-alert>
                    <div class="mapping-notices">
                        <div class="notice-item">
                            <el-icon class="notice-icon">
                                <Warning />
                            </el-icon>
                            <span><strong>确保现有地图已上传：</strong>建图会覆盖现有地图，确认无误后再开始建图</span>
    </div>
                        <div class="notice-item">
                            <el-icon class="notice-icon">
                                <Warning />
                            </el-icon>
                            <span><strong>确保导航已停止：</strong>建图前必须停止所有导航任务，避免冲突</span>
                        </div>
                        <div class="notice-item">
                            <el-icon class="notice-icon">
                                <Warning />
                            </el-icon>
                            <span><strong>建图范围不宜过大：</strong>建议在较小区域内进行建图，避免数据量过大导致处理缓慢</span>
                        </div>
                        <div class="notice-item">
                            <el-icon class="notice-icon">
                                <Warning />
                            </el-icon>
                            <span><strong>确保机器狗稳定：</strong>建图过程中请保持机器狗稳定，避免剧烈运动</span>
                        </div>
                        <div class="notice-item">
                            <el-icon class="notice-icon">
                                <InfoFilled />
                            </el-icon>
                            <span><strong>建图完成后：</strong>点击"停止建图"按钮将自动保存所有文件</span>
                        </div>
                    </div>
                </div>
                <!-- 启动中阶段：显示启动状态 -->
                <div v-else-if="mappingStarting" class="mapping-starting">
                    <el-alert type="info" :closable="false" show-icon>
                        <template #title>
                            <div style="font-weight: bold; margin-bottom: 12px;">正在启动建图...</div>
                        </template>
                    </el-alert>
                    <div class="mapping-status-content">
                        <div class="status-info">
                            <el-icon class="status-icon">
                                <Location />
                            </el-icon>
                            <div class="status-text">
                                <div class="status-title">等待建图启动</div>
                                <div class="status-desc">正在启动建图进程，请稍候...</div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- 建图中阶段：显示状态和停止按钮 -->
                <div v-else class="mapping-status">
                    <el-alert type="success" :closable="false" show-icon>
                        <template #title>
                            <div style="font-weight: bold; margin-bottom: 12px;">建图正在运行中...</div>
                        </template>
                    </el-alert>
                    <div class="mapping-status-content">
                        <div class="status-info">
                            <el-icon class="status-icon">
                                <Location />
                            </el-icon>
                            <div class="status-text">
                                <div class="status-title">建图进行中</div>
                                <div class="status-desc">正在构建地图</div>
                            </div>
                        </div>
                        <div class="status-tips">
                            <div class="tip-item">
                                <el-icon>
                                    <InfoFilled />
                                </el-icon>
                                <span>建图过程中请保持机器狗稳定移动</span>
                            </div>
                            <div class="tip-item">
                                <el-icon>
                                    <InfoFilled />
                                </el-icon>
                                <span>停止建图后将自动保存所有文件</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <template #footer>
                <el-button v-if="!isMapping && !mappingStarting"
                    @click="showMappingConfirmDialog = false">取消</el-button>
                <el-button v-if="!isMapping" type="primary" @click="confirmStartMapping" :loading="mappingStarting"
                    :disabled="mappingStarting">
                    {{ mappingStarting ? '正在启动...' : '确认开始建图' }}
                </el-button>
                <el-button v-if="isMapping" type="danger" @click="handleStopMapping" :loading="mappingStopping"
                    size="large">
                    <el-icon style="margin-right: 5px;">
                        <Delete />
                    </el-icon>
                    停止建图
                </el-button>
            </template>
        </el-dialog>

    </div>
</template>

<script setup lang="ts">
import { API_BASE_URL } from '@/config'
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue'
import { ElButton, ElButtonGroup, ElDialog, ElIcon, ElMessage, ElMessageBox, ElInputNumber, ElRadioGroup, ElRadio, ElInput, ElAlert, ElProgress, ElDivider, ElForm, ElFormItem } from 'element-plus'
import { Location, FolderOpened, Edit, Document, Check, Upload, Delete, ZoomIn, ZoomOut, Refresh, Warning, InfoFilled, List } from '@element-plus/icons-vue'
import { useRosStore } from '@/stores/ros'
import { createHttpFileTransferClient } from '@/utils/httpFileTransferUtils'
import { fetchAllMaps, getQueueFiles, getMapFiles } from '@/utils/mapUtils'
import type { MapInfo } from '@/types/map'
import { rosConnection } from '@/services/rosConnection'

const rosStore = useRosStore()

// 响应式数据
const showMapSelector = ref(false)
const showMapEditSelector = ref(false)
const showMapEditor = ref(false)
const showSaveDialog = ref(false)
const showUploadMapDialog = ref(false)
const showMapNameDialog = ref(false)
const folderInputRef = ref<HTMLInputElement>()
const selectedFolderFiles = ref<File[]>([])
const folderStructure = ref<Record<string, string[]>>({})
const folderValidation = ref<{ valid: boolean; message: string } | null>(null)
const uploadingMap = ref(false)
const uploadMapError = ref('')
const newMapNameForm = ref({ name: '', description: '' })
const downloadingFromRobot = ref(false)
const downloadedRobotFiles = ref<Array<{ name: string; path: string; localPath: string }>>([])
const isFromRobot = ref(false)
const showUploadMapProgress = ref(false)
const uploadMapProgress = ref(0)
const uploadMapStatusText = ref('准备上传...')
const uploadMapCurrentFile = ref('')
// const uploadMapTotalFiles = ref(0)
// const uploadMapCompletedFiles = ref(0)
const uploadMapTotalSize = ref(0) // 总文件大小（字节）
const uploadMapDownloadedSize = ref(0) // 已下载大小（字节）
const uploadMapEta = ref(0) // 预计剩余时间（秒）

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

// 格式化时间（秒）
const formatTime = (seconds: number): string => {
    if (seconds < 60) {
        return `${Math.round(seconds)}秒`
    } else if (seconds < 3600) {
        const mins = Math.floor(seconds / 60)
        const secs = Math.round(seconds % 60)
        return `${mins}分${secs}秒`
    } else {
        const hours = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        return `${hours}小时${mins}分钟`
    }
}

const availableMaps = ref<MapInfo[]>([])
const currentMap = ref<MapInfo | null>(null)
const selectedMapForEdit = ref<MapInfo | null>(null)
const mapCanvasRef = ref<HTMLCanvasElement>()
const editing = ref(false)
const saving = ref(false)
const mapLoaded = ref(false)
const currentTool = ref<'brush' | 'rectangle' | 'eraser' | 'label'>('brush')
const brushSize = ref(5)
const zoomLevel = ref(1.0)
const saveMode = ref<'overwrite' | 'new'>('overwrite')
// const saveFileName = ref<string>('')
const saveMapNameForm = ref({ name: '', description: '' })

// 标签相关
const labels = ref<{ name: string; x: number; y: number }[]>([])
const mapMeta = ref<{ resolution: number; origin: [number, number, number] } | null>(null)
const showLabelManager = ref(false)

const removeLabel = (index: number) => {
    labels.value.splice(index, 1)
    redrawCanvas()
}

// 上传进度相关
const showUploadProgress = ref(false)
const uploadProgress = ref(0)
const uploadStatusText = ref('准备发送...')
const uploadCurrentFile = ref('')
const uploadTotalFiles = ref(0)
const uploadCompletedFiles = ref(0)
const uploadWaiting = ref(false)
const uploadWaitCountdown = ref(5)
const uploadTotalSize = ref(0) // 总文件大小（字节）
const uploadSentSize = ref(0) // 已发送大小（字节）
const uploadEta = ref(0) // 预计剩余时间（秒）
const isUploading = ref(false)
const refreshingMaps = ref(false)

// 绘制状态
const isDrawing = ref(false)
const lastX = ref(0)
const lastY = ref(0)
const startX = ref(0)
const startY = ref(0)
const isSelecting = ref(false)

// 拖动状态
const isPanning = ref(false)
const panStartX = ref(0)
const panStartY = ref(0)
const panOffset = ref({ x: 0, y: 0 })

// 计算属性
const isConnected = computed(() => rosStore.connectionState.connected)

// 订阅 upLoad 话题，收到文件夹路径后触发从机器狗上传到服务器 image 目录
let uploadTopicSubscribed = false

const handleUploadTopicMessage = async (message: any) => {
    const rawPath = typeof message?.data === 'string'
        ? message.data.trim()
        : (typeof message === 'string' ? message.trim() : '')

    if (!rawPath) {
        ElMessage.warning('收到 upLoad 话题但未提供文件夹路径')
        return
    }

    // 将绝对路径转换为相对路径（基于机器狗文件服务根目录 /home/unitree/go2_nav/system）
    const basePrefix = '/home/unitree/go2_nav/system/'
    const relativePath = rawPath.startsWith(basePrefix)
        ? rawPath.slice(basePrefix.length)
        : rawPath.replace(/^\/+/, '')

    const targetName = relativePath.split('/').filter(Boolean).pop() || 'downloaded'

    const wsUrl = rosStore.connectionState.url
    if (!wsUrl) {
        ElMessage.error('未连接到机器狗，无法上传文件夹')
        return
    }

    try {
        const wsUrlObj = new URL(wsUrl)
        const robotHttpUrl = `http://${wsUrlObj.hostname}:8080`

        const response = await fetch(`${API_BASE_URL}/images/download-from-robot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ robotUrl: robotHttpUrl, folderPath: relativePath, targetName })
        })

        if (!response.ok) {
            const errorText = await response.text().catch(() => '')
            throw new Error(errorText || response.statusText)
        }

        const result = await response.json().catch(() => ({}))
        if (result && result.success === false) {
            throw new Error(result.error || '从机器狗上传失败')
        }

        ElMessage.success(`已从机器狗上传文件夹: ${targetName}`)
    } catch (error) {
        console.error('处理 upLoad 话题失败:', error)
        ElMessage.error(error instanceof Error ? error.message : '上传失败')
    }
}

const subscribeUploadTopic = async () => {
    if (uploadTopicSubscribed || !isConnected.value) return

    try {
        await rosConnection.subscribe({
            topic: '/upLoad',
            messageType: 'std_msgs/String',
            callback: handleUploadTopicMessage
        })
        uploadTopicSubscribed = true
    } catch (error) {
        console.error('订阅 upLoad 话题失败:', error)
        uploadTopicSubscribed = false
    }
}

const unsubscribeUploadTopic = () => {
    if (!uploadTopicSubscribed) return
    try {
        rosConnection.unsubscribe('/upLoad')
    } catch (error) {
        console.error('取消订阅 upLoad 话题失败:', error)
    } finally {
        uploadTopicSubscribed = false
    }
}

// 获取可用地图列表
const fetchAvailableMaps = async () => {
    try {
        const maps = await fetchAllMaps()
        availableMaps.value = maps
        if (maps.length === 0) {
            ElMessage.warning('未找到地图文件夹，请检查 maps 目录结构')
        }
    } catch (error) {
        console.error('获取地图列表失败:', error)
        ElMessage.error('获取地图列表失败')
        availableMaps.value = []
    }
}

// 刷新地图列表
const handleRefreshMaps = async () => {
    refreshingMaps.value = true
    try {
        await fetchAvailableMaps()
        ElMessage.success('地图列表已刷新')
    } catch (error) {
        console.error('刷新地图列表失败:', error)
        ElMessage.error('刷新地图列表失败')
    } finally {
        refreshingMaps.value = false
    }
}

// 连接变化时管理 upLoad 订阅
watch(isConnected, (connected) => {
    if (connected) {
        subscribeUploadTopic()
    } else {
        unsubscribeUploadTopic()
    }
}, { immediate: true })

// 建图相关状态
const showMappingConfirmDialog = ref(false)
const mappingStarting = ref(false)
const mappingStopping = ref(false)
const isMapping = ref(false)

// 建图功能
const handleMapping = async () => {
    if (!isConnected.value) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    // 打开对话框时，先订阅状态话题（确保能收到状态更新）
    await subscribeMappingStatus()

    // 等待一小段时间让状态消息到达（如果建图已经启动）
    await new Promise(resolve => setTimeout(resolve, 500))

    // 如果正在建图，直接打开对话框显示状态
    if (isMapping.value) {
        showMappingConfirmDialog.value = true
        return
    }
    // 否则显示确认对话框
    showMappingConfirmDialog.value = true
}

// 确认开始建图
const confirmStartMapping = async () => {
    try {
        mappingStarting.value = true

        // 先订阅建图状态话题（在发布命令之前订阅，确保能收到状态更新）
        await subscribeMappingStatus()

        // 等待一小段时间确保订阅已建立
        await new Promise(resolve => setTimeout(resolve, 500))

        // 发布开始建图命令到 /slam_manager/control 话题
        await rosConnection.publish('/slam_manager/control', 'std_msgs/String', { data: 'start' })

        ElMessage.success('等待建图程序启动...')

        // 等待状态话题确认建图已启动（最多等待18秒，因为收到状态后还要等3秒）
        let waitCount = 0
        const maxWait = 36 // 36次 * 500ms = 18秒（15秒等待状态 + 3秒延迟显示）
        const checkInterval = setInterval(() => {
            waitCount++
            if (isMapping.value) {
                // 建图已启动（状态已切换，说明3秒延迟已完成）
                clearInterval(checkInterval)
                mappingStarting.value = false
            } else if (waitCount >= maxWait) {
                // 超时
                clearInterval(checkInterval)
                mappingStarting.value = false
                ElMessage.warning('等待建图启动超时，请检查机器狗状态')
            }
        }, 500)
    } catch (error) {
        console.error('启动建图失败:', error)
        ElMessage.error('启动建图失败: ' + (error instanceof Error ? error.message : '未知错误'))
        mappingStarting.value = false
        unsubscribeMappingStatus()
    }
}

// 停止建图
const handleStopMapping = async () => {
    try {
        await ElMessageBox.confirm(
            '确定要停止建图吗？\n停止后将自动保存所有文件',
            '确认停止建图',
            {
                confirmButtonText: '确定停止',
                cancelButtonText: '取消',
                type: 'warning',
            }
        )

        mappingStopping.value = true

        // 发布停止建图命令到 /slam_manager/control 话题
        await rosConnection.publish('/slam_manager/control', 'std_msgs/String', { data: 'stop' })

        ElMessage.success('已停止建图，正在保存文件...')

        // 取消订阅状态话题
        unsubscribeMappingStatus()

        // 延迟后重置状态（给后端时间保存文件）
        setTimeout(() => {
            isMapping.value = false
            showMappingConfirmDialog.value = false
            ElMessage.success('建图已停止，文件已保存')
        }, 3000)
    } catch (error) {
        if (error !== 'cancel') { // 忽略用户点击取消
            console.error('停止建图失败:', error)
            ElMessage.error('停止建图失败: ' + (error instanceof Error ? error.message : '未知错误'))
        }
    } finally {
        mappingStopping.value = false
    }
}

// 订阅建图状态话题
let mappingStartTimeout: number | null = null
let isSubscribedToMappingStatus = false

const subscribeMappingStatus = async () => {
    if (!isConnected.value) {
        return
    }

    // 如果已经订阅，不需要重复订阅
    if (isSubscribedToMappingStatus) {
        return
    }

    try {
        rosConnection.subscribe({
            topic: '/slam_manager/status',
        messageType: 'std_msgs/String',
        callback: (message: any) => {
            try {
                    // 解析状态消息，后端返回的是 JSON 字符串格式
                    // 格式：{"status":"mapping_running","is_mapping":true,"pid":123,"package":"fast_lio","file":"mapping_mid360.launch"}
                    // 或：{"status":"mapping_stopped","is_mapping":false,"package":"fast_lio","file":"mapping_mid360.launch"}
                    let statusObj: any = null
                    let statusStr = ''

                    // 获取消息数据
                    let rawData = message.data || message

                    // 如果是字符串，尝试解析为 JSON
                    if (typeof rawData === 'string') {
                        statusStr = rawData
                        try {
                            statusObj = JSON.parse(statusStr)
                        } catch (e) {
                            // 如果不是 JSON 字符串，可能是旧格式的字符串，忽略
                        }
                    } else if (typeof rawData === 'object' && rawData !== null) {
                        // 如果已经是对象
                        statusObj = rawData
                        statusStr = JSON.stringify(statusObj)
                } else {
                        statusStr = String(rawData || '')
                    }

                    // 检查状态：优先使用 is_mapping 字段，其次使用 status 字段
                    let isRunning = false
                    let isStopped = false

                    if (statusObj) {
                        // JSON 对象格式
                        // 优先使用 is_mapping 字段（更可靠）
                        if (typeof statusObj.is_mapping === 'boolean') {
                            isRunning = statusObj.is_mapping === true
                            isStopped = statusObj.is_mapping === false
                } else {
                            // 如果没有 is_mapping 字段，使用 status 字段
                            const status = statusObj.status || statusObj.Status || ''
                            isRunning = status === 'mapping_running' || status === 'running'
                            isStopped = status === 'mapping_stopped' || status === 'stopped'
                        }
                    } else {
                        // 字符串格式（向后兼容旧格式）
                        isRunning = statusStr.includes('status:mapping_running') || statusStr.includes('"status":"mapping_running"')
                        isStopped = statusStr.includes('status:mapping_stopped') || statusStr.includes('"status":"mapping_stopped"')
                    }

                    if (isRunning) {
                        // 建图已启动，等待3秒后再显示建图已启动窗口
                        if (!isMapping.value) {
                            // 如果已经设置了延迟定时器，不再重复设置（避免重复处理）
                            if (mappingStartTimeout === null) {
                                // 延迟3秒后切换状态
                                mappingStartTimeout = window.setTimeout(() => {
                                    isMapping.value = true
                                    mappingStarting.value = false
                                    mappingStartTimeout = null
                                    ElMessage.success('建图已启动...')
                                }, 3000)
                            }
                            // 如果定时器已存在，说明已经在等待中，不需要重复处理
                        }
                        // 如果 isMapping.value 已经是 true，说明状态已更新，不需要处理
                    } else if (isStopped) {
                        // 建图已停止
                        // 清除延迟定时器（如果还在等待启动）
                        if (mappingStartTimeout !== null) {
                            clearTimeout(mappingStartTimeout)
                            mappingStartTimeout = null
                        }

                        if (isMapping.value) {
                            isMapping.value = false
                            if (showMappingConfirmDialog.value) {
                                showMappingConfirmDialog.value = false
                                ElMessage.info('建图已停止')
                            }
                        }
                    }
                    // 移除了未识别状态的日志，因为会频繁触发
            } catch (error) {
                    console.error('解析建图状态失败:', error, message)
                }
            }
        })

        isSubscribedToMappingStatus = true
    } catch (error) {
        console.error('订阅建图状态失败:', error)
        isSubscribedToMappingStatus = false
    }
}

// 取消订阅建图状态话题
const unsubscribeMappingStatus = () => {
    try {
        // 注意：这里不清除延迟定时器，因为可能正在等待状态更新
        // 延迟定时器会在状态更新时自动清除，或在停止建图时清除

        rosConnection.unsubscribe('/slam_manager/status')
        isSubscribedToMappingStatus = false
    } catch (error) {
        console.error('取消订阅建图状态失败:', error)
        isSubscribedToMappingStatus = false
    }
}

// 对话框关闭时取消订阅
const handleMappingDialogClose = () => {
    // 只有在建图未运行时才取消订阅
    // 如果建图正在运行，保持订阅以监控状态
    if (!isMapping.value && !mappingStarting.value) {
        unsubscribeMappingStatus()
        // 清除延迟定时器（如果还在等待）
        if (mappingStartTimeout !== null) {
            clearTimeout(mappingStartTimeout)
            mappingStartTimeout = null
        }
    }
}

// 上传地图
const handleUploadMap = () => {
    showUploadMapDialog.value = true
    selectedFolderFiles.value = []
    folderStructure.value = {}
    folderValidation.value = null
    uploadMapError.value = ''
    newMapNameForm.value = { name: '', description: '' }
    isFromRobot.value = false
    downloadedRobotFiles.value = []
    // 重置文件输入框
    if (folderInputRef.value) {
        folderInputRef.value.value = ''
    }
}

// 关闭上传对话框
const handleCloseUploadDialog = () => {
    showUploadMapDialog.value = false
    showMapNameDialog.value = false
    // 重置状态
    selectedFolderFiles.value = []
    folderStructure.value = {}
    folderValidation.value = null
    uploadMapError.value = ''
    newMapNameForm.value = { name: '', description: '' }
    isFromRobot.value = false
    downloadedRobotFiles.value = []
    // 重置文件输入框
    if (folderInputRef.value) {
        folderInputRef.value.value = ''
    }
}

// 关闭地图名称对话框
const handleCloseMapNameDialog = () => {
    showMapNameDialog.value = false
}

// 触发文件夹选择
const triggerFolderSelect = () => {
    folderInputRef.value?.click()
}

// 处理文件夹选择
const handleFolderSelect = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const files = Array.from(target.files || [])

    if (files.length === 0) {
        return
    }

    selectedFolderFiles.value = files
    uploadMapError.value = ''

    // 分析文件夹结构
    const structure: Record<string, string[]> = {}
    files.forEach(file => {
        // 获取相对路径（去掉第一个目录名，因为那是文件夹名）
        const pathParts = file.webkitRelativePath.split('/')
        if (pathParts.length > 1) {
            const dir = pathParts[1] // 第一级目录
            if (!structure[dir]) {
                structure[dir] = []
            }
            structure[dir].push(file.name)
        }
    })
    folderStructure.value = structure

    // 验证文件夹结构
    validateFolderStructure(files)
}

// 验证文件夹结构
const validateFolderStructure = (files: File[]) => {
    const filePaths = files.map(f => f.webkitRelativePath.toLowerCase())

    // 检查是否有 map 目录
    const hasMapDir = filePaths.some(p => p.includes('/map/'))
    // 检查是否有 queue 目录
    const hasQueueDir = filePaths.some(p => p.includes('/queue/'))
    // 检查 map 目录下是否有地图文件
    const requiredFiles = ['go2.pcd', 'go2.pgm', 'go2.yaml'];

    const hasAllMapFiles = requiredFiles.every(ext => 
        filePaths.some(p => p.includes('/map/') && p.endsWith(ext))
    );
    // 检查是否有配置文件
    // const hasConfig = filePaths.some(p => p.endsWith('config.json') || p.endsWith('map.json'))

    const errors: string[] = []
    if (!hasMapDir) {
        errors.push('缺少 map 目录')
    }
    if (!hasQueueDir) {
        errors.push('缺少 queue 目录')
    }
    if (!hasAllMapFiles) {
        errors.push('map 目录下缺少地图文件')
    }

    if (errors.length > 0) {
        folderValidation.value = {
            valid: false,
            message: `文件夹结构不符合要求: ${errors.join('; ')}`
        }
                } else {
        folderValidation.value = {
            valid: true,
            message: '文件夹结构验证通过'
        }
    }
}

// 确认上传地图
const confirmUploadMap = async () => {
    if (!newMapNameForm.value.name.trim()) {
        ElMessage.warning('请输入地图名称')
        return
    }

    if (!folderValidation.value?.valid && !isFromRobot.value) {
        ElMessage.warning('文件夹结构验证未通过')
        return
    }

    uploadingMap.value = true
    uploadMapError.value = ''

    // 显示进度对话框
    showUploadMapProgress.value = true
    uploadMapProgress.value = 0
    uploadMapStatusText.value = isFromRobot.value ? '准备从机器狗上传到服务器...' : '准备从本地文件上传到服务器...'
    uploadMapCurrentFile.value = ''
    // 初始化文件大小和进度（如果不是从机器狗下载，会在后面计算）
    if (!isFromRobot.value) {
        uploadMapTotalSize.value = 0
        uploadMapDownloadedSize.value = 0
        uploadMapEta.value = 0
    }

    try {
        // 生成文件夹名称（使用当前时间，格式：map_YYYYMMDD_HHmmss）
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        const seconds = String(now.getSeconds()).padStart(2, '0')
        const folderName = `map_${year}${month}${day}_${hours}${minutes}${seconds}`
        const mapName = newMapNameForm.value.name.trim()
        const description = newMapNameForm.value.description.trim()

        // 如果是从机器狗下载，使用服务器端 API 直接下载并保存
        if (isFromRobot.value && downloadedRobotFiles.value.length > 0) {
            // 暂停心跳检测，避免文件传输期间心跳超时
            rosConnection.pauseHeartbeat()

            const wsUrl = rosStore.connectionState.url
            if (!wsUrl) {
                rosConnection.resumeHeartbeat()
                throw new Error('未连接到机器狗')
            }

            // 从 WebSocket URL 提取机器狗的 HTTP URL
            const wsUrlObj = new URL(wsUrl)
            const robotHttpUrl = `http://${wsUrlObj.hostname}:8080`

            // 初始化进度状态
            uploadMapTotalSize.value = 0
            uploadMapDownloadedSize.value = 0
            uploadMapEta.value = 0
            uploadMapProgress.value = 0
            uploadMapStatusText.value = '准备从机器狗上传到服务器...'
            ;(window as any).downloadStartTime = Date.now()

            try {
                // 调用服务器端 API，直接从机器狗下载并保存
                const response = await fetch(`${API_BASE_URL}/maps/download-from-robot`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        robotUrl: robotHttpUrl,
                        files: downloadedRobotFiles.value.map(f => ({
                            path: f.path,
                            name: f.name,
                            localPath: f.localPath,
                            size: (f as any).size || 0
                        })),
                        folderName,
                        mapName,
                        description
                    })
                })

                if (!response.ok) {
                    const errorText = await response.text().catch(() => '')
                    let errorMessage = `服务器端下载失败: HTTP ${response.status} - ${errorText || response.statusText}`
                    
                    // 解析错误信息，提供更友好的提示
                    try {
                        const errorData = JSON.parse(errorText)
                        if (errorData.error) {
                            errorMessage = errorData.error
                            if (errorMessage.includes('无法连接到机器狗文件服务') || errorMessage.includes('ECONNREFUSED')) {
                                errorMessage = '无法连接到机器狗文件服务，请确保：\n1. 机器狗上的文件传输服务正在运行 (file_transfer_api.py)\n2. 端口 8080 未被防火墙阻止\n3. 网络连接正常'
                            }
                        }
                    } catch {
                        // 如果无法解析 JSON，使用原始错误信息
                    }
                    
                    throw new Error(errorMessage)
                }

                if (!response.body) {
                    throw new Error('响应体为空')
                }

                // 读取 SSE 进度更新
                const reader = response.body.getReader()
                const decoder = new TextDecoder()
                let buffer = ''

                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6))

                                if (data.type === 'init') {
                                    uploadMapTotalSize.value = data.totalSize || 0
                                    uploadMapDownloadedSize.value = 0
                                    uploadMapEta.value = 0
                                    uploadMapStatusText.value = `准备从机器狗上传到服务器: ${data.totalFiles} 个文件 (${formatFileSize(data.totalSize || 0)})...`
                                    uploadMapProgress.value = 0
                                } else if (data.type === 'fileStart') {
                                    uploadMapStatusText.value = `正在从机器狗上传到服务器: ${data.fileName} (${data.fileIndex}/${data.totalFiles})`
                                } else if (data.type === 'progress') {
                                    uploadMapDownloadedSize.value = data.downloadedSize || 0
                                    uploadMapProgress.value = data.progress || 0
                                    uploadMapStatusText.value = `正在从机器狗上传到服务器: ${formatFileSize(data.downloadedSize || 0)} / ${formatFileSize(data.totalSize || 0)} (${Math.round(data.progress || 0)}%)`

                                    // 计算 ETA
                                    if (data.progress > 0 && data.progress < 100) {
                                        const remaining = 100 - data.progress
                                        const elapsed = Date.now() - (window as any).downloadStartTime || 0
                                        if (elapsed > 0) {
                                            const speed = data.progress / (elapsed / 1000)
                                            const eta = remaining / speed
                                            uploadMapEta.value = Math.max(0, eta)
                                        }
                                    }
                                } else if (data.type === 'fileComplete') {
                                    uploadMapDownloadedSize.value = data.downloadedSize || 0
                                    uploadMapProgress.value = data.progress || 0
                                    uploadMapStatusText.value = `已完成: ${data.fileName}`
                                } else if (data.type === 'complete') {
                                    uploadMapProgress.value = 100
                                    uploadMapDownloadedSize.value = data.totalSize || 0
                                    uploadMapEta.value = 0
                                    uploadMapStatusText.value = `已从机器狗上传到服务器完成: ${formatFileSize(data.totalSize || 0)}`
                                } else if (data.type === 'fileError') {
                                    console.error(`下载文件失败: ${data.fileName}`, data.error)
                                    // 检查是否是连接错误
                                    const errorMsg = data.error || ''
                                    if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('connect')) {
                                        ElMessage.error(`无法连接到机器狗文件服务 (${data.fileName})，请确保机器狗上的文件传输服务正在运行`)
                                    } else if (errorMsg.includes('timeout')) {
                                        ElMessage.warning(`下载超时: ${data.fileName}，请检查网络连接`)
                                    } else {
                                        ElMessage.warning(`下载文件失败: ${data.fileName} - ${data.error}`)
                                    }
                                }
                            } catch (e) {
                                console.error('解析进度数据失败:', e, line)
                            }
                        }
                    }
                }
            } finally {
                // 恢复心跳检测
                rosConnection.resumeHeartbeat()
            }

            // 等待服务器处理完成
            uploadMapStatusText.value = '已从机器狗上传到服务器完成，等待服务器处理...'
            await new Promise(resolve => setTimeout(resolve, 2000))

            // 刷新地图列表
            try {
                await fetchAvailableMaps()
            } catch (error) {
                console.warn('刷新地图列表失败:', error)
            }

            uploadMapStatusText.value = '完成'
            ElMessage.success('地图已从机器狗下载成功')
            showMapNameDialog.value = false
            showUploadMapDialog.value = false
            showUploadMapProgress.value = false

            // 重置状态
            isFromRobot.value = false
            downloadedRobotFiles.value = []
            newMapNameForm.value = { name: '', description: '' }

            return
        }

        // 本地文件上传（原有逻辑）
        const formData = new FormData()
        formData.append('folderName', folderName)
        formData.append('mapName', mapName)
        formData.append('description', description)

        // 准备文件列表
        const filesToUpload: Array<{ file: File | Blob; path: string; name: string }> = []

        // 本地选择的文件
        selectedFolderFiles.value.forEach(file => {
            const relativePath = file.webkitRelativePath
            // 去掉第一级目录名（文件夹名），保留后续路径
            const pathParts = relativePath.split('/')
            if (pathParts.length > 1) {
                const targetPath = pathParts.slice(1).join('/')
                filesToUpload.push({ file, path: targetPath, name: file.name })
            }
        })

        // 计算总文件大小
        let totalFileSize = 0
        try {
            for (const item of filesToUpload) {
                if (item.file instanceof File || item.file instanceof Blob) {
                    totalFileSize += item.file.size
                }
            }
        } catch (e) {
            // 忽略错误
        }

        // 初始化进度状态
        uploadMapTotalSize.value = totalFileSize
        uploadMapDownloadedSize.value = 0
        uploadMapEta.value = 0
        uploadMapProgress.value = 0
        uploadMapStatusText.value = `准备从本地文件上传到服务器: ${filesToUpload.length} 个文件 (${formatFileSize(totalFileSize)})...`
        ;(window as any).uploadStartTime = Date.now()
        let lastUpdateTime = Date.now()
        let lastUploadedSize = 0

        // 使用 XMLHttpRequest 上传以支持进度
        await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            
            // 设置超时（30分钟，防止网络缓慢时误判为失败）
            const timeout = setTimeout(() => {
                xhr.abort()
                reject(new Error('上传超时（30分钟），请检查网络连接后重试'))
            }, 30 * 60 * 1000)

            // 监听上传进度
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const progress = (e.loaded / e.total) * 100
                    const uploadedSize = e.loaded
                    const totalSize = e.total
                    
                    // 更新进度
                    uploadMapProgress.value = Math.min(100, progress)
                    uploadMapDownloadedSize.value = uploadedSize
                    uploadMapTotalSize.value = totalSize
                    uploadMapStatusText.value = `正在从本地文件上传到服务器: ${formatFileSize(uploadedSize)} / ${formatFileSize(totalSize)} (${Math.round(progress)}%)`

                    // 计算 ETA
                    const now = Date.now()
                    // const timeElapsed = (now - (window as any).uploadStartTime) / 1000 // 秒
                    const sizeUploaded = uploadedSize - lastUploadedSize
                    const timeSinceLastUpdate = (now - lastUpdateTime) / 1000

                    if (timeSinceLastUpdate > 1 && sizeUploaded > 0 && progress < 100) {
                        const speed = sizeUploaded / timeSinceLastUpdate // 字节/秒
                        const remainingSize = totalSize - uploadedSize
                        const eta = speed > 0 ? remainingSize / speed : 0
                        uploadMapEta.value = Math.max(0, eta)
                        lastUpdateTime = now
                        lastUploadedSize = uploadedSize
                    }

                    // 如果上传完成，立即更新状态
                    if (e.loaded >= e.total) {
                        uploadMapProgress.value = 100
                        uploadMapDownloadedSize.value = totalSize
                        uploadMapEta.value = 0
                        uploadMapStatusText.value = '上传完成，等待服务器响应...'
                    }
                } else {
                    // 如果无法计算大小，至少显示进度百分比
                    uploadMapStatusText.value = '正在上传文件...'
                }
            })

            xhr.addEventListener('load', () => {
                clearTimeout(timeout)
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const result = JSON.parse(xhr.responseText)
                        if (result.success) {
                            uploadMapProgress.value = 100
                            uploadMapStatusText.value = '本地文件上传完成，等待服务器处理文件...'
                            
                            // 计算上传的文件总大小，用于确定等待时间
                            let totalFileSize = 0
                            try {
                                for (const item of filesToUpload) {
                                    if (item.file instanceof File || item.file instanceof Blob) {
                                        totalFileSize += item.file.size
                                    }
                                }
                            } catch (e) {
                                // 忽略错误
                            }
                            
                            const totalSizeMB = totalFileSize / 1024 / 1024
                            // 对于大文件，需要等待服务器处理完成
                            // 根据文件大小动态调整等待时间：>100MB: 10秒, >50MB: 5秒, 其他: 2秒
                            const waitTime = totalSizeMB > 100 ? 10000 : totalSizeMB > 50 ? 5000 : 2000
                            
                            // 等待服务器处理大文件
                            setTimeout(async () => {
                                try {
                                    uploadMapStatusText.value = '正在刷新地图列表...'
                                    // 刷新地图列表，添加重试机制
                                    let retries = 3
                                    let success = false
                                    
                                    while (retries > 0 && !success) {
                                        try {
                                            await fetchAvailableMaps()
                                            success = true
                                        } catch (error) {
                                            retries--
                                            if (retries > 0) {
                                                console.warn(`刷新地图列表失败，${retries}次重试剩余...`, error)
                                                uploadMapStatusText.value = `刷新地图列表失败，正在重试... (剩余${retries}次)`
                                                await new Promise(resolve => setTimeout(resolve, 2000))
                                            } else {
                                                console.error('刷新地图列表失败，已用完重试次数', error)
                                                // 即使刷新失败，也认为上传成功
                                                ElMessage.warning('地图上传成功，但刷新地图列表失败，请手动刷新')
                                            }
                                        }
                                    }
                                    
                                    uploadMapStatusText.value = '上传完成'
                                    ElMessage.success(isFromRobot.value ? '地图已从机器狗上传到服务器成功' : '地图已从本地文件上传到服务器成功')
                                    showMapNameDialog.value = false
                                    showUploadMapDialog.value = false
                                    showUploadMapProgress.value = false
                                    // 重置所有状态
                                    isFromRobot.value = false
                                    downloadedRobotFiles.value = []
                                    selectedFolderFiles.value = []
                                    folderStructure.value = {}
                                    folderValidation.value = null
                                    uploadMapError.value = ''
                                    newMapNameForm.value = { name: '', description: '' }
                                    // 重置文件输入框
                                    if (folderInputRef.value) {
                                        folderInputRef.value.value = ''
                                    }
                                    resolve()
                                } catch (error) {
                                    // 即使刷新失败，也认为上传成功
                                    ElMessage.warning('地图上传成功，但刷新地图列表失败，请手动刷新')
                                    showMapNameDialog.value = false
                                    showUploadMapDialog.value = false
                                    showUploadMapProgress.value = false
                                    resolve() // 不拒绝，因为上传本身是成功的
                                }
                            }, waitTime)
                        } else {
                            throw new Error(result.error || '上传失败')
                        }
                    } catch (error) {
                        reject(error instanceof Error ? error : new Error('解析响应失败'))
                    }
                } else {
                    let errorMsg = `HTTP ${xhr.status}: ${xhr.statusText}`
                    // 为常见的服务器错误提供更友好的提示
                    if (xhr.status === 502) {
                        errorMsg = '服务器网关错误 (502)，可能是后端服务未启动或无法连接。请检查服务器状态。'
                    } else if (xhr.status === 503) {
                        errorMsg = '服务暂时不可用 (503)，请稍后重试。'
                    } else if (xhr.status === 504) {
                        errorMsg = '网关超时 (504)，服务器响应时间过长。请检查网络连接。'
                    } else if (xhr.status >= 500) {
                        errorMsg = `服务器错误 (${xhr.status})，请稍后重试或联系管理员。`
                    }
                    try {
                        const errorResult = JSON.parse(xhr.responseText)
                        if (errorResult.error) {
                            errorMsg = errorResult.error
                            if (errorResult.details) {
                                errorMsg += ` (${JSON.stringify(errorResult.details)})`
                            }
                        }
                    } catch (e) {
                        // 忽略解析错误，使用上面的默认错误消息
                    }
                    reject(new Error(errorMsg))
                }
            })

            xhr.addEventListener('error', () => {
                clearTimeout(timeout)
                reject(new Error('网络错误'))
            })

            xhr.addEventListener('abort', () => {
                clearTimeout(timeout)
                reject(new Error('上传已取消'))
            })

            // 添加文件到 FormData
            // 使用 item.path (相对路径) 作为文件名，以便后端可以保持目录结构
            filesToUpload.forEach((item) => {
                // 简单的文件过滤：只上传通常在 map 目录下的文件
                const ext = item.name.split('.').pop()?.toLowerCase()
                if (['pgm', 'yaml', 'yml', 'pcd', 'json'].includes(ext || '')) {
                    // 优先使用相对路径，如果没有则使用文件名
                    const fileName = item.path || item.name
                    formData.append('files', item.file, fileName)
                }
            })


            uploadMapStatusText.value = '开始上传...'
            xhr.open('POST', `${API_BASE_URL}/maps/save`)
            xhr.send(formData)
        })
    } catch (error) {
        console.error('上传地图失败:', error)
        const errorMessage = error instanceof Error ? error.message : '上传失败，请重试'
        uploadMapError.value = errorMessage
        uploadMapStatusText.value = '上传失败'
        uploadMapProgress.value = 0
        ElMessage.error(errorMessage)
        showUploadMapProgress.value = false
        // 错误时也重置部分状态，但保留已选择的文件以便重试
    } finally {
        uploadingMap.value = false
    }
}

// 从机器狗上传地图
const handleDownloadFromRobot = async () => {
    if (!isConnected.value) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    downloadingFromRobot.value = true
    uploadMapError.value = ''

    try {
        const wsUrl = rosStore.connectionState.url
        if (!wsUrl) {
            throw new Error('未连接到机器狗')
        }

        // 创建 HTTP 文件传输客户端
        const httpClient = createHttpFileTransferClient(wsUrl, 8080)

        // 1. 列出机器狗 map 目录的文件（包含大小信息）
        let mapFiles: Array<{ name: string; path: string; size: number }> = []
        try {
            const mapItems = await httpClient.listDirectory('map')
            mapFiles = mapItems
                .filter(item => item.type === 'file')
                .filter(item => {
                    const ext = item.name.toLowerCase().split('.').pop()
                    return ['pgm', 'pcd', 'yaml', 'yml'].includes(ext || '')
                })
                .map(item => ({ 
                    name: item.name, 
                    path: `map/${item.name}`,
                    size: item.size || 0
                }))
        } catch (error) {
            console.warn('无法列出 map 目录:', error)
            ElMessage.warning('无法访问机器狗的 map 目录')
        }

        // 2. 列出机器狗 queues 目录的文件（包含大小信息）
        let queueFiles: Array<{ name: string; path: string; size: number }> = []
        try {
            const queueItems = await httpClient.listDirectory('queues')
            queueFiles = queueItems
                .filter(item => item.type === 'file')
                .filter(item => item.name.toLowerCase().endsWith('.json'))
                .map(item => ({ 
                    name: item.name, 
                    path: `queues/${item.name}`,
                    size: item.size || 0
                }))
        } catch (error) {
            console.warn('无法列出 queues 目录:', error)
            ElMessage.warning('无法访问机器狗的 queues 目录')
        }

        if (mapFiles.length === 0 && queueFiles.length === 0) {
            ElMessage.warning('机器狗上没有找到地图文件')
            return
        }

        // 3. 计算总文件大小
        const totalFiles = mapFiles.length + queueFiles.length
        const totalSize = mapFiles.reduce((sum, f) => sum + f.size, 0) + 
                         queueFiles.reduce((sum, f) => sum + f.size, 0)

        if (totalFiles === 0 || totalSize === 0) {
            ElMessage.warning('机器狗上没有找到地图文件')
            return
        }

        // 准备文件列表信息（不下载到浏览器，只保存文件信息）
        // 实际下载将在用户确认后通过服务器端 API 直接进行
        const allFiles: Array<{ name: string; path: string; localPath: string; size: number }> = []
        
        // 准备 map 目录的文件信息
        for (const file of mapFiles) {
            const localPath = `map/${file.name}`
            allFiles.push({ name: file.name, path: file.path, localPath, size: file.size })
        }

        // 准备 queues 目录的文件信息
        for (const file of queueFiles) {
            const localPath = `queue/${file.name}`
            allFiles.push({ name: file.name, path: file.path, localPath, size: file.size })
        }

        if (allFiles.length === 0) {
            ElMessage.warning('没有找到任何文件')
            downloadingFromRobot.value = false
            return
        }

        // 显示地图名称输入对话框
        selectedFolderFiles.value = [] // 清空之前的选择
        folderStructure.value = {
            'map': mapFiles.map(f => f.name),
            'queue': queueFiles.map(f => f.name)
        }
        folderValidation.value = {
            valid: true,
            message: `准备从机器狗下载 ${allFiles.length} 个文件 (${formatFileSize(totalSize)})`
        }

        // 保存文件信息，供 confirmUploadMap 使用
        // confirmUploadMap 会直接调用服务器端 API 下载并保存，不会先下载到浏览器
        downloadedRobotFiles.value = allFiles
        isFromRobot.value = true

        // 显示地图名称对话框，等待用户输入并确认
        // 用户点击"确认上传"按钮时会调用 confirmUploadMap 函数
        // confirmUploadMap 会使用服务器端 API 直接从机器狗下载并保存到服务器
        showMapNameDialog.value = true

        downloadingFromRobot.value = false
    } catch (error) {
        console.error('从机器狗下载地图失败:', error)
        uploadMapError.value = error instanceof Error ? error.message : '从机器狗下载地图失败，请重试'
        ElMessage.error(uploadMapError.value)
        showUploadMapProgress.value = false
    } finally {
        downloadingFromRobot.value = false
        // 恢复心跳检测
        rosConnection.resumeHeartbeat()
    }
}

// 地图编辑
const handleMapEdit = () => {
    showMapEditSelector.value = true
    selectedMapForEdit.value = null
    if (availableMaps.value.length === 0) {
        fetchAvailableMaps()
    }
}

// 选择地图用于编辑
const selectMapForEdit = (map: MapInfo) => {
    selectedMapForEdit.value = map
}

// 确认地图编辑选择
const confirmMapEditSelection = async () => {
    if (!selectedMapForEdit.value) {
        ElMessage.warning('请先选择地图')
        return
    }

    showMapEditSelector.value = false
    showMapEditor.value = true

    // 加载选中的地图
    if (selectedMapForEdit.value.mapPath) {
        await loadMapForEdit(selectedMapForEdit.value.mapPath)
    }
}

// 删除地图
const handleDeleteMap = async (map: MapInfo) => {
    try {
        await ElMessageBox.confirm(
            `确定要删除地图 "${map.displayName}" 吗？\n此操作将删除该地图的所有文件，且无法恢复！`,
            '确认删除',
            {
                confirmButtonText: '确定删除',
                cancelButtonText: '取消',
                type: 'warning',
                dangerouslyUseHTMLString: false
            }
        )

        // 调用更新配置API，标记为已删除
        const response = await fetch(`${API_BASE_URL}/maps/update-config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                folderName: map.folderName,
                config: { isDelete: true }
            })
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: '删除失败' }))
            throw new Error(errorData.error || `删除失败: HTTP ${response.status}`)
        }

        const result = await response.json()
        if (result.success) {
            ElMessage.success('地图删除成功')
            // 刷新地图列表
            await fetchAvailableMaps()
            // 如果删除的是当前选中的地图，清空选择
            if (selectedMapForEdit.value?.folderName === map.folderName) {
                selectedMapForEdit.value = null
            }
            // 如果删除的是当前使用的地图，清空当前地图
            if (currentMap.value?.folderName === map.folderName) {
                currentMap.value = null
            }
        } else {
            throw new Error(result.error || '删除失败')
        }
        } catch (error) {
        if (error !== 'cancel') {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error('删除地图失败:', error)
            ElMessage.error(`删除地图失败: ${errorMessage}`)
        }
    }
}


// 选择地图
const selectMap = (map: MapInfo) => {
    currentMap.value = map
}

// 发送文件到机器狗（使用 HTTP 传输）
const sendMapToRobot = async (mapInfo: MapInfo) => {
    if (!isConnected.value) {
        ElMessage.warning('请先连接到机器狗')
        return false
    }

    if (!mapInfo.mapPath) {
        ElMessage.error('地图文件路径无效')
            return false
    }

    // 暂停心跳检测，避免文件传输期间心跳超时
    rosConnection.pauseHeartbeat()

    // 初始化上传进度
    isUploading.value = true
    showUploadProgress.value = true
    uploadProgress.value = 0
        uploadStatusText.value = '准备从服务器发送到机器狗...'
        uploadCurrentFile.value = ''
        uploadTotalFiles.value = 0
        uploadCompletedFiles.value = 0
        uploadWaiting.value = false
        uploadWaitCountdown.value = 5
        uploadTotalSize.value = 0
        uploadSentSize.value = 0
        uploadEta.value = 0

    try {
        // 初始化 HTTP 客户端
        const wsUrl = rosStore.connectionState.url
        if (!wsUrl) {
            throw new Error('无法获取连接 URL，请先连接到机器狗')
        }

        // 验证 WebSocket URL 不是 localhost
        try {
            const url = new URL(wsUrl)
            if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
                throw new Error('不能使用 localhost 连接机器狗，请使用机器狗的实际 IP 地址（例如：ws://192.168.1.100:9090）')
        }
    } catch (error) {
            if (error instanceof Error && error.message.includes('localhost')) {
                throw error
            }
            // URL 解析失败，继续尝试
        }

        // 创建 HTTP 客户端，使用机器狗的 IP 和 8080 端口（不是本地 3000 端口）
        const httpClient = createHttpFileTransferClient(wsUrl, 8080)
        
        // 打印调试信息
        console.log(`[sendMapToRobot] WebSocket URL: ${wsUrl}`)
        console.log(`[sendMapToRobot] HTTP 客户端已创建，baseUrl: ${httpClient.getBaseUrl()}`)

        // 检查连接
        console.log(`[sendMapToRobot] 检查 HTTP 连接...`)
        const connected = await httpClient.checkConnection()
        if (!connected) {
            console.error(`[sendMapToRobot] HTTP 连接检查失败`)
            throw new Error('HTTP 文件服务未连接，请确保机器狗上已运行文件服务 API')
        }
        console.log(`[sendMapToRobot] HTTP 连接检查成功`)

        // 目标路径（相对于 BASE_DIR = /home/unitree/go2_nav/system）
        // 根据后端 API，所有路径都是相对于 BASE_DIR 的
        const mapDestinationPath = 'map'
        const queueDestinationPath = 'queues'

        // 1. 确保目标目录存在（必须在清理之前创建）
        try {
            await httpClient.createDirectory(mapDestinationPath)
        } catch (error) {
            // 目录可能已存在，忽略错误
        }

        try {
            await httpClient.createDirectory(queueDestinationPath)
        } catch (error) {
            // 目录可能已存在，忽略错误
        }

        // 2. 删除目标目录中的现有文件（并行删除以提高速度）
        ElMessage.info('正在清理目标目录...')
        
        // 带超时的删除操作包装函数
        const deleteFileWithTimeout = async (deletePath: string, timeout = 5000): Promise<void> => {
            return Promise.race([
                httpClient.deleteFile(deletePath),
                new Promise<void>((_, reject) => 
                    setTimeout(() => reject(new Error('删除操作超时')), timeout)
                )
            ]).catch(error => {
                // 忽略超时和删除失败，不中断流程
                console.warn(`删除文件超时或失败: ${deletePath}`, error)
            })
        }

        try {
            // 列出 map 目录中的文件并并行删除（添加超时保护）
            try {
                const mapFiles = await Promise.race([
                    httpClient.listDirectory(mapDestinationPath),
                    new Promise<never>((_, reject) => 
                        setTimeout(() => reject(new Error('列出目录超时')), 10000)
                    )
                ]).catch(() => []) as Array<{ name: string; path: string; type: string }>
                const deleteTasks: Array<Promise<void>> = []
                
                for (const file of mapFiles) {
                    if (file.type === 'file' && (
                        file.name.endsWith('.pgm') ||
                        file.name.endsWith('.pcd') ||
                        file.name.endsWith('.yaml') ||
                        file.name.endsWith('.yml')
                    )) {
                        const deletePath = file.path || `${mapDestinationPath}/${file.name}`
                        deleteTasks.push(deleteFileWithTimeout(deletePath))
                    }
                }
                
                // 并行执行所有删除操作，等待完成（最多5秒）
                await Promise.race([
                    Promise.allSettled(deleteTasks),
                    new Promise(resolve => setTimeout(resolve, 5000))
                ])
            } catch (error) {
                // map 目录可能不存在或为空，忽略错误
            }

            // 列出 queues 目录中的文件并并行删除（添加超时保护）
            try {
                const queueFiles = await Promise.race([
                    httpClient.listDirectory(queueDestinationPath),
                    new Promise<never>((_, reject) => 
                        setTimeout(() => reject(new Error('列出目录超时')), 10000)
                    )
                ]).catch(() => []) as Array<{ name: string; path: string; type: string }>
                const deleteTasks: Array<Promise<void>> = []
                
                for (const file of queueFiles) {
                    if (file.type === 'file' && file.name.endsWith('.json')) {
                        const deletePath = file.path || `${queueDestinationPath}/${file.name}`
                        deleteTasks.push(deleteFileWithTimeout(deletePath))
                    }
                }
                
                // 并行执行所有删除操作，等待完成（最多5秒）
                await Promise.race([
                    Promise.allSettled(deleteTasks),
                    new Promise(resolve => setTimeout(resolve, 5000))
                ])
            } catch (error) {
                // queues 目录可能不存在或为空，忽略错误
            }
        } catch (error) {
            // 继续执行，不中断流程
        }

        // 3. 使用服务器端流式转发（更高效，不经过浏览器）
        console.log(`[sendMapToRobot] 获取地图文件列表，地图名称: ${mapInfo.folderName}`)
        const mapFiles = await getMapFiles(mapInfo.folderName)
        const queueFiles = await getQueueFiles(mapInfo.folderName)
        console.log(`[sendMapToRobot] 找到 ${mapFiles.length} 个地图文件，${queueFiles.length} 个路线文件`)

        // 计算总文件数
        const totalFiles = mapFiles.length + queueFiles.length
        uploadTotalFiles.value = totalFiles
        uploadCompletedFiles.value = 0
        uploadProgress.value = 0
        uploadStatusText.value = '准备发送...'
        uploadCurrentFile.value = ''

        if (totalFiles === 0) {
            throw new Error('没有找到要上传的文件')
        }

        // 准备文件列表（合并地图文件和路线文件）
        const allFilesToUpload: Array<{ localPath: string; fileName: string; destinationPath: string }> = []
        
        // 添加地图文件
        for (const mapFile of mapFiles) {
            allFilesToUpload.push({
                localPath: mapFile,
                fileName: mapFile.split('/').pop() || 'unknown',
                destinationPath: mapDestinationPath
            })
        }
        
        // 添加路线文件
        for (const queueFile of queueFiles) {
            allFilesToUpload.push({
                localPath: queueFile,
                fileName: queueFile.split('/').pop() || 'unknown',
                destinationPath: queueDestinationPath
            })
        }

        // 显示进度
        uploadStatusText.value = `准备从服务器发送 ${totalFiles} 个文件到机器狗...`
        uploadProgress.value = 1 // 初始进度

        // 调用服务器端 API，直接流式转发文件（使用 Server-Sent Events 接收进度）
        try {
            console.log(`[sendMapToRobot] 调用服务器端转发 API，文件数量: ${allFilesToUpload.length}`)
            
            // 从 WebSocket URL 提取机器狗的 HTTP URL
            const wsUrlObj = new URL(wsUrl)
            const robotHttpUrl = `http://${wsUrlObj.hostname}:8080`
            
            const response = await fetch(`${API_BASE_URL}/maps/send-to-robot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    robotUrl: robotHttpUrl,
                    files: allFilesToUpload.map(f => ({
                        localPath: f.localPath,
                        fileName: f.fileName,
                        destinationPath: f.destinationPath // 每个文件自己的目标路径
                    })),
                    destinationPath: mapDestinationPath // 默认目标路径（向后兼容）
                })
            })

            if (!response.ok) {
                const errorText = await response.text().catch(() => '')
                throw new Error(`服务器端转发失败: HTTP ${response.status} - ${errorText || response.statusText}`)
            }

            if (!response.body) {
                throw new Error('响应体为空')
            }

            // 使用 ReadableStream 读取 Server-Sent Events
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let totalSize = 0
            // let uploadedSize = 0
            let currentFileName = ''

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || '' // 保留最后不完整的行

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6))
                            
                            if (data.type === 'init') {
                                totalSize = data.totalSize || 0
                                uploadTotalSize.value = totalSize
                                uploadSentSize.value = 0
                                uploadEta.value = 0
                                uploadTotalFiles.value = data.totalFiles || 0
                                uploadCompletedFiles.value = 0
                                uploadProgress.value = 0
                                console.log(`[sendMapToRobot] 总文件大小: ${formatFileSize(totalSize)}, 文件数: ${data.totalFiles}`)
                                uploadStatusText.value = `准备从服务器发送 ${data.totalFiles} 个文件到机器狗 (${formatFileSize(totalSize)})...`
                                ;(window as any).uploadStartTime = Date.now()
                            } else if (data.type === 'fileStart') {
                                currentFileName = data.fileName
                                uploadCurrentFile.value = currentFileName
                                uploadStatusText.value = `正在从服务器发送到机器狗: ${currentFileName} (${data.fileIndex}/${data.totalFiles})`
                                console.log(`[sendMapToRobot] 开始发送文件: ${currentFileName} (${formatFileSize(data.fileSize || 0)})`)
                            } else if (data.type === 'progress') {
                                uploadSentSize.value = data.uploadedSize || uploadSentSize.value
                                uploadTotalSize.value = data.totalSize || uploadTotalSize.value
                                uploadProgress.value = data.progress || 0
                                uploadStatusText.value = `正在从服务器发送到机器狗: ${formatFileSize(uploadSentSize.value)} / ${formatFileSize(uploadTotalSize.value)} (${Math.round(data.progress || 0)}%)`
                                
                                // 计算 ETA
                                if (data.progress > 0 && data.progress < 100) {
                                    const elapsed = Date.now() - ((window as any).uploadStartTime || Date.now())
                                    if (elapsed > 0) {
                                        const speed = data.progress / (elapsed / 1000)
                                        const remaining = 100 - data.progress
                                        const eta = remaining / speed
                                        uploadEta.value = Math.max(0, eta)
                                    }
                                }
                                
                                // 每 10% 记录一次日志
                                if (data.progress % 10 === 0 && data.progress > 0) {
                                    console.log(`[sendMapToRobot] 上传进度: ${data.progress}% (${formatFileSize(uploadSentSize.value)} / ${formatFileSize(uploadTotalSize.value)})`)
                                }
                            } else if (data.type === 'fileComplete') {
                                uploadSentSize.value = data.uploadedSize || uploadSentSize.value
                                uploadTotalSize.value = data.totalSize || uploadTotalSize.value
                                uploadProgress.value = data.progress || 0
                                uploadCompletedFiles.value++
                                uploadStatusText.value = `已完成: ${data.fileName}`
                                console.log(`[sendMapToRobot] 文件发送完成: ${data.fileName}`)
                            } else if (data.type === 'complete') {
                                // 所有文件上传完成
                                const results = data.results || []
                                const successCount = results.filter((r: any) => r.success).length
                                const failCount = results.length - successCount

                                if (failCount > 0) {
                                    const failedFiles = results
                                        .filter((r: any) => !r.success)
                                        .map((r: any) => `${r.file}${r.error ? ` (${r.error})` : ''}`)
                                        .join(', ')
                                    console.warn(`[sendMapToRobot] 部分文件上传失败: ${failedFiles}`)
                                    ElMessage.warning(`部分文件上传失败: ${failedFiles}`)
                                }

                                uploadProgress.value = 100
                                uploadSentSize.value = data.uploadedSize || uploadTotalSize.value
                                uploadTotalSize.value = data.totalSize || uploadTotalSize.value
                                uploadEta.value = 0
                                uploadCompletedFiles.value = totalFiles
                                uploadStatusText.value = `已从服务器发送 ${successCount}/${totalFiles} 个文件到机器狗 (${formatFileSize(uploadSentSize.value)})`
                                uploadCurrentFile.value = ''

                                console.log(`[sendMapToRobot] 服务器端转发完成: ${successCount} 成功, ${failCount} 失败`)
                            } else if (data.type === 'error') {
                                // 服务器端发生错误
                                const errorMessage = data.error || '未知错误'
                                console.error(`[sendMapToRobot] 服务器端错误:`, errorMessage)
                                throw new Error(`服务器端错误: ${errorMessage}`)
                            }
                        } catch (e) {
                            console.error(`[sendMapToRobot] 解析进度数据失败:`, e, line)
                        }
                    }
                }
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error(`[sendMapToRobot] 服务器端转发失败:`, error)
            throw new Error(`发送文件到机器狗失败: ${errorMessage}`)
        }

        // 6. 等待5秒确保机器狗写入数据
        uploadProgress.value = 100
        uploadStatusText.value = '文件已从服务器发送到机器狗完成，等待机器狗处理数据...'
        uploadCurrentFile.value = ''
        uploadWaiting.value = true

        for (let i = 5; i > 0; i--) {
            uploadWaitCountdown.value = i
            await new Promise(resolve => setTimeout(resolve, 1000))
        }

        uploadWaiting.value = false
        showUploadProgress.value = false
        isUploading.value = false

        ElMessage.success(`已成功发送到机器狗\n- 地图文件 (${mapFiles.length} 个)\n- 路线文件 (${queueFiles.length} 个)`)
        return true
    } catch (error) {
        // 忽略浏览器扩展相关的错误
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (!errorMessage.includes('content_script') && !errorMessage.includes('fetchError')) {
            console.error('发送地图文件失败:', error)
            uploadWaiting.value = false
            showUploadProgress.value = false
            isUploading.value = false
            ElMessage.error(`发送地图文件失败: ${errorMessage}`)
        return false
        }
        // 如果是扩展错误，继续执行（可能已经成功）
        uploadWaiting.value = false
        showUploadProgress.value = false
        isUploading.value = false
        return true
    } finally {
        // 恢复心跳检测
        rosConnection.resumeHeartbeat()
    }
}

// 确认地图选择
const confirmMapSelection = async () => {
    if (!currentMap.value) {
        ElMessage.warning('请先选择地图')
        return
    }

    if (!isConnected.value) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    try {
        // 发送文件到机器狗
        const success = await sendMapToRobot(currentMap.value)
        if (success) {
            showMapSelector.value = false
        }
    } catch (error) {
        console.error('确认地图选择失败:', error)
        ElMessage.error('发送地图文件失败')
    }
}


// 解析PGM文件（支持二进制和ASCII格式）
const parsePGM = async (arrayBuffer: ArrayBuffer): Promise<ImageData | null> => {
    try {
        const view = new Uint8Array(arrayBuffer)
        const decoder = new TextDecoder('ascii', { fatal: false })

        // 查找文件开始位置（跳过可能的BOM或其他字符）
        let startPos = 0
        for (let i = 0; i < Math.min(100, view.length); i++) {
            if (view[i] === 0x50 && (view[i + 1] === 0x32 || view[i + 1] === 0x35)) {
                startPos = i
                break
            }
        }

        // 读取头部文本（最多读取500字节）
        let headerText = ''
        let headerEnd = startPos
        let newlineCount = 0

        for (let i = startPos; i < Math.min(startPos + 500, view.length); i++) {
            const char = view[i]
            headerText += String.fromCharCode(char)

            if (char === 0x0A) { // 换行符
                newlineCount++
                // 检查是否已经读取了3行（magic number, dimensions, max value）
                if (newlineCount >= 3) {
                    // 检查是否包含数字（表示max value行）
                    const lines = headerText.split('\n')
                    if (lines.length >= 3) {
                        const lastLine = lines[lines.length - 2].trim()
                        if (/^\d+$/.test(lastLine)) {
                            headerEnd = i + 1
                            break
                        }
                    }
                }
            }
        }

        // 解析头部
        const lines = headerText.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))

        if (lines.length < 3) {
            console.error('PGM头部解析失败，行数不足:', lines.length)
            console.error('头部文本:', headerText.substring(0, 200))
            throw new Error('无效的PGM文件头：行数不足')
        }

        const magic = lines[0]
        if (magic !== 'P2' && magic !== 'P5') {
            console.error('不支持的PGM格式:', magic)
            throw new Error(`不支持的PGM格式: ${magic}，仅支持P2和P5格式`)
        }

        const dimensions = lines[1].split(/\s+/).filter(s => s)
        if (dimensions.length < 2) {
            throw new Error('无效的PGM文件头：无法解析尺寸')
        }

        const width = parseInt(dimensions[0])
        const height = parseInt(dimensions[1])
        const maxVal = parseInt(lines[2])

        if (isNaN(width) || isNaN(height) || isNaN(maxVal)) {
            console.error('PGM头部数值解析失败:', { width, height, maxVal })
            throw new Error('无效的PGM文件头：无法解析数值')
        }

        if (width <= 0 || height <= 0 || maxVal <= 0) {
            throw new Error(`无效的PGM文件头：尺寸或最大值无效 (${width}x${height}, max=${maxVal})`)
        }


        // 创建ImageData
        const imageData = new ImageData(width, height)
        const data = imageData.data

        if (magic === 'P5') {
            // 二进制格式
            const dataStart = headerEnd
            const expectedDataSize = width * height

            if (dataStart + expectedDataSize > view.length) {
                console.error(`数据不足: 需要 ${expectedDataSize} 字节，但只有 ${view.length - dataStart} 字节`)
                throw new Error('PGM文件数据不完整')
            }

            for (let i = 0; i < expectedDataSize; i++) {
                const pixel = view[dataStart + i]
                const gray = pixel
                const idx = i * 4
                data[idx] = gray
                data[idx + 1] = gray
                data[idx + 2] = gray
                data[idx + 3] = 255
            }
        } else if (magic === 'P2') {
            // ASCII格式
            const text = decoder.decode(view.slice(headerEnd))
            const values = text.trim()
                .split(/\s+/)
                .filter(s => s)
                .map(v => parseInt(v))
                .filter(v => !isNaN(v))

            const expectedCount = width * height
            if (values.length < expectedCount) {
                console.warn(`ASCII数据不足: 需要 ${expectedCount} 个值，但只有 ${values.length} 个`)
            }

            for (let i = 0; i < expectedCount && i < values.length; i++) {
                const gray = Math.min(255, Math.max(0, values[i]))
                const idx = i * 4
                data[idx] = gray
                data[idx + 1] = gray
                data[idx + 2] = gray
                data[idx + 3] = 255
            }
        }

        return imageData
    } catch (error) {
        console.error('解析PGM文件失败:', error)
        return null
    }
}

// 加载地图用于编辑
const loadMapForEdit = async (mapPath: string) => {
    if (!mapPath) {
        ElMessage.warning('请选择地图文件')
        return
    }

    try {
        editing.value = true
        mapLoaded.value = false

        // mapPath 已经是完整路径，例如：/maps/map_20251202_200629/map/go2.pgm
        // 直接使用它，或者确保路径正确
        let url = mapPath
        if (!url.startsWith('/')) {
            url = '/' + url
        }
        if (!url.startsWith('/maps/')) {
            url = '/maps/' + url
        }

        // 对路径的各个部分分别编码（而不是整体编码）
        const urlParts = url.split('/')
        const encodedParts = urlParts.map((part, index) => {
            // 第一个空字符串和 'maps' 不需要编码
            if (index <= 1) return part
            return encodeURIComponent(part)
        })
        url = encodedParts.join('/')

        // 如果是生产环境，添加 API_BASE_URL 前缀（如果 url 不包含 http）
        if (import.meta.env.PROD && !url.startsWith('http')) {
             // 注意：API_BASE_URL 包含 /api，但这里是静态文件 /maps
             // 如果后端将 /maps 映射到静态文件，我们需要确认路径
             // 假设后端 API_BASE_URL 的根路径也服务 /maps
             // 或者我们需要一个新的 STATIC_BASE_URL
             // 简单起见，假设 API_BASE_URL 去掉 /api 后是根路径
             const baseUrl = API_BASE_URL.replace(/\/api$/, '')
             url = `${baseUrl}${url}`
        }

        const response = await fetch(url)

        if (!response.ok) {
            const errorText = await response.text().catch(() => '')
            console.error('HTTP错误:', response.status, errorText)
            throw new Error(`无法加载地图文件: HTTP ${response.status} ${response.statusText}`)
        }

        // const contentType = response.headers.get('content-type')

        const arrayBuffer = await response.arrayBuffer()

        if (arrayBuffer.byteLength === 0) {
            throw new Error('地图文件为空')
        }

        const imageData = await parsePGM(arrayBuffer)

        if (!imageData) {
            throw new Error('解析地图文件失败，请检查文件格式是否正确')
        }

        // 加载 YAML 文件以获取分辨率和原点
        mapMeta.value = null
        labels.value = []
        if (selectedMapForEdit.value?.yamlPath) {
            try {
                // 构建 YAML 文件的 URL
                // yamlPath 可能是 "folder/map/file.yaml" 或 "/maps/folder/map/file.yaml"
                let yamlUrl = selectedMapForEdit.value.yamlPath
                if (!yamlUrl.startsWith('/')) {
                    yamlUrl = '/maps/' + yamlUrl
                } else if (!yamlUrl.startsWith('/maps/')) {
                    // 如果是以 / 开头但不是 /maps/，假设它是相对路径
                    yamlUrl = '/maps' + yamlUrl
                }
                
                if (import.meta.env.PROD && !yamlUrl.startsWith('http')) {
                     const baseUrl = API_BASE_URL.replace(/\/api$/, '')
                     yamlUrl = `${baseUrl}${yamlUrl}`
                }

                const yamlRes = await fetch(yamlUrl)
                if (yamlRes.ok) {
                    const yamlText = await yamlRes.text()
                    // 简单解析 YAML
                    const resolutionMatch = yamlText.match(/resolution:\s*([\d.]+)/)
                    const originMatch = yamlText.match(/origin:\s*\[([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)\]/)
                    
                    if (resolutionMatch && originMatch) {
                        mapMeta.value = {
                            resolution: parseFloat(resolutionMatch[1]),
                            origin: [
                                parseFloat(originMatch[1]),
                                parseFloat(originMatch[2]),
                                parseFloat(originMatch[3])
                            ]
                        }
                        console.log('地图元数据加载成功:', mapMeta.value)
                    }
                }
            } catch (e) {
                console.warn('加载 YAML 失败:', e)
            }
        }

        // 尝试加载现有的 text.json
        try {
            // folderName 已经在 selectedMapForEdit 中
            if (selectedMapForEdit.value) {
                const textJsonUrl = `/maps/${selectedMapForEdit.value.folderName}/queue/text.json?t=${Date.now()}`
                const textRes = await fetch(textJsonUrl)
                if (textRes.ok) {
                    const textData = await textRes.json()
                    if (Array.isArray(textData)) {
                        labels.value = textData
                        console.log('加载现有标签:', labels.value)
                    }
                }
            }
        } catch (e) {
            // 忽略错误，可能文件不存在
        }

        // 等待DOM更新，确保画布元素已渲染
        await nextTick()
        // 再等待一帧，确保画布已完全渲染
        await new Promise(resolve => requestAnimationFrame(resolve))

        // 如果画布还不存在，再等待一下
        if (!mapCanvasRef.value) {
            await new Promise(resolve => setTimeout(resolve, 100))
        }

        if (!mapCanvasRef.value) {
            throw new Error('画布未初始化，请稍后重试')
        }

        const canvas = mapCanvasRef.value
        // 设置画布的实际像素尺寸
        canvas.width = imageData.width
        canvas.height = imageData.height

        // 根据容器大小计算合适的显示尺寸
        const container = canvas.parentElement
        if (container) {
            const containerWidth = container.clientWidth - 20 // 减去padding
            const containerHeight = container.clientHeight - 20

            // 计算缩放比例，使地图能够完整显示在容器内
            const scaleX = containerWidth / imageData.width
            const scaleY = containerHeight / imageData.height
            const scale = Math.min(scaleX, scaleY, 1.0) // 不超过100%

            // 设置画布的显示尺寸（CSS）
            canvas.style.width = `${imageData.width * scale}px`
            canvas.style.height = `${imageData.height * scale}px`
            zoomLevel.value = scale
        } else {
            // 如果没有容器，使用原始尺寸
            canvas.style.width = `${imageData.width}px`
            canvas.style.height = `${imageData.height}px`
            zoomLevel.value = 1.0
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
            throw new Error('无法获取画布上下文')
        }

        ctx.putImageData(imageData, 0, 0)
        
        // 保存原始图像数据，用于重绘
        originalImageData = imageData
        
        // 绘制标签
        if (labels.value.length > 0) {
            redrawCanvas()
        }

        mapLoaded.value = true
        // 重置拖动偏移量
        panOffset.value = { x: 0, y: 0 }
        ElMessage.success(`地图加载成功: ${imageData.width}x${imageData.height}`)
    } catch (error) {
        console.error('加载地图失败:', error)
        const errorMessage = error instanceof Error ? error.message : '未知错误'
        ElMessage.error(`加载地图失败: ${errorMessage}`)
    } finally {
        editing.value = false
    }
}

// 触发文件输入
// const triggerFileInput = () => {
//     fileInputRef.value?.click()
// }

// 处理文件选择
// const handleFileSelect = async (event: Event) => {
//     const target = event.target as HTMLInputElement
//     const file = target.files?.[0]
//     if (!file) return

//     if (!file.name.endsWith('.pgm')) {
//         ElMessage.warning('请选择 .pgm 格式的地图文件')
//         return
//     }

//     try {
//         editing.value = true
//         selectedMapFile.value = file.name

//         const arrayBuffer = await file.arrayBuffer()
//         const imageData = await parsePGM(arrayBuffer)

//         if (!imageData || !mapCanvasRef.value) {
//             throw new Error('解析地图文件失败')
//         }

//         const canvas = mapCanvasRef.value
//         canvas.width = imageData.width
//         canvas.height = imageData.height

//         const ctx = canvas.getContext('2d', { willReadFrequently: true })
//         if (ctx) {
//             ctx.putImageData(imageData, 0, 0)
//             mapLoaded.value = true
//             ElMessage.success('地图加载成功')
//         }
//     } catch (error) {
//         console.error('加载文件失败:', error)
//         ElMessage.error('加载文件失败: ' + (error instanceof Error ? error.message : '未知错误'))
//     } finally {
//         editing.value = false
//     }
// }

// 设置工具
const setTool = (tool: 'brush' | 'rectangle' | 'eraser' | 'label') => {
    currentTool.value = tool
}

// 缩放功能
const zoomIn = () => {
    if (!mapCanvasRef.value || !mapLoaded.value) return
    zoomLevel.value = Math.min(zoomLevel.value * 1.2, 5.0) // 最大5倍
    updateCanvasZoom()
}

const zoomOut = () => {
    if (!mapCanvasRef.value || !mapLoaded.value) return
    zoomLevel.value = Math.max(zoomLevel.value / 1.2, 0.1) // 最小0.1倍
    updateCanvasZoom()
}

const resetZoom = () => {
    if (!mapCanvasRef.value || !mapLoaded.value) return
    const container = mapCanvasRef.value.parentElement
    if (container && mapCanvasRef.value) {
        const containerWidth = container.clientWidth - 20
        const containerHeight = container.clientHeight - 20
        const scaleX = containerWidth / mapCanvasRef.value.width
        const scaleY = containerHeight / mapCanvasRef.value.height
        zoomLevel.value = Math.min(scaleX, scaleY, 1.0)
        updateCanvasZoom()
    }
}

const updateCanvasZoom = () => {
    if (!mapCanvasRef.value) return
    const canvas = mapCanvasRef.value
    canvas.style.width = `${canvas.width * zoomLevel.value}px`
    canvas.style.height = `${canvas.height * zoomLevel.value}px`
}

// 获取画布坐标（考虑缩放）
const getCanvasCoordinates = (event: MouseEvent): { x: number; y: number } | null => {
    if (!mapCanvasRef.value) return null

    const canvas = mapCanvasRef.value
    const rect = canvas.getBoundingClientRect()

    // 获取鼠标在画布显示区域内的相对位置（CSS坐标）
    const cssX = event.clientX - rect.left
    const cssY = event.clientY - rect.top

    // 获取画布的实际像素尺寸和CSS显示尺寸
    const actualWidth = canvas.width
    const actualHeight = canvas.height
    const displayWidth = rect.width
    const displayHeight = rect.height

    // 计算缩放比例
    const scaleX = actualWidth / displayWidth
    const scaleY = actualHeight / displayHeight

    // 将CSS坐标转换为画布的实际像素坐标
    const pixelX = Math.floor(cssX * scaleX)
    const pixelY = Math.floor(cssY * scaleY)

    // 确保坐标在画布范围内
    const x = Math.max(0, Math.min(pixelX, actualWidth - 1))
    const y = Math.max(0, Math.min(pixelY, actualHeight - 1))

    return { x, y }
}

// 鼠标按下（左键）
const handleMouseDown = (event: MouseEvent) => {
    if (!mapCanvasRef.value) return
    // 如果是右键，不处理
    if (event.button === 2) return

    const coords = getCanvasCoordinates(event)
    if (!coords) return

    // 保存当前状态（用于撤销）
    saveCanvasState()

    isDrawing.value = true
    startX.value = coords.x
    startY.value = coords.y
    lastX.value = coords.x
    lastY.value = coords.y

    if (currentTool.value === 'rectangle') {
        isSelecting.value = true
    } else if (currentTool.value === 'label') {
        // 处理标签添加
        if (!mapMeta.value) {
            ElMessage.warning('无法获取地图元数据（分辨率和原点），无法添加标签')
            return
        }
        
        // 计算世界坐标
        const resolution = mapMeta.value.resolution
        const origin = mapMeta.value.origin
        const height = mapCanvasRef.value.height
        
        // origin 对应的是图片的左下角
        // PGM 图片坐标系 (0,0) 在左上角
        // 所以计算 Y 轴时需要翻转：(height - 1 - y)
        const worldX = origin[0] + (coords.x * resolution)
        const worldY = origin[1] + ((height - 1 - coords.y) * resolution)
        
        ElMessageBox.prompt('请输入标签名称', '添加标签', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            inputPattern: /\S+/,
            inputErrorMessage: '标签名称不能为空'
        }).then(({ value }) => {
            if (value) {
                labels.value.push({
                    name: value,
                    x: Number(worldX.toFixed(3)),
                    y: Number(worldY.toFixed(3))
                })
                redrawCanvas()
                ElMessage.success(`已添加标签: ${value}`)
            }
        }).catch(() => {})
        
    } else {
        drawAt(coords.x, coords.y)
    }
}

// 右键按下（用于拖动）
const handleRightMouseDown = (event: MouseEvent) => {
    if (!mapCanvasRef.value || !mapLoaded.value) return
    if (event.button !== 2) return

    event.preventDefault()
    isPanning.value = true
    panStartX.value = event.clientX
    panStartY.value = event.clientY
}

// 阻止右键菜单
const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault()
}

// 鼠标移动
const handleMouseMove = (event: MouseEvent) => {
    // 处理右键拖动
    if (isPanning.value) {
        const deltaX = event.clientX - panStartX.value
        const deltaY = event.clientY - panStartY.value
        panOffset.value.x += deltaX
        panOffset.value.y += deltaY
        panStartX.value = event.clientX
        panStartY.value = event.clientY
        return
    }

    // 处理左键绘制
    if (!isDrawing.value || !mapCanvasRef.value) return

    const coords = getCanvasCoordinates(event)
    if (!coords) return

    if (currentTool.value === 'rectangle') {
        // 框选：绘制预览矩形
        redrawCanvas()
        const ctx = mapCanvasRef.value.getContext('2d', { willReadFrequently: true })
        if (ctx) {
            ctx.strokeStyle = '#409EFF'
            ctx.lineWidth = 2
            ctx.setLineDash([5, 5])
            ctx.strokeRect(
                startX.value,
                startY.value,
                coords.x - startX.value,
                coords.y - startY.value
            )
            ctx.setLineDash([])
        }
    } else {
        // 画笔或橡皮擦：连续绘制
        drawLine(lastX.value, lastY.value, coords.x, coords.y)
        lastX.value = coords.x
        lastY.value = coords.y
    }
}

// 鼠标释放
const handleMouseUp = (event: MouseEvent) => {
    // 处理右键拖动结束
    if (isPanning.value) {
        isPanning.value = false
        return
    }

    // 处理左键绘制结束
    if (!isDrawing.value || !mapCanvasRef.value) return

    const coords = getCanvasCoordinates(event)

    if (currentTool.value === 'rectangle' && isSelecting.value && coords) {
        // 框选完成：填充矩形区域
        fillRectangle(startX.value, startY.value, coords.x, coords.y)
        isSelecting.value = false
    }

    isDrawing.value = false
}

// 在指定位置绘制
const drawAt = (x: number, y: number) => {
    if (!mapCanvasRef.value) return

    const ctx = mapCanvasRef.value.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    ctx.save()

    if (currentTool.value === 'brush') {
        ctx.fillStyle = '#000000'
        ctx.beginPath()
        ctx.arc(x, y, brushSize.value / 2, 0, Math.PI * 2)
        ctx.fill()
    } else if (currentTool.value === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.beginPath()
        ctx.arc(x, y, brushSize.value / 2, 0, Math.PI * 2)
        ctx.fill()
    }

    ctx.restore()
}

// 绘制线条
const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    if (!mapCanvasRef.value) return

    const ctx = mapCanvasRef.value.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    ctx.save()

    if (currentTool.value === 'brush') {
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = brushSize.value
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
    } else if (currentTool.value === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0,0,0,1)'
        ctx.lineWidth = brushSize.value
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
    }

    ctx.restore()
}

// 填充矩形区域
const fillRectangle = (x1: number, y1: number, x2: number, y2: number) => {
    if (!mapCanvasRef.value) return

    const ctx = mapCanvasRef.value.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const x = Math.min(x1, x2)
    const y = Math.min(y1, y2)
    const w = Math.abs(x2 - x1)
    const h = Math.abs(y2 - y1)

    ctx.save()

    if (currentTool.value === 'rectangle') {
        ctx.fillStyle = '#000000'
        ctx.fillRect(x, y, w, h)
    }

    ctx.restore()
}

// 重绘画布（用于框选预览）
let originalImageData: ImageData | null = null

const saveCanvasState = () => {
    if (!mapCanvasRef.value) return
    const ctx = mapCanvasRef.value.getContext('2d', { willReadFrequently: true })
    if (ctx) {
        originalImageData = ctx.getImageData(0, 0, mapCanvasRef.value.width, mapCanvasRef.value.height)
    }
}

const redrawCanvas = () => {
    if (!mapCanvasRef.value || !originalImageData) {
        saveCanvasState()
        return
    }

    const ctx = mapCanvasRef.value.getContext('2d', { willReadFrequently: true })
    if (ctx) {
        ctx.putImageData(originalImageData, 0, 0)
        
        // 绘制标签
        if (labels.value.length > 0 && mapMeta.value) {
            const resolution = mapMeta.value.resolution
            const origin = mapMeta.value.origin
            const height = mapCanvasRef.value.height
            
            ctx.save()
            ctx.font = 'bold 16px Arial'
            ctx.fillStyle = '#F56C6C' // Element Plus Danger Color
            ctx.strokeStyle = 'white'
            ctx.lineWidth = 3
            ctx.textAlign = 'center'
            ctx.textBaseline = 'bottom'
            
            labels.value.forEach(label => {
                // 世界坐标转像素坐标
                const pixelX = (label.x - origin[0]) / resolution
                const pixelY = height - 1 - (label.y - origin[1]) / resolution
                
                // 绘制点
                ctx.beginPath()
                ctx.arc(pixelX, pixelY, 4, 0, 2 * Math.PI)
                ctx.fill()
                ctx.stroke()
                
                // 绘制文字描边
                ctx.strokeText(label.name, pixelX, pixelY - 8)
                // 绘制文字
                ctx.fillText(label.name, pixelX, pixelY - 8)
            })
            ctx.restore()
        }
    }
}

// 在开始绘制时保存状态（已合并到handleMouseDown中）
const handleMouseDownWithSave = handleMouseDown

// 撤销操作
const undoLastAction = () => {
    if (originalImageData && mapCanvasRef.value) {
        const ctx = mapCanvasRef.value.getContext('2d', { willReadFrequently: true })
        if (ctx) {
            ctx.putImageData(originalImageData, 0, 0)
            saveCanvasState()
        }
    }
}

// 清空地图
const clearMap = () => {
    if (!mapCanvasRef.value) return

    const canvas = mapCanvasRef.value
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
        saveCanvasState()
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
}

// 反转颜色
const invertMap = () => {
    if (!mapCanvasRef.value) return

    const canvas = mapCanvasRef.value
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    saveCanvasState()
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
        const gray = data[i]
        const inverted = 255 - gray
        data[i] = inverted
        data[i + 1] = inverted
        data[i + 2] = inverted
    }

    ctx.putImageData(imageData, 0, 0)
}

// 处理保存对话框打开
const handleSaveDialogOpen = () => {
    // 重置保存模式为覆盖原图
    saveMode.value = 'overwrite'
    // 重置表单
    saveMapNameForm.value.name = ''
    saveMapNameForm.value.description = ''
    // 如果选择了地图，初始化表单（为"保存为新文件"模式准备）
    if (selectedMapForEdit.value) {
        saveMapNameForm.value.name = `${selectedMapForEdit.value.displayName}_副本`
        saveMapNameForm.value.description = selectedMapForEdit.value.config?.description || ''
    } else {
        saveMapNameForm.value.name = '新地图'
        saveMapNameForm.value.description = ''
    }
}

// 处理保存模式变化
const handleSaveModeChange = () => {
    if (saveMode.value === 'new') {
        // 生成默认地图名称（基于原地图名称）
        if (selectedMapForEdit.value) {
            saveMapNameForm.value.name = `${selectedMapForEdit.value.displayName}_副本`
            saveMapNameForm.value.description = selectedMapForEdit.value.config?.description || ''
        } else {
            saveMapNameForm.value.name = '新地图'
            saveMapNameForm.value.description = ''
        }
    }
}

// 确认保存地图
const confirmSaveMap = async () => {
    if (saveMode.value === 'new' && !saveMapNameForm.value.name.trim()) {
        ElMessage.warning('请输入地图名称')
        return
    }

    await saveMap()
}

// 保存地图为PGM格式
const saveMap = async () => {
    if (!mapCanvasRef.value) return

    try {
        saving.value = true

        const canvas = mapCanvasRef.value
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
            ElMessage.error('无法获取画布上下文')
            return
        }

        // 获取图像数据
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data

        // 创建PGM文件内容（P5二进制格式）
        const width = canvas.width
        const height = canvas.height
        const maxVal = 255

        // PGM头部
        const header = `P5\n${width} ${height}\n${maxVal}\n`
        const headerBytes = new TextEncoder().encode(header)

        // 提取灰度值（取R通道，因为灰度图R=G=B）
        const grayData = new Uint8Array(width * height)
        for (let i = 0; i < width * height; i++) {
            grayData[i] = data[i * 4] // 取R通道
        }

        // 合并头部和数据
        const pgmData = new Uint8Array(headerBytes.length + grayData.length)
        pgmData.set(headerBytes, 0)
        pgmData.set(grayData, headerBytes.length)

        if (saveMode.value === 'overwrite') {
            // 覆盖模式：直接保存到原文件
            if (!selectedMapForEdit.value || !selectedMapForEdit.value.mapPath) {
                ElMessage.warning('无法覆盖：未选择原文件')
                return
            }
            // 从mapPath中提取文件名（例如：/maps/folderName/map/file.pgm -> file.pgm）
            const pathParts = selectedMapForEdit.value.mapPath.split('/')
            const fileName = pathParts[pathParts.length - 1]
            const targetFolder = selectedMapForEdit.value.folderName

        // 创建FormData上传到服务器
        const blob = new Blob([pgmData], { type: 'image/x-portable-graymap' })
        const formData = new FormData()
        formData.append('files', blob, fileName)
        formData.append('folderName', targetFolder)

        // 保存标签文件 text.json
        // 即使标签为空，也要保存空数组，以覆盖原有的标签文件
        const textJsonContent = JSON.stringify(labels.value, null, 2)
        const textBlob = new Blob([textJsonContent], { type: 'application/json' })
        formData.append('files', textBlob, 'queue/text.json')

        // 覆盖模式下，mapName 必填，使用当前地图名称
        formData.append('mapName', selectedMapForEdit.value.displayName || 'Updated Map')

        // 上传到服务器
        const response = await fetch(`${API_BASE_URL}/maps/save`, {
            method: 'POST',
            body: formData
        })

        if (!response.ok) {
                throw new Error('保存失败')
            }

            ElMessage.success(`地图已保存到 /maps/${targetFolder}/map/${fileName}`)
            await fetchAvailableMaps()
        } else {
            // 保存为新文件：创建新地图文件夹并复制其他文件
            if (!selectedMapForEdit.value) {
                ElMessage.warning('未选择原地图')
                return
            }

            const mapName = saveMapNameForm.value.name.trim()
            const description = saveMapNameForm.value.description.trim()

            // 显示进度对话框
            showUploadMapProgress.value = true
            uploadMapProgress.value = 0
            uploadMapStatusText.value = '准备保存...'
            showSaveDialog.value = false

            try {
                // 生成新文件夹名称（使用当前时间）
                const now = new Date()
                const year = now.getFullYear()
                const month = String(now.getMonth() + 1).padStart(2, '0')
                const day = String(now.getDate()).padStart(2, '0')
                const hours = String(now.getHours()).padStart(2, '0')
                const minutes = String(now.getMinutes()).padStart(2, '0')
                const seconds = String(now.getSeconds()).padStart(2, '0')
                const newFolderName = `map_${year}${month}${day}_${hours}${minutes}${seconds}`

                // 获取原地图文件夹下的所有文件（带超时）
                uploadMapStatusText.value = '正在获取文件列表...'
                uploadMapProgress.value = 5
                
                const filesToCopy: Array<{ path: string; targetPath: string }> = []
                const sourceFolder = selectedMapForEdit.value.folderName

                try {
                    // 1. 获取 map 目录下的文件
                    const mapRes = await fetch(`${API_BASE_URL}/maps/files?folder=${encodeURIComponent(sourceFolder)}&subDir=map`)
                    if (mapRes.ok) {
                        const mapData = await mapRes.json()
                        if (mapData.success && mapData.files) {
                            mapData.files.forEach((f: any) => {
                                // 跳过 .pgm 文件，因为我们会上传新的
                                if (!f.name.endsWith('.pgm')) {
                                    filesToCopy.push({
                                        path: `${sourceFolder}/map/${f.name}`,
                                        targetPath: `map/${f.name}`
                                    })
                                }
                            })
                        }
                    }

                    // 2. 获取 queue 目录下的文件
                    const queueRes = await fetch(`${API_BASE_URL}/maps/files?folder=${encodeURIComponent(sourceFolder)}&subDir=queue`)
                    if (queueRes.ok) {
                        const queueData = await queueRes.json()
                        if (queueData.success && queueData.files) {
                            queueData.files.forEach((f: any) => {
                                // 始终不复制旧的 text.json，因为我们会生成新的（即使是空的）
                                if (f.name === 'text.json') {
                                    return
                                }
                                filesToCopy.push({
                                    path: `${sourceFolder}/queue/${f.name}`,
                                    targetPath: `queue/${f.name}`
                                })
                            })
                        }
                    }
                } catch (error) {
                    console.warn('获取文件列表失败:', error)
                    ElMessage.warning('获取部分文件失败，可能导致新地图文件不完整')
                }

                // 从原mapPath中提取原pgm文件名
                const originalPathParts = selectedMapForEdit.value.mapPath.split('/')
                const originalPgmName = originalPathParts[originalPathParts.length - 1]

                // 创建FormData，包含新pgm文件和其他需要复制的文件
                const formData = new FormData()
                formData.append('folderName', newFolderName)
                formData.append('mapName', mapName)
                formData.append('description', description)

                // 添加新的pgm文件
                const blob = new Blob([pgmData], { type: 'image/x-portable-graymap' })
                // 使用原文件名（如果原文件名存在），否则使用默认名称
                const newPgmName = originalPgmName || 'map.pgm'
                formData.append('files', blob, `map/${newPgmName}`)

                // 保存标签文件 text.json
                // 即使标签为空，也要保存空数组
                const textJsonContent = JSON.stringify(labels.value, null, 2)
                const textBlob = new Blob([textJsonContent], { type: 'application/json' })
                formData.append('files', textBlob, 'queue/text.json')
                
                formData.append('filesToCopy', JSON.stringify(filesToCopy))

                // 准备文件路径信息（所有文件都由服务器端复制）
                uploadMapStatusText.value = '正在准备文件列表...'
                uploadMapProgress.value = 50

                // 上传到服务器（使用 XMLHttpRequest 以支持进度和超时）
                
                // 内存优化：估算FormData总大小
                let totalFormDataSize = pgmData.length // PGM文件大小
                // 注意：FormData.entries()在某些浏览器中可能不可用，使用try-catch
                try {
                    for (const [, value] of formData.entries()) {
                        if (value && typeof value === 'object' && 'size' in value) {
                            // 检查是否是Blob或File类型
                            const blobLike = value as Blob | File
                            if (blobLike.size !== undefined) {
                                totalFormDataSize += blobLike.size
                            }
                        } else if (typeof value === 'string') {
                            totalFormDataSize += new TextEncoder().encode(value).length
                        }
                    }
                } catch (e) {
                    // 某些浏览器可能不支持FormData.entries()，忽略
                    console.warn('无法计算FormData大小:', e)
                }
                const totalSizeMB = totalFormDataSize / 1024 / 1024
                
                uploadMapStatusText.value = totalSizeMB > 100 
                    ? `正在从本地文件上传大文件包到服务器... (${totalSizeMB.toFixed(1)} MB)`
                    : '正在从本地文件上传到服务器...'
                uploadMapProgress.value = 50
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest()
                    
                    // 设置超时（30分钟，防止网络缓慢时误判为失败）
                    const timeout = setTimeout(() => {
                        xhr.abort()
                        reject(new Error('上传超时（30分钟），请检查网络连接后重试'))
                    }, 30 * 60 * 1000)

                    // 监听上传进度
                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) {
                            // 上传进度占 50% - 95%
                            const uploadProgress = (e.loaded / e.total) * 100
                            uploadMapProgress.value = 50 + Math.round((uploadProgress / 100) * 45)
                            uploadMapStatusText.value = `正在从本地文件上传到服务器... ${Math.round(uploadProgress)}%`
                            // 如果上传完成，立即更新状态
                            if (e.loaded >= e.total) {
                                uploadMapProgress.value = 95
                                uploadMapStatusText.value = '本地文件上传到服务器完成，等待服务器响应...'
                            }
                        }
                    })

                    xhr.addEventListener('load', () => {
                        clearTimeout(timeout)
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                const result = JSON.parse(xhr.responseText)
                                if (result.success) {
                                    uploadMapProgress.value = 100
                                    uploadMapStatusText.value = '本地文件上传到服务器完成，等待服务器处理文件...'
                                    
                                    // 计算上传的文件总大小，用于确定等待时间
                                    let totalFileSize = pgmData.length // PGM文件大小
                                    try {
                                        for (const [, value] of formData.entries()) {
                                            if (value && typeof value === 'object' && 'size' in value) {
                                                const blobLike = value as Blob | File
                                                if (blobLike.size !== undefined) {
                                                    totalFileSize += blobLike.size
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        // 忽略错误
                                    }
                                    
                                    const totalSizeMB = totalFileSize / 1024 / 1024
                                    // 对于大文件，需要等待服务器处理完成
                                    // 根据文件大小动态调整等待时间：>100MB: 10秒, >50MB: 5秒, 其他: 2秒
                                    const waitTime = totalSizeMB > 100 ? 10000 : totalSizeMB > 50 ? 5000 : 2000
                                    
                                    // 等待服务器处理大文件
                                    setTimeout(async () => {
                                        try {
                                            uploadMapStatusText.value = '正在刷新地图列表...'
                                            // 刷新地图列表，添加重试机制
                                            let retries = 3
                                            let success = false
                                            
                                            while (retries > 0 && !success) {
                                                try {
                                                    await fetchAvailableMaps()
                                                    success = true
                                                } catch (error) {
                                                    retries--
                                                    if (retries > 0) {
                                                        console.warn(`刷新地图列表失败，${retries}次重试剩余...`, error)
                                                        uploadMapStatusText.value = `刷新地图列表失败，正在重试... (剩余${retries}次)`
                                                        await new Promise(resolve => setTimeout(resolve, 2000))
                                                    } else {
                                                        console.error('刷新地图列表失败，已用完重试次数', error)
                                                        // 即使刷新失败，也认为保存成功
                                                        ElMessage.warning('地图保存成功，但刷新地图列表失败，请手动刷新')
                                                    }
                                                }
                                            }
                                            
                                            uploadMapStatusText.value = '保存完成'
                                            resolve()
                                        } catch (error) {
                                            // 即使刷新失败，也认为保存成功
                                            ElMessage.warning('地图保存成功，但刷新地图列表失败，请手动刷新')
                                            resolve() // 不拒绝，因为保存本身是成功的
                                        }
                                    }, waitTime)
                                } else {
                                    reject(new Error(result.error || '保存失败'))
                                }
                            } catch (error) {
                                // 即使解析失败，也认为成功（可能是空响应）
                                uploadMapProgress.value = 100
                                uploadMapStatusText.value = '保存完成'
                                resolve()
                            }
                        } else {
                            let errorMsg = `HTTP ${xhr.status}: ${xhr.statusText}`
                            // 为常见的服务器错误提供更友好的提示
                            if (xhr.status === 502) {
                                errorMsg = '服务器网关错误 (502)，可能是后端服务未启动或无法连接。请检查服务器状态。'
                            } else if (xhr.status === 503) {
                                errorMsg = '服务暂时不可用 (503)，请稍后重试。'
                            } else if (xhr.status === 504) {
                                errorMsg = '网关超时 (504)，服务器响应时间过长。请检查网络连接。'
                            } else if (xhr.status >= 500) {
                                errorMsg = `服务器错误 (${xhr.status})，请稍后重试或联系管理员。`
                            }
                            try {
                                const errorResult = JSON.parse(xhr.responseText)
                                if (errorResult.error) {
                                    errorMsg = errorResult.error
                                }
                            } catch (e) {
                                // 忽略解析错误，使用上面的默认错误消息
                            }
                            reject(new Error(errorMsg))
                        }
                    })

                    xhr.addEventListener('error', () => {
                        clearTimeout(timeout)
                        reject(new Error('网络错误，请检查网络连接'))
                    })

                    xhr.addEventListener('abort', () => {
                        clearTimeout(timeout)
                        reject(new Error('上传已取消'))
                    })

                    xhr.open('POST', `${API_BASE_URL}/maps/save-new-map`)
                    xhr.send(formData)
                })

                ElMessage.success(`新地图已创建: ${mapName}`)
                await fetchAvailableMaps()
                showUploadMapProgress.value = false
            } catch (error) {
                // 错误已在 Promise 中处理，这里只需要关闭对话框
                showUploadMapProgress.value = false
                throw error // 重新抛出错误，让外层 catch 处理
            }
        }

        showSaveDialog.value = false
    } catch (error) {
        console.error('保存地图失败:', error)
        ElMessage.error('保存地图失败: ' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
        saving.value = false
    }
}

// 组件挂载时获取地图列表
onMounted(() => {
    fetchAvailableMaps()
})

// 组件卸载时清理订阅
onUnmounted(() => {
    unsubscribeUploadTopic()
})
</script>

<style scoped>
.map-tools-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.tools-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.button-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.tool-button {
    width: 100% !important;
    justify-content: flex-start !important;
    text-align: left;
}

/* 确保所有按钮（包括disabled状态）都有相同的padding */
.tool-button,
.tool-button.is-disabled {
    padding-left: 20px !important;
    padding-right: 20px !important;
}

.tool-button :deep(.el-button__content) {
    justify-content: flex-start !important;
    width: 100% !important;
    margin-left: 0 !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    display: flex !important;
    align-items: center !important;
}

/* 确保disabled状态下的内容也对齐 */
.tool-button.is-disabled :deep(.el-button__content) {
    justify-content: flex-start !important;
    margin-left: 0 !important;
    padding-left: 0 !important;
}

.tool-button :deep(.el-icon) {
    margin-right: 8px !important;
    margin-left: 0 !important;
    flex-shrink: 0;
    order: 1;
}

/* 确保disabled状态下的图标也对齐 */
.tool-button.is-disabled :deep(.el-icon) {
    margin-right: 8px !important;
    margin-left: 0 !important;
}

.tool-button :deep(span) {
    text-align: left !important;
    margin-left: 0 !important;
    order: 2;
}

/* 确保disabled状态下的文字也对齐 */
.tool-button.is-disabled :deep(span) {
    text-align: left !important;
    margin-left: 0 !important;
}

.current-map-info {
    margin-top: 12px;
    padding: 8px 12px;
    background-color: #f5f5f5;
    border-radius: 4px;
    font-size: 12px;
}

.current-map-info .label {
    color: #666;
    margin-right: 8px;
}

.current-map-info .value {
    color: #333;
    font-weight: 500;
}

.map-selector-content {
    padding: 10px 0;
}

.map-list {
    max-height: 400px;
    overflow-y: auto;
}

.map-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    margin-bottom: 12px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.map-item:hover {
    background-color: #f5f5f5;
    border-color: #409EFF;
    box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.map-item.active {
    background-color: #ecf5ff;
    border-color: #409EFF;
    box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.map-item-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}

.map-item-content {
    display: flex;
    align-items: center;
    flex: 1;
    gap: 12px;
}

.map-item .map-icon {
    font-size: 24px;
    color: #409EFF;
    flex-shrink: 0;
}

.map-item .map-info {
    flex: 1;
    min-width: 0;
}

.map-item .map-name {
    font-size: 14px;
    font-weight: 500;
    color: #333;
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.map-item .map-meta {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: #666;
}

.map-item .meta-item {
    white-space: nowrap;
}

.map-item .check-icon {
    margin-left: 12px;
    color: #67c23a;
    font-size: 20px;
    flex-shrink: 0;
}

.empty-maps {
    text-align: center;
    padding: 60px 40px;
    color: #999;
}

.empty-maps .el-icon {
    margin-bottom: 16px;
}

.empty-maps p {
    margin: 8px 0;
    font-size: 14px;
}

.empty-maps .empty-hint {
    font-size: 12px;
    color: #bbb;
    margin-top: 12px;
    line-height: 1.6;
}

/* 对话框标题样式 */
.dialog-header {
    display: flex;
    align-items: center;
    gap: 8px;
}

.dialog-header .refresh-btn {
    color: #333;
    background-color: transparent;
    border: none;
}

.dialog-header .refresh-btn .el-icon {
    background-color: #fff;
    border-radius: 50%;
    padding: 5px;
}

.dialog-header .refresh-btn:hover {
    background-color: transparent;
}

.dialog-header .refresh-btn:hover .el-icon {
    background-color: #f0f0f0;
}

/* 上传进度对话框样式 */
.upload-progress-content {
    padding: 20px 0;
}

.progress-info {
    margin-bottom: 20px;
}

.progress-text {
    font-size: 16px;
    font-weight: 500;
    color: #333;
    margin-bottom: 8px;
}

.progress-details {
    font-size: 14px;
    color: #666;
}

.progress-stats {
    display: flex;
    justify-content: space-around;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #f0f0f0;
}

.stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.stat-label {
    font-size: 12px;
    color: #999;
    margin-bottom: 4px;
}

.stat-value {
    font-size: 18px;
    font-weight: 600;
    color: #409eff;
}

.map-editor-dialog {
    max-width: 95vw;
}

.map-editor-dialog :deep(.el-dialog) {
    height: 96vh;
    max-height: 96vh;
    display: flex;
    flex-direction: column;
}

.map-editor-dialog :deep(.el-dialog__header) {
    flex-shrink: 0;
    padding: 20px;
}

.map-editor-dialog :deep(.el-dialog__body) {
    padding: 20px;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.map-editor-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
    min-height: 0;
}

.editor-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
}

.toolbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
}

.toolbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
}

.map-canvas-container {
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
    flex: 1;
    min-height: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: #f5f5f5;
    background-image:
        linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
        linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
        linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
    background-size: 20px 20px;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
    padding: 20px;
    position: relative;
}

.canvas-wrapper {
    position: relative;
    display: inline-block;
    transition: none;
}

.map-canvas-container canvas {
    cursor: crosshair;
    background-color: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    display: block;
    user-select: none;
    /* 不限制画布尺寸，让它显示完整 */
}

.map-canvas-container canvas:hover {
    cursor: crosshair;
}

.map-canvas-container:has(canvas:hover) {
    cursor: crosshair;
}

.empty-editor {
    text-align: center;
    padding: 60px;
    color: #999;
    border: 1px dashed #e0e0e0;
    border-radius: 4px;
}

.save-dialog-content {
    padding: 10px 0;
}

/* 建图确认对话框样式 */
.mapping-confirm-content {
    padding: 10px 0;
}

.mapping-notices {
    margin-top: 20px;
}

.notice-item {
    display: flex;
    align-items: flex-start;
    margin-bottom: 16px;
    padding: 12px;
    background-color: #f9f9f9;
    border-radius: 4px;
    border-left: 3px solid #e6a23c;
}

.notice-item:last-child {
    margin-bottom: 0;
    border-left-color: #409eff;
}

.notice-icon {
    margin-right: 12px;
    margin-top: 2px;
    font-size: 18px;
    color: #e6a23c;
    flex-shrink: 0;
}

.notice-item:last-child .notice-icon {
    color: #409eff;
}

.notice-item span {
    flex: 1;
    line-height: 1.6;
    color: #333;
    font-size: 14px;
}

.notice-item strong {
    color: #303133;
}

/* 建图中状态样式 */
.mapping-status {
    padding: 10px 0;
}

.mapping-status-content {
    margin-top: 20px;
}

.status-info {
    display: flex;
    align-items: center;
    padding: 20px;
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    border-radius: 8px;
    margin-bottom: 20px;
}

.status-icon {
    font-size: 48px;
    color: #409eff;
    margin-right: 20px;
    animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {

    0%,
    100% {
        opacity: 1;
        transform: scale(1);
    }

    50% {
        opacity: 0.7;
        transform: scale(1.1);
    }
}

.status-text {
    flex: 1;
}

.status-title {
    font-size: 20px;
    font-weight: bold;
    color: #303133;
    margin-bottom: 8px;
}

.status-desc {
    font-size: 14px;
    color: #606266;
}

.status-tips {
    padding: 16px;
    background-color: #f0f9ff;
    border-radius: 4px;
    border-left: 3px solid #409eff;
}

.tip-item {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
    font-size: 14px;
    color: #606266;
}

.tip-item:last-child {
    margin-bottom: 0;
}

.tip-item .el-icon {
    margin-right: 8px;
    color: #409eff;
    font-size: 16px;
}

.save-dialog-content .el-radio-group {
    width: 100%;
}

.save-dialog-content .el-radio {
    display: block;
    margin-bottom: 12px;
}

.editor-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}

.map-switch-content {
    padding: 10px 0;
}
</style>