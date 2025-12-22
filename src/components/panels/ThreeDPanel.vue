<template>
    <div class="three-d-panel">
        <div ref="canvasContainer" class="canvas-container"></div>
        <div class="map-controls">
            <el-button size="small" @click="fitMapToView" title="适应地图">
                <el-icon>
                    <FullScreen />
                </el-icon>
            </el-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { ElButton, ElIcon, ElMessage, ElMessageBox } from 'element-plus'
import { FullScreen } from '@element-plus/icons-vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { use3DSettingsStore } from '@/stores/threeDSettings'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'
import { createMapPlane, updateMapPlane } from '@/utils/threeUtils'
import { PublishClickTool, type PublishClickType } from '@/utils/PublishClickTool'
import { makePointMessage, makePoseMessage, makePoseEstimateMessage } from '@/utils/publishUtils'

const settingsStore = use3DSettingsStore()
const rosStore = useRosStore()
const canvasContainer = ref<HTMLDivElement>()
const publishActive = ref(false)

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let gridHelper: THREE.GridHelper
let animationId: number
let mapMesh: THREE.Mesh | null = null
let publishTool: PublishClickTool | null = null
let raycaster: THREE.Raycaster | null = null
let mouse: THREE.Vector2 | null = null
let mapSubscriptionTimer: number | null = null
let hasReceivedMapData = false
let currentMapData: any = null
let resizeObserver: ResizeObserver | null = null
let resizeTimeout: number | null = null

const initThreeJS = () => {
    if (!canvasContainer.value) return

    // 创建场景
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf0f0f0)

    // 创建相机
    const width = canvasContainer.value.clientWidth
    const height = canvasContainer.value.clientHeight
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)

    // 根据视图模式设置相机位置
    if (settingsStore.viewMode === '2d') {
        camera.position.set(0, 0, 20)
        camera.lookAt(0, 0, 0)
    } else {
        camera.position.set(10, 10, 10)
        camera.lookAt(0, 0, 0)
    }

    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    canvasContainer.value.appendChild(renderer.domElement)

    // 添加轨道控制器
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    // 2D模式下限制旋转
    if (settingsStore.viewMode === '2d') {
        controls.enableRotate = false
    }

    // 默认：左键拖动（未发布时）
    // 发布时：右键拖动（通过 watch publishActive 动态调整）
    updateControlsForPublishState(false)

    // 添加网格 (旋转到XY平面)
    gridHelper = new THREE.GridHelper(20, 20, 0xcccccc, 0xdddddd)
    gridHelper.rotation.x = Math.PI / 2  // 旋转到XY平面
    if (settingsStore.showGrid) {
        scene.add(gridHelper)
    }

    // 添加坐标轴
    if (settingsStore.showAxes) {
        if (settingsStore.viewMode === '2d') {
            // 2D模式只显示XY轴
            const axesGroup = new THREE.Group()
            axesGroup.name = 'axes'

            // X轴 (红色)
            const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(5, 0, 0)
            ])
            const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 })
            const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial)
            axesGroup.add(xAxis)

            // Y轴 (绿色)
            const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 5, 0)
            ])
            const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 })
            const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial)
            axesGroup.add(yAxis)

            scene.add(axesGroup)
        } else {
            // 3D模式显示完整坐标轴
            const axesHelper = new THREE.AxesHelper(5)
            axesHelper.name = 'axes'
            scene.add(axesHelper)
        }
    }

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight.position.set(10, 10, 10)
    scene.add(directionalLight)

    // 初始化发布工具
    initPublishTool()

    // 如果已经连接，立即订阅话题（否则由watch处理）
    if (rosConnection.isConnected()) {
        subscribeToMap()
        subscribeToFootprint()
        subscribeToPlan()
        subscribeToMarkers()
    }

    // 初始化Raycaster用于鼠标拾取
    raycaster = new THREE.Raycaster()
    mouse = new THREE.Vector2()

    // 添加鼠标事件监听
    renderer.domElement.addEventListener('mousemove', handleMouseMove)
    renderer.domElement.addEventListener('click', handleMouseClick)
    renderer.domElement.addEventListener('contextmenu', handleContextMenu)

    // 窗口大小调整
    const handleResize = () => {
        if (!canvasContainer.value) return
        const width = canvasContainer.value.clientWidth
        const height = canvasContainer.value.clientHeight
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)

    // 使用 ResizeObserver 监听容器大小变化（带防抖）
    resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            if (entry.target === canvasContainer.value) {
                // 清除之前的定时器
                if (resizeTimeout) {
                    clearTimeout(resizeTimeout)
                }
                // 延迟执行，避免在动画过程中频繁触发
                resizeTimeout = window.setTimeout(() => {
                    handleResize()
                    resizeTimeout = null
                }, 100)
            }
        }
    })
    resizeObserver.observe(canvasContainer.value)

    // 动画循环
    const animate = () => {
        animationId = requestAnimationFrame(animate)
        controls.update()

        // 更新文本sprite的大小，使其在屏幕上的大小保持固定
        if (camera && textSprites.length > 0) {
            textSprites.forEach(({ sprite, baseScale }) => {
                // 计算相机到sprite的距离
                const distance = camera.position.distanceTo(sprite.position)

                // 根据距离调整scale，使屏幕上的大小保持固定
                // 使用固定的参考距离（例如10米）来计算scale
                const referenceDistance = 20.0
                const scaleFactor = distance / referenceDistance

                // 保持宽高比
                const aspectRatio = sprite.scale.x / sprite.scale.y
                const newHeight = baseScale * scaleFactor
                const newWidth = newHeight * aspectRatio

                sprite.scale.set(newWidth, newHeight, 1)
            })
        }

        renderer.render(scene, camera)
    }
    animate()
}

