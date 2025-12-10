<template>
    <div class="file-manager-panel">
        <div class="file-manager-content">
            <!-- 路径导航 -->
            <div class="path-navigation">
                <el-input v-model="currentPath" placeholder="输入路径" @keyup.enter="navigateToPath">
                    <template #prepend>
                        <el-icon>
                            <Folder />
                        </el-icon>
                    </template>
                    <template #append>
                        <el-button :icon="Search" @click="navigateToPath" />
                    </template>
                </el-input>
                <div class="path-breadcrumb">
                    <el-breadcrumb separator="/">
                        <el-breadcrumb-item v-for="(part, index) in pathParts" :key="index">
                            <a @click="navigateToBreadcrumb(index)">{{ part || '/' }}</a>
                        </el-breadcrumb-item>
                    </el-breadcrumb>
                </div>
            </div>

            <!-- 工具栏 -->
            <div class="toolbar">
                <div class="toolbar-left">
                    <el-button-group>
                        <el-button :icon="Refresh" @click="refreshDirectory" :disabled="!isConnected || loading">
                            刷新
                        </el-button>
                        <el-button :icon="Upload" @click="showUploadDialog = true" :disabled="!isConnected">
                            上传
                        </el-button>
                        <el-button :icon="FolderAdd" @click="showCreateDirDialog = true" :disabled="!isConnected">
                            新建文件夹
                        </el-button>
                    </el-button-group>
                </div>
            </div>

            <!-- 文件列表 -->
            <div class="file-list-container">
                <el-scrollbar v-if="loading" class="loading-container">
                    <div class="loading-content">
                        <el-icon class="is-loading" :size="24">
                            <Loading />
                        </el-icon>
                        <span>加载中...</span>
                    </div>
                </el-scrollbar>
                <el-scrollbar v-else-if="files.length === 0" class="empty-container">
                    <div class="empty-content">
                        <el-icon :size="48" color="#ccc">
                            <FolderOpened />
                        </el-icon>
                        <p>目录为空</p>
                    </div>
                </el-scrollbar>
                <el-scrollbar v-else class="file-list">
                    <div class="file-item" v-for="item in files" :key="item.path"
                        :class="{ selected: selectedFiles.includes(item.path) }" @click="toggleSelect(item)"
                        @dblclick="handleItemDoubleClick(item)">
                        <el-icon class="file-icon" :size="24">
                            <Folder v-if="item.type === 'directory'" />
                            <Document v-else />
                        </el-icon>
                        <span class="file-name">{{ item.name }}</span>
                        <span v-if="item.type === 'file' && item.size" class="file-size">
                            {{ formatFileSize(item.size) }}
                        </span>
                        <div class="file-actions" @click.stop>
                            <el-button-group size="small">
                                <el-button :icon="Download" @click="handleDownload(item)" :disabled="item.type === 'directory'"
                                    title="下载" />
                                <el-button :icon="Delete" @click="handleDelete(item)" title="删除" />
                                <el-button :icon="CopyDocument" @click="handleCopy(item)" title="复制" />
                                <el-button :icon="Document" @click="handleMove(item)" title="移动" />
                            </el-button-group>
                        </div>
                    </div>
                </el-scrollbar>
            </div>
        </div>

        <!-- 上传对话框 -->
        <el-dialog v-model="showUploadDialog" title="上传文件" width="500px" :close-on-click-modal="false">
            <div class="upload-dialog-content">
                <el-upload ref="uploadRef" :auto-upload="false" :on-change="handleFileChange" :limit="1"
                    drag>
                    <el-icon class="el-icon--upload" :size="67">
                        <UploadFilled />
                    </el-icon>
                    <div class="el-upload__text">
                        将文件拖到此处，或<em>点击上传</em>
                    </div>
                    <template #tip>
                        <div class="el-upload__tip">
                            支持任意文件类型
                        </div>
                    </template>
                </el-upload>
                <div v-if="selectedFile" class="selected-file-info">
                    <el-icon>
                        <Document />
                    </el-icon>
                    <span>{{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})</span>
                </div>
                <el-input v-model="uploadDestinationPath" placeholder="目标目录路径" style="margin-top: 16px;">
                    <template #prepend>目标路径</template>
                </el-input>
            </div>
            <template #footer>
                <el-button @click="showUploadDialog = false">取消</el-button>
                <el-button type="primary" @click="handleUpload" :disabled="!selectedFile || uploading">
                    {{ uploading ? '上传中...' : '上传' }}
                </el-button>
            </template>
        </el-dialog>

        <!-- 创建目录对话框 -->
        <el-dialog v-model="showCreateDirDialog" title="新建文件夹" width="400px">
            <el-input v-model="newDirName" placeholder="输入文件夹名称" @keyup.enter="handleCreateDirectory">
                <template #prepend>名称</template>
            </el-input>
            <template #footer>
                <el-button @click="showCreateDirDialog = false">取消</el-button>
                <el-button type="primary" @click="handleCreateDirectory" :disabled="!newDirName.trim()">
                    创建
                </el-button>
            </template>
        </el-dialog>

        <!-- 移动/复制对话框 -->
        <el-dialog v-model="showMoveDialog" title="移动文件" width="400px">
            <el-input v-model="moveDestinationPath" placeholder="输入目标路径">
                <template #prepend>目标路径</template>
            </el-input>
            <template #footer>
                <el-button @click="showMoveDialog = false">取消</el-button>
                <el-button type="primary" @click="confirmMove" :disabled="!moveDestinationPath.trim()">
                    确定
                </el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElButton, ElButtonGroup, ElInput, ElIcon, ElMessage, ElMessageBox, ElDialog, ElScrollbar, ElBreadcrumb, ElBreadcrumbItem, ElUpload } from 'element-plus'
