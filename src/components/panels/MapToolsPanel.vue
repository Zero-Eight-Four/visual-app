<template>
    <div class="map-tools-panel">
        <div class="tools-content">
            <!-- 建图按钮 -->
            <el-button type="primary" :icon="Location" @click="handleMapping" :disabled="!isConnected"
                class="tool-button">
                建图
            </el-button>

            <!-- 地图选择按钮 -->
            <el-button type="default" :icon="FolderOpened" @click="showMapSelector = true" class="tool-button">
                地图选择
            </el-button>

            <!-- 地图编辑按钮 -->
            <el-button type="default" :icon="Edit" @click="handleMapEdit" class="tool-button">
                地图编辑
            </el-button>

            <!-- 地图切换按钮 -->
            <el-button type="default" :icon="Refresh" @click="handleMapSwitch" :disabled="availableMaps.length === 0"
                class="tool-button">
                地图切换
            </el-button>

            <!-- 当前地图显示 -->
            <div v-if="currentMap" class="current-map-info">
                <span class="label">当前地图:</span>
                <span class="value">{{ currentMap }}</span>
            </div>
        </div>

        <!-- 地图选择对话框 -->
        <el-dialog v-model="showMapSelector" title="选择地图" width="500px">
            <div class="map-selector-content">
                <div class="map-list">
                    <div v-for="map in availableMaps" :key="map" class="map-item"
                        :class="{ active: currentMap === map }" @click="selectMap(map)">
                        <el-icon>
                            <Document />
                        </el-icon>
                        <span>{{ map }}</span>
                        <el-icon v-if="currentMap === map" class="check-icon">
                            <Check />
                        </el-icon>
                    </div>
                    <div v-if="availableMaps.length === 0" class="empty-maps">
                        <p>未找到地图文件</p>
                    </div>
                </div>
            </div>
            <template #footer>
                <el-button @click="showMapSelector = false">取消</el-button>
                <el-button type="primary" @click="confirmMapSelection">确定</el-button>
            </template>
        </el-dialog>

        <!-- 地图编辑对话框 -->
        <el-dialog 
            v-model="showMapEditor" 
            title="地图编辑" 
            width="95%"
            :close-on-click-modal="false"
            class="map-editor-dialog"
            top="2vh"
        >
            <div class="map-editor-content">
                <div class="editor-toolbar">
                    <div class="toolbar-left">
                        <el-select v-model="selectedMapFile" placeholder="选择要编辑的地图" @change="loadMapForEdit"
                            style="width: 200px; margin-right: 10px;">
                            <el-option v-for="map in availableMaps" :key="map" :label="map" :value="map" />
                        </el-select>
                        <el-button type="primary" :icon="Upload" @click="triggerFileInput" :disabled="editing">
                            上传本地PGM
                        </el-button>
                        <input ref="fileInputRef" type="file" accept=".pgm" style="display: none"
                            @change="handleFileSelect" />
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

                <div class="map-canvas-container">
                    <canvas v-if="mapLoaded || editing" ref="mapCanvasRef" @mousedown="handleMouseDownWithSave"
                        @mousemove="handleMouseMove" @mouseup="handleMouseUp" @mouseleave="handleMouseUp"></canvas>
                    <div v-else class="empty-editor">
                        <p>请选择或上传地图文件</p>
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

        <!-- 保存地图对话框 -->
        <el-dialog 
            v-model="showSaveDialog" 
            title="保存地图" 
            width="500px"
            :close-on-click-modal="false"
        >
            <div class="save-dialog-content">
                <el-radio-group v-model="saveMode" @change="handleSaveModeChange">
                    <el-radio label="overwrite">覆盖原图</el-radio>
                    <el-radio label="new">保存为新文件</el-radio>
                </el-radio-group>
                
                <div v-if="saveMode === 'new'" style="margin-top: 16px;">
                    <el-input 
                        v-model="saveFileName" 
                        placeholder="输入文件名（不含扩展名）"
                        clearable
                    >
                        <template #append>.pgm</template>
                    </el-input>
                    <p style="font-size: 12px; color: #999; margin-top: 8px;">
                        文件将保存到 /maps/ 文件夹
                    </p>
                </div>
                
                <div v-else style="margin-top: 16px;">
                    <el-alert
                        :title="`将覆盖原文件: ${selectedMapFile}`"
                        type="warning"
                        :closable="false"
                        show-icon
                    />
                </div>
            </div>
            <template #footer>
                <el-button @click="showSaveDialog = false">取消</el-button>
                <el-button 
                    type="primary" 
                    @click="confirmSaveMap"
                    :disabled="saving || (saveMode === 'new' && !saveFileName.trim())"
                >
                    {{ saving ? '保存中...' : '确定保存' }}
                </el-button>
            </template>
        </el-dialog>

        <!-- 地图切换对话框 -->
        <el-dialog v-model="showMapSwitch" title="切换地图" width="400px">
            <div class="map-switch-content">
                <el-select v-model="switchToMap" placeholder="选择要切换的地图" style="width: 100%;">
                    <el-option v-for="map in availableMaps" :key="map" :label="map" :value="map" />
                </el-select>
            </div>
            <template #footer>
                <el-button @click="showMapSwitch = false">取消</el-button>
                <el-button type="primary" @click="confirmMapSwitch">确定</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import { ElButton, ElButtonGroup, ElDialog, ElSelect, ElOption, ElIcon, ElMessage, ElInputNumber, ElRadioGroup, ElRadio, ElInput, ElAlert } from 'element-plus'