// 订阅地图话题
const subscribeToMap = async () => {
    if (!rosConnection.isConnected()) {
        return
    }

    try {
        // 先取消订阅（如果已存在）
        rosConnection.unsubscribe('/map')
        hasReceivedMapData = false

        await rosConnection.subscribe({
            topic: '/map',
            messageType: 'nav_msgs/OccupancyGrid',
            compression: 'cbor',
            callback: (message: any) => {
                hasReceivedMapData = true
                handleMapMessage(message)
            }
        })

        // 启动定期检查机制：如果10秒内没有收到数据，重新订阅
        if (mapSubscriptionTimer) {
            clearInterval(mapSubscriptionTimer)
        }
        mapSubscriptionTimer = window.setInterval(() => {
            if (!hasReceivedMapData && rosConnection.isConnected()) {
                subscribeToMap()
            }
        }, 10000) // 每10秒检查一次
    } catch (error) {
        console.error('❌ 订阅地图话题失败:', error)
    }
}

// 处理地图消息
const handleMapMessage = (message: any) => {
    if (!scene) {
        return
    }

    try {
        // 保存地图数据
        currentMapData = message

        const { width, height } = message.info
        const totalPixels = width * height

        // 如果地图很大，显示加载提示
        if (totalPixels > 1000000) { // 超过100万像素
            ElMessage.info(`正在加载地图 (${width}×${height})，请稍候...`)
        }

        if (mapMesh) {
            // 更新现有地图
            updateMapPlane(mapMesh, message)
            if (totalPixels > 1000000) {
                ElMessage.success('地图更新完成')
            }
        } else {
            // 创建新地图
            mapMesh = createMapPlane(message)
            if (mapMesh) {
                scene.add(mapMesh)
                // 自动调整相机以适应地图
                fitCameraToMap(message)
                if (totalPixels > 1000000) {
                    ElMessage.success('地图加载完成')
                }
            } else {
                console.error('❌ 创建地图网格失败')
            }
        }
    } catch (error) {
        console.error('❌ 处理地图消息失败:', error)
        console.error('消息内容:', message)
        ElMessage.error('处理地图数据失败')
    }
}

// 订阅footprint话题
let footprintLine: THREE.Line | null = null
const subscribeToFootprint = async () => {
    if (!rosConnection.isConnected()) return

    try {
        // 先取消订阅（如果已存在）
        rosConnection.unsubscribe('/move_base/global_costmap/footprint')

        await rosConnection.subscribe({
            topic: '/move_base/global_costmap/footprint',
            messageType: 'geometry_msgs/PolygonStamped',
            callback: (message: any) => {
                handleFootprintMessage(message)
            }
        })
    } catch (error) {
        console.error('订阅footprint话题失败:', error)
    }
}

// 处理footprint消息
const handleFootprintMessage = (message: any) => {
    if (!scene) return

    try {
        // 移除旧的footprint
        if (footprintLine) {
            scene.remove(footprintLine)
            footprintLine.geometry.dispose()
            if (footprintLine.material instanceof THREE.Material) {
                footprintLine.material.dispose()
            }
        }

        // 创建新的footprint线
        const points: THREE.Vector3[] = []
        if (message.polygon && message.polygon.points) {
            message.polygon.points.forEach((point: any) => {
                points.push(new THREE.Vector3(point.x, point.y, 0.01))
            })
            // 闭合多边形
            if (points.length > 0) {
                points.push(points[0].clone())
            }
        }

        if (points.length > 1) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points)
            const material = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 })
            footprintLine = new THREE.Line(geometry, material)
            scene.add(footprintLine)
        }
    } catch (error) {
        console.error('处理footprint消息失败:', error)
    }
}