import { Folder, Document, Upload, Download, Delete, Refresh, FolderAdd, Search, Loading, FolderOpened, UploadFilled, CopyDocument } from '@element-plus/icons-vue'
import { useRosStore } from '@/stores/ros'
import { HttpFileTransferClient, createHttpFileTransferClient } from '@/utils/httpFileTransferUtils'

// 文件项接口（兼容 HTTP 传输）
interface FileItem {
    name: string
    type: 'file' | 'directory'
    size?: number
    path: string
}

const rosStore = useRosStore()

// 响应式数据
const currentPath = ref('/home/unitree')
const files = ref<FileItem[]>([])
const loading = ref(false)
const selectedFiles = ref<string[]>([])
const showUploadDialog = ref(false)
const showCreateDirDialog = ref(false)
const showMoveDialog = ref(false)
const selectedFile = ref<File | null>(null)
const uploadDestinationPath = ref('')
const uploading = ref(false)
const newDirName = ref('')
const moveDestinationPath = ref('')
const moveOperation = ref<'move' | 'copy'>('move')
const moveSourcePath = ref('')
const uploadRef = ref()
const httpClient = ref<HttpFileTransferClient | null>(null)

// 计算属性
const isConnected = computed(() => rosStore.connectionState.connected)

const pathParts = computed(() => {
    const parts = currentPath.value.split('/').filter(p => p)
    return parts.length > 0 ? parts : ['']
})

// 导航到路径
const navigateToPath = async () => {
    if (!currentPath.value.trim()) {
        ElMessage.warning('请输入路径')
        return
    }
    await loadDirectory(currentPath.value)
}

// 导航到面包屑路径
const navigateToBreadcrumb = async (index: number) => {
    const parts = pathParts.value.slice(0, index + 1)
    const newPath = '/' + parts.join('/')
    currentPath.value = newPath
    await loadDirectory(newPath)
}

// 初始化 HTTP 客户端
const initHttpClient = async () => {
    const wsUrl = rosStore.connectionState.url
    if (wsUrl) {
        httpClient.value = createHttpFileTransferClient(wsUrl, 8080)
        // 测试连接
        const connected = await httpClient.value.checkConnection()
        if (!connected) {
            ElMessage.warning('HTTP 文件服务未连接，请确保机器狗上已运行文件服务 API')
        }
    }
}