import { Location, FolderOpened, Edit, Refresh, Document, Check, Upload, Delete, ZoomIn, ZoomOut } from '@element-plus/icons-vue'
import { useRosStore } from '@/stores/ros'

const rosStore = useRosStore()

// 响应式数据
const showMapSelector = ref(false)
const showMapEditor = ref(false)
const showMapSwitch = ref(false)
const showSaveDialog = ref(false)
const availableMaps = ref<string[]>([])
const currentMap = ref<string>('')
const selectedMapFile = ref<string>('')
const switchToMap = ref<string>('')
const mapCanvasRef = ref<HTMLCanvasElement>()
const fileInputRef = ref<HTMLInputElement>()
const editing = ref(false)
const saving = ref(false)
const mapLoaded = ref(false)
const currentTool = ref<'brush' | 'rectangle' | 'eraser'>('brush')
const brushSize = ref(5)
const zoomLevel = ref(1.0)
const saveMode = ref<'overwrite' | 'new'>('overwrite')
const saveFileName = ref<string>('')

// 绘制状态
const isDrawing = ref(false)
const lastX = ref(0)
const lastY = ref(0)
const startX = ref(0)
const startY = ref(0)
const isSelecting = ref(false)

// 计算属性
const isConnected = computed(() => rosStore.connectionState.connected)

// 获取可用地图列表
const fetchAvailableMaps = async () => {
    try {
        // 从 /maps/ 文件夹读取 pgm 文件列表
        const response = await fetch('/maps/')
        if (!response.ok) {
            // 如果直接访问文件夹失败，尝试列出已知文件
            // 或者通过 API 获取
            console.warn('无法直接访问 /maps/ 文件夹，使用默认地图列表')
            availableMaps.value = ['go2.pgm']
            return
        }

        const text = await response.text()
        // 解析 HTML 响应，提取 .pgm 文件
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, 'text/html')
        const links = doc.querySelectorAll('a')
        const maps: string[] = []

        links.forEach(link => {
            const href = link.getAttribute('href')
            if (href && href.endsWith('.pgm')) {
                // 只提取文件名，去掉路径前缀
                const fileName = href.replace(/^.*\//, '')
                maps.push(fileName)
            }
        })

        availableMaps.value = maps.length > 0 ? maps : ['go2.pgm']
    } catch (error) {
        console.error('获取地图列表失败:', error)
        // 使用默认地图
        availableMaps.value = ['go2.pgm']
    }
}

// 建图功能
const handleMapping = () => {
    if (!isConnected.value) {
        ElMessage.warning('请先连接到机器狗')
        return
    }
    ElMessage.info('建图功能开发中...')
    // TODO: 实现建图功能，可能需要发布到 ROS 话题
}

// 地图编辑
const handleMapEdit = () => {
    showMapEditor.value = true
    if (availableMaps.value.length === 0) {
        fetchAvailableMaps()
    }
}