// 订阅plan话题
let planLine: THREE.Line | null = null
const subscribeToPlan = async () => {
    if (!rosConnection.isConnected()) return

    try {
        // 先取消订阅（如果已存在）
        rosConnection.unsubscribe('/move_base/GlobalPlanner/plan')

        await rosConnection.subscribe({
            topic: '/move_base/GlobalPlanner/plan',
            messageType: 'nav_msgs/Path',
            callback: (message: any) => {
                handlePlanMessage(message)
            }
        })
    } catch (error) {
        console.error('订阅plan话题失败:', error)
    }
}

// 处理plan消息
const handlePlanMessage = (message: any) => {
    if (!scene) return

    try {
        // 移除旧的plan
        if (planLine) {
            scene.remove(planLine)
            planLine.geometry.dispose()
            if (planLine.material instanceof THREE.Material) {
                planLine.material.dispose()
            }
        }

        // 创建新的plan路径线
        const points: THREE.Vector3[] = []
        if (message.poses && Array.isArray(message.poses)) {
            message.poses.forEach((poseStamped: any) => {
                if (poseStamped.pose && poseStamped.pose.position) {
                    const pos = poseStamped.pose.position
                    points.push(new THREE.Vector3(pos.x, pos.y, 0.02))
                }
            })
        }

        if (points.length > 1) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points)
            const material = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2 })
            planLine = new THREE.Line(geometry, material)
            scene.add(planLine)
        }
    } catch (error) {
        console.error('处理plan消息失败:', error)
    }
}

// 订阅markers话题
let markerObjects: THREE.Object3D[] = []
// 存储文本sprite的引用和原始大小，用于固定屏幕大小
let textSprites: Array<{ sprite: THREE.Sprite; baseScale: number }> = []
const subscribeToMarkers = async () => {
    if (!rosConnection.isConnected()) return

    try {
        // 先取消订阅（如果已存在）
        rosConnection.unsubscribe('/goal_queue/markers')

        await rosConnection.subscribe({
            topic: '/goal_queue/markers',
            messageType: 'visualization_msgs/MarkerArray',
            callback: (message: any) => {
                handleMarkersMessage(message)
            }
        })
    } catch (error) {
        console.error('订阅markers话题失败:', error)
    }
}

// 清理marker对象的辅助函数
const disposeMarkerObject = (obj: THREE.Object3D) => {
    if (obj instanceof THREE.Group) {
        // Group包含多个子对象（如箭头组）
        obj.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose()
                if (child.material instanceof THREE.Material) {
                    child.material.dispose()
                }
            } else if (child instanceof THREE.Sprite) {
                if (child.material instanceof THREE.SpriteMaterial) {
                    if (child.material.map) {
                        child.material.map.dispose()
                    }
                    child.material.dispose()
                }
            }
        })
    } else if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (obj.material instanceof THREE.Material) {
            obj.material.dispose()
        }
    } else if (obj instanceof THREE.Sprite) {
        // Sprite的材质和纹理需要清理
        if (obj.material instanceof THREE.SpriteMaterial) {
            if (obj.material.map) {
                obj.material.map.dispose()
            }
            obj.material.dispose()
        }
    }
}