// 加载目录
const loadDirectory = async (path: string) => {
    if (!isConnected.value) {
        ElMessage.warning('请先连接到机器狗')
        return
    }

    // 确保 HTTP 客户端已初始化
    if (!httpClient.value) {
        await initHttpClient()
    }

    if (!httpClient.value) {
        ElMessage.error('无法初始化 HTTP 文件传输客户端')
        return
    }

    loading.value = true
    try {
        // 使用 HTTP API
        const httpItems = await httpClient.value.listDirectory(path)
        const items: FileItem[] = httpItems.map(item => ({
            name: item.name,
            type: item.type,
            size: item.size,
            path: item.path
        }))
        
        files.value = items.sort((a, b) => {
            // 目录排在前面
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1
            }
            return a.name.localeCompare(b.name)
        })
        selectedFiles.value = []
    } catch (error) {
        console.error('加载目录失败:', error)
        ElMessage.error(error instanceof Error ? error.message : '加载目录失败')
        files.value = []
    } finally {
        loading.value = false
    }
}

// 刷新目录
const refreshDirectory = () => {
    loadDirectory(currentPath.value)
}

// 切换选择
const toggleSelect = (item: FileItem) => {
    const index = selectedFiles.value.indexOf(item.path)
    if (index > -1) {
        selectedFiles.value.splice(index, 1)
    } else {
        selectedFiles.value.push(item.path)
    }
}