// 地图切换
const handleMapSwitch = () => {
    showMapSwitch.value = true
    switchToMap.value = currentMap.value
}

// 选择地图
const selectMap = (map: string) => {
    currentMap.value = map
}

// 确认地图选择
const confirmMapSelection = () => {
    if (currentMap.value) {
        ElMessage.success(`已选择地图: ${currentMap.value}`)
        showMapSelector.value = false
    } else {
        ElMessage.warning('请先选择地图')
    }
}

// 确认地图切换
const confirmMapSwitch = () => {
    if (switchToMap.value && switchToMap.value !== currentMap.value) {
        currentMap.value = switchToMap.value
        ElMessage.success(`已切换到地图: ${switchToMap.value}`)
        showMapSwitch.value = false
        // TODO: 实现实际的地图切换逻辑，可能需要加载新地图到 ROS
    } else {
        ElMessage.warning('请选择不同的地图')
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

        console.log(`解析PGM文件: ${magic}, ${width}x${height}, max=${maxVal}, 数据开始位置: ${headerEnd}`)

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

        console.log('PGM文件解析成功')
        return imageData
    } catch (error) {
        console.error('解析PGM文件失败:', error)
        if (error instanceof Error) {
            console.error('错误详情:', error.message)
            console.error('堆栈:', error.stack)
        }
        return null
    }
}