// 处理markers消息
const handleMarkersMessage = (message: any) => {
    if (!scene) return

    try {
        // 检查是否有DELETEALL操作
        // 根据C++代码，DELETEALL标记的action=3，id=0，ns="goal_queue"
        let hasDeleteAll = false
        let deleteAllMarker: any = null
        if (message.markers && Array.isArray(message.markers)) {
            deleteAllMarker = message.markers.find((marker: any) =>
                marker.action === 3 || (marker.action === undefined && marker.type === undefined && marker.id === 0)
            )
            hasDeleteAll = !!deleteAllMarker
        }

        // 如果有DELETEALL或需要清理，先移除旧的markers
        // 注意：即使没有DELETEALL，如果收到新的标记数组，也应该清除旧的（因为后端会重新发布所有标记）
        if (hasDeleteAll || markerObjects.length > 0) {
            markerObjects.forEach(obj => {
                scene.remove(obj)
                disposeMarkerObject(obj)
            })
            markerObjects = []
            // 同时清理文本sprite引用
            textSprites = []

        }

        // 如果只有DELETEALL，直接返回
        if (hasDeleteAll && message.markers.length === 1) {
            return
        }

        // 创建新的markers
        if (message.markers && Array.isArray(message.markers)) {
            // 先过滤出有效的markers（非DELETEALL和DELETE操作）
            const validMarkers = message.markers.filter((marker: any) => {
                // 跳过DELETEALL操作
                if (marker.action === 3) {
                    return false
                }
                // 跳过DELETE操作
                if (marker.action === 2) {
                    return false
                }
                // 只处理ADD/MODIFY操作
                return marker.action === 0 || marker.action === undefined || marker.action === 1
            })

            // 按ID排序，确保显示顺序正确
            validMarkers.sort((a: any, b: any) => {
                // 优先按ID排序（这是主要排序依据）
                if (a.id !== undefined && b.id !== undefined) {
                    return a.id - b.id
                }
                // 如果ID不存在，按类型排序（箭头在前，文本在后）
                // 但这不应该发生，因为后端总是会设置ID
                if (a.type === 0 && b.type === 9) {
                    return -1
                }
                if (a.type === 9 && b.type === 0) {
                    return 1
                }
                return 0
            })

            // 处理排序后的markers
            validMarkers.forEach((marker: any) => {
                // 调试：打印所有marker信息（特别是文本标记）
                const markerObj = createMarker(marker)
                if (markerObj) {
                    scene.add(markerObj)
                    markerObjects.push(markerObj)
                }
            })
        }
    } catch (error) {
        console.error('处理markers消息失败:', error)
    }
}

// 创建单个marker对象
const createMarker = (marker: any): THREE.Object3D | null => {
    if (!marker.pose || !marker.pose.position) return null

    const pos = marker.pose.position
    const orient = marker.pose.orientation || { x: 0, y: 0, z: 0, w: 1 }

    // 根据marker类型创建不同的几何体
    switch (marker.type) {
        case 0: // ARROW
            return createArrowMarker(marker, pos, orient)
        case 1: // CUBE
        case 2: // SPHERE
        case 3: // CYLINDER
            return createShapeMarker(marker, pos, orient)
        case 4: // LINE_STRIP
        case 5: // LINE_LIST
            return createLineMarker(marker)
        case 7: // SPHERE_LIST
            return createSphereListMarker(marker)
        case 8: // POINTS
            return createPointsMarker(marker)
        case 9: // TEXT_VIEW_FACING
            return createTextMarker(marker, pos, orient)
        default:
            return createDefaultMarker(marker, pos)
    }
}

// 创建形状marker（球体、立方体等）
const createShapeMarker = (marker: any, pos: any, orient: any): THREE.Object3D => {
    let geometry: THREE.BufferGeometry

    switch (marker.type) {
        case 2: // SPHERE
            const radius = marker.scale ? marker.scale.x / 2 : 0.1
            geometry = new THREE.SphereGeometry(radius, 16, 16)
            break
        case 1: // CUBE
            const sx = marker.scale?.x || 0.1
            const sy = marker.scale?.y || 0.1
            const sz = marker.scale?.z || 0.1
            geometry = new THREE.BoxGeometry(sx, sy, sz)
            break
        default:
            geometry = new THREE.SphereGeometry(0.1, 16, 16)
    }

    const color = marker.color ?
        new THREE.Color(marker.color.r, marker.color.g, marker.color.b) :
        new THREE.Color(0xff0000)
    const opacity = marker.color?.a !== undefined ? marker.color.a : 1.0

    const material = new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1.0,
        opacity
    })
    const mesh = new THREE.Mesh(geometry, material)

    mesh.position.set(pos.x, pos.y, pos.z)

    // 应用方向（四元数）
    mesh.quaternion.set(orient.x, orient.y, orient.z, orient.w)

    return mesh
}

// 创建线条marker
const createLineMarker = (marker: any): THREE.Object3D | null => {
    if (!marker.points || marker.points.length < 2) return null

    const points: THREE.Vector3[] = marker.points.map((p: any) =>
        new THREE.Vector3(p.x, p.y, p.z)
    )

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const color = marker.color ?
        new THREE.Color(marker.color.r, marker.color.g, marker.color.b) :
        new THREE.Color(0xff0000)
    const material = new THREE.LineBasicMaterial({ color })

    return marker.type === 4 ?
        new THREE.Line(geometry, material) :
        new THREE.LineSegments(geometry, material)
}

