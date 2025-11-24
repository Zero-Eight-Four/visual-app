<template>
    <div class="viewer-container">
        <div class="viewer-header">
            <h3>3D场景</h3>
            <div class="controls">
                <el-button size="small" @click="resetCamera">重置视角</el-button>
            </div>
        </div>
        <div ref="canvasContainer" class="canvas-container"></div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElButton } from 'element-plus'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const canvasContainer = ref<HTMLDivElement>()
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let animationId: number

const initThreeJS = () => {
    if (!canvasContainer.value) return

    // 创建场景
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a1a)

    // 创建相机
    const width = canvasContainer.value.clientWidth
    const height = canvasContainer.value.clientHeight
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    camera.position.set(5, 5, 5)
    camera.lookAt(0, 0, 0)

    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    canvasContainer.value.appendChild(renderer.domElement)

    // 添加轨道控制器
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    // 添加网格
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222)
    scene.add(gridHelper)

    // 添加坐标轴
    const axesHelper = new THREE.AxesHelper(5)
    scene.add(axesHelper)

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 10, 10)
    scene.add(directionalLight)

    // 添加示例立方体
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 })
    const cube = new THREE.Mesh(geometry, material)
    cube.position.y = 0.5
    scene.add(cube)

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

    // 动画循环
    const animate = () => {
        animationId = requestAnimationFrame(animate)
        controls.update()
        renderer.render(scene, camera)
    }
    animate()
}

const resetCamera = () => {
    camera.position.set(5, 5, 5)
    camera.lookAt(0, 0, 0)
    controls.reset()
}

onMounted(() => {
    initThreeJS()
})

onUnmounted(() => {
    if (animationId) {
        cancelAnimationFrame(animationId)
    }
    if (renderer) {
        renderer.dispose()
    }
})
</script>

<style scoped>
.viewer-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.viewer-header {
    padding: 10px 15px;
    background-color: #2a2a2a;
    border-bottom: 1px solid #3a3a3a;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.viewer-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
}

.controls {
    display: flex;
    gap: 8px;
}

.canvas-container {
    flex: 1;
    position: relative;
    overflow: hidden;
}
</style>