// 处理双击
const handleItemDoubleClick = async (item: FileItem) => {
    if (item.type === 'directory') {
        const newPath = item.path.endsWith('/') ? item.path : item.path + '/'
        currentPath.value = newPath
        await loadDirectory(newPath)
    }
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

// 处理文件选择
const handleFileChange = (file: any) => {
    selectedFile.value = file.raw
    if (!uploadDestinationPath.value) {
        uploadDestinationPath.value = currentPath.value
    }
}

// 处理上传
const handleUpload = async () => {
    if (!selectedFile.value) {
        ElMessage.warning('请选择文件')
        return
    }

    if (!uploadDestinationPath.value.trim()) {
        ElMessage.warning('请输入目标路径')
        return
    }

    // 确保 HTTP 客户端已初始化
    if (!httpClient.value) {
        await initHttpClient()
    }

    if (!httpClient.value) {
        ElMessage.error('无法初始化 HTTP 文件传输客户端')
        return
    }

    uploading.value = true
    try {
        // 使用 HTTP API 上传（支持进度）
        await httpClient.value.uploadFile(
            selectedFile.value,
            uploadDestinationPath.value,
            (_progress) => {
            }
        )
        ElMessage.success('文件上传成功')
        showUploadDialog.value = false
        selectedFile.value = null
        uploadDestinationPath.value = ''
        await refreshDirectory()
    } catch (error) {
        console.error('上传文件失败:', error)
        ElMessage.error(error instanceof Error ? error.message : '上传文件失败')
    } finally {
        uploading.value = false
    }
}

// 处理下载
const handleDownload = async (item: FileItem) => {
    if (item.type === 'directory') {
        ElMessage.warning('无法下载目录')
        return
    }

    // 确保 HTTP 客户端已初始化
    if (!httpClient.value) {
        await initHttpClient()
    }

    if (!httpClient.value) {
        ElMessage.error('无法初始化 HTTP 文件传输客户端')
        return
    }

    try {
        ElMessage.info('开始下载文件...')
        // 使用 HTTP API 下载（支持进度）
        const blob = await httpClient.value.downloadFile(
            item.path,
            (_progress) => {
            }
        )
        
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = item.name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        ElMessage.success('文件下载成功')
    } catch (error) {
        console.error('下载文件失败:', error)
        ElMessage.error(error instanceof Error ? error.message : '下载文件失败')
    }
}

// 处理删除
const handleDelete = async (item: FileItem) => {
    try {
        await ElMessageBox.confirm(
            `确定要删除 ${item.type === 'directory' ? '目录' : '文件'} "${item.name}" 吗？`,
            '确认删除',
            {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }
        )

        // 确保 HTTP 客户端已初始化
        if (!httpClient.value) {
            await initHttpClient()
        }

        if (!httpClient.value) {
            ElMessage.error('无法初始化 HTTP 文件传输客户端')
            return
        }

        await httpClient.value.deleteFile(item.path)
        ElMessage.success('删除成功')
        await refreshDirectory()
    } catch (error) {
        if (error !== 'cancel') {
            console.error('删除失败:', error)
            ElMessage.error(error instanceof Error ? error.message : '删除失败')
        }
    }
}

// 处理复制
const handleCopy = (item: FileItem) => {
    moveOperation.value = 'copy'
    moveSourcePath.value = item.path
    moveDestinationPath.value = currentPath.value
    showMoveDialog.value = true
}

// 处理移动
const handleMove = (item: FileItem) => {
    moveOperation.value = 'move'
    moveSourcePath.value = item.path
    moveDestinationPath.value = currentPath.value
    showMoveDialog.value = true
}

// 确认移动/复制
const confirmMove = async () => {
    if (!moveDestinationPath.value.trim()) {
        ElMessage.warning('请输入目标路径')
        return
    }

    // 确保 HTTP 客户端已初始化
    if (!httpClient.value) {
        await initHttpClient()
    }

    if (!httpClient.value) {
        ElMessage.error('无法初始化 HTTP 文件传输客户端')
        return
    }

    try {
        // 使用 HTTP API
        if (moveOperation.value === 'move') {
            await httpClient.value.moveFile(moveSourcePath.value, moveDestinationPath.value)
            ElMessage.success('移动成功')
        } else {
            await httpClient.value.copyFile(moveSourcePath.value, moveDestinationPath.value)
            ElMessage.success('复制成功')
        }
        showMoveDialog.value = false
        moveDestinationPath.value = ''
        await refreshDirectory()
    } catch (error) {
        console.error('操作失败:', error)
        ElMessage.error(error instanceof Error ? error.message : '操作失败')
    }
}

// 处理创建目录
const handleCreateDirectory = async () => {
    if (!newDirName.value.trim()) {
        ElMessage.warning('请输入文件夹名称')
        return
    }

    const newPath = currentPath.value.endsWith('/')
        ? `${currentPath.value}${newDirName.value}`
        : `${currentPath.value}/${newDirName.value}`

    // 确保 HTTP 客户端已初始化
    if (!httpClient.value) {
        await initHttpClient()
    }

    if (!httpClient.value) {
        ElMessage.error('无法初始化 HTTP 文件传输客户端')
        return
    }

    try {
        await httpClient.value.createDirectory(newPath)
        ElMessage.success('创建成功')
        showCreateDirDialog.value = false
        newDirName.value = ''
        await refreshDirectory()
    } catch (error) {
        console.error('创建目录失败:', error)
        ElMessage.error(error instanceof Error ? error.message : '创建目录失败')
    }
}

// 监听连接状态
watch(isConnected, async (connected) => {
    if (connected) {
        await initHttpClient()
        await loadDirectory(currentPath.value)
    } else {
        files.value = []
        httpClient.value = null
    }
})

// 组件挂载
onMounted(async () => {
    if (isConnected.value) {
        await initHttpClient()
        await loadDirectory(currentPath.value)
    }
})
</script>

<style scoped>
.file-manager-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.file-manager-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    overflow: hidden;
}

.path-navigation {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.path-breadcrumb {
    font-size: 12px;
}

.toolbar {
    display: flex;
    gap: 8px;
}

.file-list-container {
    flex: 1;
    min-height: 0;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
}

.loading-container,
.empty-container {
    height: 100%;
}

.loading-content,
.empty-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: #999;
}

.file-list {
    height: 100%;
}

.file-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
    transition: background-color 0.2s;
    gap: 8px;
}

.file-item:hover {
    background-color: #f5f5f5;
}

.file-item.selected {
    background-color: #ecf5ff;
}

.file-icon {
    flex-shrink: 0;
    color: #409EFF;
}

.file-name {
    flex: 1;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.file-size {
    font-size: 12px;
    color: #999;
    margin-right: 8px;
}

.file-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
}

.file-item:hover .file-actions {
    opacity: 1;
}

.upload-dialog-content {
    padding: 10px 0;
}

.selected-file-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 8px;
    background-color: #f5f5f5;
    border-radius: 4px;
    font-size: 13px;
}
</style>