// 创建球体列表marker
const createSphereListMarker = (marker: any): THREE.Object3D | null => {
    if (!marker.points || marker.points.length === 0) return null

    const group = new THREE.Group()
    const radius = marker.scale ? marker.scale.x / 2 : 0.05
    const color = marker.color ?
        new THREE.Color(marker.color.r, marker.color.g, marker.color.b) :
        new THREE.Color(0xff0000)

    marker.points.forEach((p: any) => {
        const geometry = new THREE.SphereGeometry(radius, 8, 8)
        const material = new THREE.MeshBasicMaterial({ color })
        const sphere = new THREE.Mesh(geometry, material)
        sphere.position.set(p.x, p.y, p.z)
        group.add(sphere)
    })

    return group
}

// 创建点云marker
const createPointsMarker = (marker: any): THREE.Object3D | null => {
    if (!marker.points || marker.points.length === 0) return null

    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(marker.points.length * 3)

    marker.points.forEach((p: any, i: number) => {
        positions[i * 3] = p.x
        positions[i * 3 + 1] = p.y
        positions[i * 3 + 2] = p.z
    })

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const color = marker.color ?
        new THREE.Color(marker.color.r, marker.color.g, marker.color.b) :
        new THREE.Color(0xff0000)
    const material = new THREE.PointsMaterial({
        color,
        size: marker.scale?.x || 0.05
    })

    return new THREE.Points(geometry, material)
}

// 创建箭头marker
const createArrowMarker = (marker: any, pos: any, orient: any): THREE.Object3D => {
    // scale.x = 箭头长度, scale.y = 轴宽度, scale.z = 箭头头部高度
    // 增大默认尺寸，使箭头更清晰可见（放大2倍）
    const length = (marker.scale?.x || 0.5) * 2
    const headLength = (marker.scale?.z || 0.2) * 2
    const headWidth = (marker.scale?.y || 0.15) * 2

    // 强制使用红色，忽略ROS消息中的颜色
    const color = new THREE.Color(0xff0000) // 红色

    const opacity = marker.color?.a !== undefined ? marker.color.a : 1.0

    // 创建箭头组
    const group = new THREE.Group()

    // 1. 创建箭头轴（圆柱体）
    const shaftLength = length - headLength
    if (shaftLength > 0) {
        const shaftRadius = headWidth * 0.3
        const shaftGeometry = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 8)
        const shaftMaterial = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1.0, opacity })
        const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial)
        // 旋转到x轴方向
        shaft.rotation.z = Math.PI / 2
        shaft.position.x = shaftLength / 2
        group.add(shaft)
    }

    // 2. 创建箭头头部（圆锥）
    const headGeometry = new THREE.ConeGeometry(headWidth * 0.5, headLength, 8)
    const headMaterial = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1.0, opacity })
    const head = new THREE.Mesh(headGeometry, headMaterial)
    // 旋转到x轴方向，指向x轴正方向
    head.rotation.z = -Math.PI / 2
    head.position.x = length - headLength / 2
    group.add(head)

    // 设置位置
    group.position.set(pos.x, pos.y, pos.z || 0)

    // 应用方向（四元数）
    if (orient) {
        group.quaternion.set(orient.x, orient.y, orient.z, orient.w)
    }

    return group
}

// 创建文本marker
const createTextMarker = (marker: any, pos: any, _orient: any): THREE.Object3D | null => {
    // 支持文本字段为字符串或数字
    const textValue = marker.text !== undefined && marker.text !== null ? String(marker.text) : null

    if (!textValue || textValue.trim() === '') {
        return null
    }

    // 强制使用红色
    const textColor = '#ff0000' // 红色

    // scale.z 是文字高度（米），转换为像素大小
    // 增大默认文字高度和字体大小，使文字更清晰可见（放大2倍）
    const textHeightM = (marker.scale?.z || 0.2) * 2
    const fontSizePx = Math.max(192, textHeightM * 800) // 最小192像素，更大的字体（放大2倍）

    // 创建文本（面向相机的2D文本）
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!

    // 使用更大的画布以确保文本清晰（放大2倍）
    canvas.width = 2048
    canvas.height = 512

    // 设置背景为透明
    context.clearRect(0, 0, canvas.width, canvas.height)

    // 设置文本样式
    context.fillStyle = textColor
    context.font = `bold ${fontSizePx}px Arial` // 使用粗体使文本更清晰
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    // 添加文本描边以增强可见性（增大描边宽度）
    context.strokeStyle = '#000000'
    context.lineWidth = 4
    context.strokeText(textValue, canvas.width / 2, canvas.height / 2)
    context.fillText(textValue, canvas.width / 2, canvas.height / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.1 // 去除透明边缘
    })
    const sprite = new THREE.Sprite(material)

    // 设置大小（scale.z 是文字高度，单位米）
    // 根据文字高度和画布比例设置sprite大小
    const aspectRatio = canvas.width / canvas.height
    // 增大文本显示尺寸，确保可见（放大更多倍，使文字更清晰）
    const spriteWidth = textHeightM * aspectRatio * 2
    const spriteHeight = textHeightM * 2
    sprite.scale.set(spriteWidth, spriteHeight, 1)

    // 设置位置（根据Python代码，文本已经在pose中包含了偏移）
    sprite.position.set(pos.x, pos.y, pos.z || 0)

    // 确保sprite始终面向相机（TEXT_VIEW_FACING）
    // Sprite默认就会面向相机，但我们可以确保它在渲染队列中优先
    sprite.renderOrder = 999 // 确保文本显示在其他对象之上

    // 保存文本sprite的引用和原始大小，用于固定屏幕大小
    textSprites.push({
        sprite,
        baseScale: spriteHeight // 保存原始高度作为基准
    })

    return sprite
}