// 加载地图用于编辑
const loadMapForEdit = async (mapName: string) => {
    if (!mapName) {
        ElMessage.warning('请选择地图文件')
        return
    }

    try {
        editing.value = true
        mapLoaded.value = false

        // 如果mapName已经包含路径，去掉路径前缀，只保留文件名
        let fileName = mapName
        if (fileName.startsWith('/maps/')) {
            fileName = fileName.replace(/^\/maps\//, '')
        } else if (fileName.includes('/')) {
            fileName = fileName.split('/').pop() || fileName
        }

        console.log('开始加载地图:', mapName, '-> 文件名:', fileName)
        const url = `/maps/${encodeURIComponent(fileName)}`
        console.log('请求URL:', url)

        const response = await fetch(url)
        console.log('响应状态:', response.status, response.statusText)

        if (!response.ok) {
            const errorText = await response.text().catch(() => '')
            console.error('HTTP错误:', response.status, errorText)
            throw new Error(`无法加载地图文件: HTTP ${response.status} ${response.statusText}`)
        }

        const contentType = response.headers.get('content-type')
        console.log('Content-Type:', contentType)

        const arrayBuffer = await response.arrayBuffer()
        console.log('文件大小:', arrayBuffer.byteLength, '字节')

        if (arrayBuffer.byteLength === 0) {
            throw new Error('地图文件为空')
        }

        const imageData = await parsePGM(arrayBuffer)

        if (!imageData) {
            throw new Error('解析地图文件失败，请检查文件格式是否正确')
        }

        console.log('地图尺寸:', imageData.width, 'x', imageData.height)

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

        const ctx = canvas.getContext('2d')
        if (!ctx) {
            throw new Error('无法获取画布上下文')
        }

        ctx.putImageData(imageData, 0, 0)
        mapLoaded.value = true
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
const triggerFileInput = () => {
    fileInputRef.value?.click()
}

// 处理文件选择
const handleFileSelect = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.pgm')) {
        ElMessage.warning('请选择 .pgm 格式的地图文件')
        return
    }

    try {
        editing.value = true
        mapLoaded.value = false
        selectedMapFile.value = file.name

        const arrayBuffer = await file.arrayBuffer()
        const imageData = await parsePGM(arrayBuffer)

        if (!imageData || !mapCanvasRef.value) {
            throw new Error('解析地图文件失败')
        }

        const canvas = mapCanvasRef.value
        canvas.width = imageData.width
        canvas.height = imageData.height

        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.putImageData(imageData, 0, 0)
            mapLoaded.value = true
            ElMessage.success('地图加载成功')
        }
    } catch (error) {
        console.error('加载文件失败:', error)
        ElMessage.error('加载文件失败: ' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
        editing.value = false
    }
}

// 设置工具
const setTool = (tool: 'brush' | 'rectangle' | 'eraser') => {
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

// 鼠标按下
const handleMouseDown = (event: MouseEvent) => {
    if (!mapCanvasRef.value) return

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
    } else {
        drawAt(coords.x, coords.y)
    }
}

// 鼠标移动
const handleMouseMove = (event: MouseEvent) => {
    if (!isDrawing.value || !mapCanvasRef.value) return

    const coords = getCanvasCoordinates(event)
    if (!coords) return

    if (currentTool.value === 'rectangle') {
        // 框选：绘制预览矩形
        redrawCanvas()
        const ctx = mapCanvasRef.value.getContext('2d')
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

    const ctx = mapCanvasRef.value.getContext('2d')
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

    const ctx = mapCanvasRef.value.getContext('2d')
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

    const ctx = mapCanvasRef.value.getContext('2d')
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
    const ctx = mapCanvasRef.value.getContext('2d')
    if (ctx) {
        originalImageData = ctx.getImageData(0, 0, mapCanvasRef.value.width, mapCanvasRef.value.height)
    }
}

const redrawCanvas = () => {
    if (!mapCanvasRef.value || !originalImageData) {
        saveCanvasState()
        return
    }

    const ctx = mapCanvasRef.value.getContext('2d')
    if (ctx) {
        ctx.putImageData(originalImageData, 0, 0)
    }
}

// 在开始绘制时保存状态（已合并到handleMouseDown中）
const handleMouseDownWithSave = handleMouseDown

// 撤销操作
const undoLastAction = () => {
    if (originalImageData && mapCanvasRef.value) {
        const ctx = mapCanvasRef.value.getContext('2d')
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
    const ctx = canvas.getContext('2d')
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
    const ctx = canvas.getContext('2d')
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

// 处理保存模式变化
const handleSaveModeChange = () => {
    if (saveMode.value === 'new') {
        // 生成默认文件名（基于原文件名）
        const originalName = selectedMapFile.value || 'map'
        const nameWithoutExt = originalName.replace(/\.pgm$/i, '')
        saveFileName.value = `${nameWithoutExt}_edited`
    }
}

// 确认保存地图
const confirmSaveMap = async () => {
    if (saveMode.value === 'new' && !saveFileName.value.trim()) {
        ElMessage.warning('请输入文件名')
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
        const ctx = canvas.getContext('2d')
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

        // 确定保存的文件名
        let fileName: string
        if (saveMode.value === 'overwrite') {
            if (!selectedMapFile.value) {
                ElMessage.warning('无法覆盖：未选择原文件')
                return
            }
            fileName = selectedMapFile.value
        } else {
            // 确保文件名以.pgm结尾
            fileName = saveFileName.value.trim()
            if (!fileName.endsWith('.pgm')) {
                fileName += '.pgm'
            }
        }

        // 创建FormData上传到服务器
        const blob = new Blob([pgmData], { type: 'image/x-portable-graymap' })
        const formData = new FormData()
        formData.append('file', blob, fileName)

        // 上传到服务器
        const response = await fetch('/api/maps/upload', {
            method: 'POST',
            body: formData
        })

        if (!response.ok) {
            // 如果API不存在，降级为下载
            console.warn('服务器上传失败，使用下载方式')
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = fileName
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            ElMessage.success(`地图已下载: ${fileName}`)
        } else {
            const result = await response.json()
            ElMessage.success(`地图已保存到 /maps/${fileName}`)
            // 刷新地图列表
            if (saveMode.value === 'new') {
                await fetchAvailableMaps()
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

.tool-button {
    width: 100%;
    justify-content: flex-start;
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
    padding: 12px;
    margin-bottom: 8px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
}

.map-item:hover {
    background-color: #f5f5f5;
    border-color: #409EFF;
}

.map-item.active {
    background-color: #ecf5ff;
    border-color: #409EFF;
}

.map-item .el-icon {
    margin-right: 8px;
    color: #409EFF;
}

.map-item .check-icon {
    margin-left: auto;
    color: #67c23a;
}

.empty-maps {
    text-align: center;
    padding: 40px;
    color: #999;
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
    overflow: auto;
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
}

.map-canvas-container canvas {
    cursor: crosshair;
    background-color: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    display: block;
    /* 不限制画布尺寸，让它显示完整 */
}

.map-canvas-container canvas:hover {
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