// 创建默认marker（简单球体）
const createDefaultMarker = (marker: any, pos: any): THREE.Object3D => {
    const geometry = new THREE.SphereGeometry(0.1, 16, 16)
    const color = marker.color ?
        new THREE.Color(marker.color.r, marker.color.g, marker.color.b) :
        new THREE.Color(0xff0000)
    const material = new THREE.MeshBasicMaterial({ color })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(pos.x, pos.y, pos.z)
    return mesh
}

// 调整相机以适应地图
const fitCameraToMap = (mapData: any) => {
    const { width, height, resolution, origin } = mapData.info
    const mapWidth = width * resolution
    const mapHeight = height * resolution

    const centerX = origin.position.x + mapWidth / 2
    const centerY = origin.position.y + mapHeight / 2

    if (settingsStore.viewMode === '2d') {
        // 2D视图：从正上方俯视
        const maxDim = Math.max(mapWidth, mapHeight)
        camera.position.set(centerX, centerY, maxDim * 0.8)
        camera.lookAt(centerX, centerY, 0)
    } else {
        // 3D视图：倾斜角度
        const maxDim = Math.max(mapWidth, mapHeight)
        camera.position.set(centerX + maxDim * 0.5, centerY + maxDim * 0.5, maxDim * 0.5)
        camera.lookAt(centerX, centerY, 0)
    }

    controls.target.set(centerX, centerY, 0)
    controls.update()
}

// 适应地图到视图（供按钮调用）
const fitMapToView = () => {
    if (!currentMapData) {
        ElMessage.warning('未加载地图数据')
        return
    }
    fitCameraToMap(currentMapData)
    ElMessage.success('视角已适应地图')
}

// 初始化发布工具
const initPublishTool = () => {
    if (!scene) return

    publishTool = new PublishClickTool(scene)
    publishTool.setPublishType(settingsStore.publishType)

    // 设置发布回调
    publishTool.onPublish((event) => {
        handlePublishEvent(event)
    })

    // 设置状态变化回调
    publishTool.onStateChange((active) => {
        publishActive.value = active
        // 更新控制器状态
        updateControlsForPublishState(active)
    })
}

// 更新控制器状态（根据是否在发布模式）
const updateControlsForPublishState = (isPublishing: boolean) => {
    if (!controls) return

    if (isPublishing) {
        // 发布模式：禁用左键拖动，启用右键拖动
        controls.mouseButtons = {
            LEFT: null, // 禁用左键拖动
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN // 右键拖动
        }
    } else {
        // 非发布模式：启用左键拖动，禁用右键拖动
        controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN, // 左键拖动
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: null // 禁用右键拖动
        }
    }
}

// 处理鼠标移动
const handleMouseMove = (event: MouseEvent) => {
    if (!canvasContainer.value || !publishTool?.isActive()) return

    const rect = canvasContainer.value.getBoundingClientRect()
    mouse!.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse!.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    const worldPoint = getWorldPoint(mouse!)
    publishTool.handleMouseMove(worldPoint)
}

// 处理鼠标点击（左键）
const handleMouseClick = (event: MouseEvent) => {
    if (!canvasContainer.value || !publishTool?.isActive()) return

    const rect = canvasContainer.value.getBoundingClientRect()
    mouse!.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse!.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    const worldPoint = getWorldPoint(mouse!)
    publishTool.handleClick(worldPoint)
}

// 处理右键菜单（阻止默认行为，用于右键拖动）
const handleContextMenu = (event: MouseEvent) => {
    // 如果正在发布模式，阻止右键菜单，允许右键拖动
    if (publishTool?.isActive()) {
        event.preventDefault()
    }
}

// 获取鼠标在世界坐标中的位置
const getWorldPoint = (mouseCoords: THREE.Vector2): THREE.Vector3 | null => {
    if (!raycaster || !camera || !scene) return null

    raycaster.setFromCamera(mouseCoords, camera)

    // 如果有地图，与地图相交
    if (mapMesh) {
        const intersects = raycaster.intersectObject(mapMesh)
        if (intersects.length > 0) {
            return intersects[0].point
        }
    }

    // 否则与z=0平面相交
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const worldPoint = new THREE.Vector3()
    raycaster.ray.intersectPlane(plane, worldPoint)
    return worldPoint
}

// 处理发布事件（先显示确认对话框）
const handlePublishEvent = async (event: { type: PublishClickType; point?: any; pose?: any }) => {
    if (!rosConnection.isConnected()) {
        ElMessage.warning('ROS未连接')
        return
    }

    try {
        const frameId = 'map' // 使用地图坐标系

        // 准备坐标信息字符串
        let coordinateInfo = ''
        let messageType = ''

        switch (event.type) {
            case 'point': {
                coordinateInfo = `X: ${event.point.x.toFixed(3)}\nY: ${event.point.y.toFixed(3)}\nZ: ${event.point.z.toFixed(3)}`
                messageType = 'Point'
                break
            }
            case 'pose': {
                const pos = event.pose.position
                const orient = event.pose.orientation
                // 计算yaw角度（从四元数）
                const yaw = Math.atan2(2 * (orient.w * orient.z + orient.x * orient.y),
                    1 - 2 * (orient.y * orient.y + orient.z * orient.z))
                const yawDeg = (yaw * 180 / Math.PI).toFixed(2)
                coordinateInfo = `位置:\n  X: ${pos.x.toFixed(3)}\n  Y: ${pos.y.toFixed(3)}\n  Z: ${pos.z.toFixed(3)}\n\n方向:\n  Yaw: ${yawDeg}°`
                messageType = '目标'
                break
            }
            case 'pose_estimate': {
                const pos = event.pose.position
                const orient = event.pose.orientation
                const yaw = Math.atan2(2 * (orient.w * orient.z + orient.x * orient.y),
                    1 - 2 * (orient.y * orient.y + orient.z * orient.z))
                const yawDeg = (yaw * 180 / Math.PI).toFixed(2)
                coordinateInfo = `位置:\n  X: ${pos.x.toFixed(3)}\n  Y: ${pos.y.toFixed(3)}\n  Z: ${pos.z.toFixed(3)}\n\n方向:\n  Yaw: ${yawDeg}°`
                messageType = 'PoseEstimate'
                break
            }
        }

        // 显示确认对话框
        try {
            await ElMessageBox.confirm(
                `坐标信息：\n\n${coordinateInfo}\n\n是否确认发送？`,
                `确认发布${messageType}`,
                {
                    confirmButtonText: '确定',
                    cancelButtonText: '取消',
                    type: 'info',
                    dangerouslyUseHTMLString: false
                }
            )
        } catch {
            // 用户取消，不发送
            return
        }

        // 用户确认后，发送消息
        switch (event.type) {
            case 'point': {
                const message = makePointMessage(event.point, frameId)
                await rosConnection.publish(
                    settingsStore.publishPointTopic,
                    'geometry_msgs/PointStamped',
                    message
                )
                ElMessage.success('发布成功')
                break
            }
            case 'pose': {
                if (onPosePublishedCallback) {
                    onPosePublishedCallback(event.pose)
                } else {
                    const message = makePoseMessage(event.pose, frameId)
                    await rosConnection.publish(
                        settingsStore.publishPoseTopic,
                        'geometry_msgs/PoseStamped',
                        message
                    )
                    ElMessage.success('发布成功')
                }
                break
            }
            case 'pose_estimate': {
                const message = makePoseEstimateMessage(
                    event.pose,
                    frameId,
                    settingsStore.poseEstimateXDeviation,
                    settingsStore.poseEstimateYDeviation,
                    settingsStore.poseEstimateThetaDeviation
                )
                await rosConnection.publish(
                    settingsStore.publishPoseEstimateTopic,
                    'geometry_msgs/PoseWithCovarianceStamped',
                    message
                )
                ElMessage.success('发布成功')
                break
            }
        }
    } catch (error) {
        console.error('发布失败:', error)
        ElMessage.error('发布失败: ' + (error instanceof Error ? error.message : '未知错误'))
    }
}

// 处理发布命令
const handlePublishCommand = (command: PublishClickType) => {
    settingsStore.setPublishType(command)
    publishTool?.setPublishType(command)

    // 切换发布状态
    if (publishTool?.isActive()) {
        publishTool.stop()
    } else {
        publishTool?.start()
    }
}

const resetCamera = () => {
    if (settingsStore.viewMode === '2d') {
        camera.position.set(0, 0, 20)
        camera.lookAt(0, 0, 0)
        controls.target.set(0, 0, 0)
    } else {
        camera.position.set(10, 10, 10)
        camera.lookAt(0, 0, 0)
        controls.target.set(0, 0, 0)
    }
    controls.update()
}

// 暴露给外部的回调
let onPosePublishedCallback: ((pose: any) => void) | null = null

const setOnPosePublishedCallback = (callback: ((pose: any) => void) | null) => {
    onPosePublishedCallback = callback
}

// 暴露方法供设置面板调用
defineExpose({
    resetCamera,
    handlePublishCommand,
    setOnPosePublishedCallback
})

// 监听设置变化
watch(() => settingsStore.backgroundColor, (color) => {
    if (scene) {
        scene.background = new THREE.Color(color)
    }
})

// 监听ROS连接状态，连接成功后订阅话题
watch(() => rosStore.isConnected, (connected) => {
    if (connected && scene) {
        // 连接成功后订阅所有话题
        subscribeToMap()
        subscribeToFootprint()
        subscribeToPlan()
        subscribeToMarkers()
    }
}, { immediate: true })

onMounted(() => {
    initThreeJS()

    // 如果此时ROS已经连接，立即订阅
    if (rosStore.isConnected && scene) {
        subscribeToMap()
        subscribeToFootprint()
        subscribeToPlan()
        subscribeToMarkers()
    }
})

onUnmounted(() => {
    // 清理定时器
    if (mapSubscriptionTimer) {
        clearInterval(mapSubscriptionTimer)
        mapSubscriptionTimer = null
    }

    // 取消订阅地图话题
    if (rosConnection.isConnected()) {
        rosConnection.unsubscribe('/map')
    }

    // 清理发布工具
    if (publishTool) {
        publishTool.dispose()
        publishTool = null
    }

    // 移除鼠标事件监听
    if (renderer) {
        renderer.domElement.removeEventListener('mousemove', handleMouseMove)
        renderer.domElement.removeEventListener('click', handleMouseClick)
        renderer.domElement.removeEventListener('contextmenu', handleContextMenu)
    }

    // 清理 ResizeObserver
    if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
    }

    // 清理防抖定时器
    if (resizeTimeout) {
        clearTimeout(resizeTimeout)
        resizeTimeout = null
    }

    // 取消订阅
    rosConnection.unsubscribe('/map')
    rosConnection.unsubscribe('/move_base/global_costmap/footprint')
    rosConnection.unsubscribe('/move_base/GlobalPlanner/plan')
    rosConnection.unsubscribe('/goal_queue/markers')

    // 清理footprint和plan
    if (footprintLine) {
        footprintLine.geometry.dispose()
        if (footprintLine.material instanceof THREE.Material) {
            footprintLine.material.dispose()
        }
        scene?.remove(footprintLine)
        footprintLine = null
    }

    if (planLine) {
        planLine.geometry.dispose()
        if (planLine.material instanceof THREE.Material) {
            planLine.material.dispose()
        }
        scene?.remove(planLine)
        planLine = null
    }

    // 清理地图网格
    if (mapMesh) {
        if (mapMesh.geometry) {
            mapMesh.geometry.dispose()
        }
        if (mapMesh.material) {
            const material = mapMesh.material as THREE.MeshBasicMaterial
            if (material.map) {
                material.map.dispose()
            }
            material.dispose()
        }
        scene?.remove(mapMesh)
        mapMesh = null
    }

    if (animationId) {
        cancelAnimationFrame(animationId)
    }
    if (renderer) {
        renderer.dispose()
    }
    window.removeEventListener('resize', () => { })
})
</script>

<style scoped>
.three-d-panel {
    width: 100%;
    height: 100%;
    position: relative;
    background-color: #fff;
}

.canvas-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.map-controls {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 100;
}

.map-controls .el-button {
    background-color: rgba(255, 255, 255, 0.95);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.map-controls .el-button:hover {
    background-color: #ecf5ff;
    border-color: #409eff;
    color: #409eff;
}

.panel-toolbar {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    gap: 8px;
    background-color: rgba(255, 255, 255, 0.9);
    padding: 8px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
</style>
