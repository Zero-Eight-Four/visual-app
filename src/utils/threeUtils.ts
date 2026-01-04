/**
 * Three.js 相关工具函数
 */

import * as THREE from 'three'

/**
 * 点类型定义
 */
export interface Point {
  x: number
  y: number
  z: number
}

/**
 * 姿态类型定义
 */
export interface Pose {
  position: Point
  orientation: {
    x: number
    y: number
    z: number
    w: number
  }
}

/**
 * 创建网格辅助
 */
export function createGrid(size = 10, divisions = 10): THREE.GridHelper {
  return new THREE.GridHelper(size, divisions, 0x444444, 0x222222)
}

/**
 * 创建坐标轴辅助
 */
export function createAxes(size = 5): THREE.AxesHelper {
  return new THREE.AxesHelper(size)
}

/**
 * 创建基础光照
 */
export function createLights(): THREE.Light[] {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(10, 10, 10)
  directionalLight.castShadow = true

  return [ambientLight, directionalLight]
}

/**
 * 从 ROS Pose 创建 Three.js Object3D
 */
export function poseToObject3D(pose: {
  position: { x: number; y: number; z: number }
  orientation: { x: number; y: number; z: number; w: number }
}): THREE.Object3D {
  const object = new THREE.Object3D()

  object.position.set(pose.position.x, pose.position.y, pose.position.z)

  object.quaternion.set(
    pose.orientation.x,
    pose.orientation.y,
    pose.orientation.z,
    pose.orientation.w
  )

  return object
}

/**
 * 从 Three.js Object3D 创建 ROS Pose
 */
export function object3DToPose(object: THREE.Object3D): {
  position: { x: number; y: number; z: number }
  orientation: { x: number; y: number; z: number; w: number }
} {
  return {
    position: {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z
    },
    orientation: {
      x: object.quaternion.x,
      y: object.quaternion.y,
      z: object.quaternion.z,
      w: object.quaternion.w
    }
  }
}

/**
 * 创建箭头
 */
export function createArrow(
  color = 0xff0000,
  length = 1,
  headLength = 0.2,
  headWidth = 0.1
): THREE.ArrowHelper {
  const dir = new THREE.Vector3(0, 0, 1)
  const origin = new THREE.Vector3(0, 0, 0)
  return new THREE.ArrowHelper(dir, origin, length, color, headLength, headWidth)
}

/**
 * 创建文字精灵
 */
export function createTextSprite(text: string, color = '#ffffff', fontSize = 96): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!

  // 增大画布尺寸，使文字更清晰（放大2倍）
  canvas.width = 512
  canvas.height = 256

  context.fillStyle = color
  context.font = `bold ${fontSize}px Arial` // 使用粗体使文字更清晰
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  // 添加文本描边以增强可见性
  context.strokeStyle = '#000000'
  context.lineWidth = 4
  context.strokeText(text, canvas.width / 2, canvas.height / 2)
  context.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture })
  const sprite = new THREE.Sprite(material)

  // 增大sprite尺寸，使文字更清晰可见（放大2倍）
  sprite.scale.set(4, 2, 1)

  return sprite
}

/**
 * 创建点云
 */
export function createPointCloud(
  points: Array<{ x: number; y: number; z: number }>,
  color = 0xffffff
): THREE.Points {
  const geometry = new THREE.BufferGeometry()

  const positions = new Float32Array(points.length * 3)
  points.forEach((point, i) => {
    positions[i * 3] = point.x
    positions[i * 3 + 1] = point.y
    positions[i * 3 + 2] = point.z
  })

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color,
    size: 0.05,
    sizeAttenuation: true
  })

  return new THREE.Points(geometry, material)
}

/**
 * 更新点云数据
 */
export function updatePointCloud(
  pointCloud: THREE.Points,
  points: Array<{ x: number; y: number; z: number }>
): void {
  const positions = new Float32Array(points.length * 3)
  points.forEach((point, i) => {
    positions[i * 3] = point.x
    positions[i * 3 + 1] = point.y
    positions[i * 3 + 2] = point.z
  })

  const geometry = pointCloud.geometry
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.attributes.position.needsUpdate = true
}

/**
 * 计算边界框
 */
export function computeBoundingBox(objects: THREE.Object3D[]): THREE.Box3 {
  const box = new THREE.Box3()
  objects.forEach((obj) => {
    const objBox = new THREE.Box3().setFromObject(obj)
    box.union(objBox)
  })
  return box
}

/**
 * 相机适配场景
 */
export function fitCameraToScene(
  camera: THREE.PerspectiveCamera,
  scene: THREE.Scene,
  controls?: any
): void {
  const box = new THREE.Box3().setFromObject(scene)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = camera.fov * (Math.PI / 180)
  const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2))

  camera.position.set(center.x, center.y, center.z + cameraZ * 1.5)
  camera.lookAt(center)

  if (controls) {
    controls.target.copy(center)
    controls.update()
  }
}

/**
 * 从OccupancyGrid消息创建地图平面
 */
export function createMapPlane(mapData: {
  info: {
    width: number
    height: number
    resolution: number
    origin: {
      position: { x: number; y: number; z: number }
      orientation: { x: number; y: number; z: number; w: number }
    }
  }
  data: number[]
}): THREE.Mesh {
  const { width, height, resolution, origin } = mapData.info

  // 创建画布来绘制地图
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const imageData = ctx.createImageData(width, height)
  const data = imageData.data
  const mapDataArray = mapData.data
  const dataLength = mapDataArray.length

  // 优化：使用单次循环，减少计算和内存访问
  // 将OccupancyGrid数据转换为图像（需要翻转Y轴，因为ROS地图原点在左下角，canvas原点在左上角）
  for (let i = 0; i < dataLength; i++) {
    const value = mapDataArray[i]
    let color: number

    // 优化：使用快速分支预测
    if (value === -1) {
      color = 128 // 未知
    } else if (value === 0) {
      color = 255 // 空闲
    } else if (value === 100) {
      color = 0 // 占用
    } else {
      // 概率值转换为灰度（优化：避免浮点运算）
      color = 255 - Math.floor((value * 255) / 100)
    }

    // 计算翻转后的位置
    const x = i % width
    const y = Math.floor(i / width)
    const flippedY = height - 1 - y
    const idx = (flippedY * width + x) * 4

    // 批量设置RGBA值
    data[idx] = color     // R
    data[idx + 1] = color // G
    data[idx + 2] = color // B
    data[idx + 3] = 255   // A
  }

  ctx.putImageData(imageData, 0, 0)

  // 创建纹理
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.NearestFilter

  // 创建平面几何体
  const geometry = new THREE.PlaneGeometry(width * resolution, height * resolution)

  // 创建材质
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: false
  })

  const mesh = new THREE.Mesh(geometry, material)

  // PlaneGeometry默认在xy平面（z轴向上），这正是我们需要的
  // 不需要旋转，地图直接显示在xy平面

  // 设置位置 (XY平面,Z轴向上)
  mesh.position.set(
    origin.position.x + (width * resolution) / 2,
    origin.position.y + (height * resolution) / 2,
    0.0 // 地图在xy平面，z=0
  )

  // 处理地图原点的方向（如果有旋转）
  // ROS地图的origin.orientation通常表示地图坐标系相对于世界坐标系的旋转
  // 这个旋转是在xy平面内的旋转（绕z轴）
  if (origin.orientation) {
    const originQuat = new THREE.Quaternion(
      origin.orientation.x,
      origin.orientation.y,
      origin.orientation.z,
      origin.orientation.w
    )
    // 应用地图原点的旋转（绕z轴）
    mesh.quaternion.copy(originQuat)
  } else {
    // 默认无旋转
    mesh.quaternion.set(0, 0, 0, 1)
  }

  return mesh
}

/**
 * 更新地图平面
 */
export function updateMapPlane(
  mesh: THREE.Mesh,
  mapData: {
    info: {
      width: number
      height: number
      resolution: number
      origin: {
        position: { x: number; y: number; z: number }
        orientation: { x: number; y: number; z: number; w: number }
      }
    }
    data: number[]
  }
): void {
  const { width, height, resolution, origin } = mapData.info

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const imageData = ctx.createImageData(width, height)
  const data = imageData.data
  const mapDataArray = mapData.data

  // 优化：使用相同的优化逻辑
  for (let y = 0; y < height; y++) {
    const flippedY = height - 1 - y
    const sourceRowStart = y * width
    const targetRowStart = flippedY * width * 4

    for (let x = 0; x < width; x++) {
      const value = mapDataArray[sourceRowStart + x]
      let color: number

      if (value === -1) {
        color = 128
      } else if (value === 0) {
        color = 255
      } else if (value === 100) {
        color = 0
      } else {
        color = Math.floor(255 - (value / 100) * 255)
      }

      const idx = targetRowStart + x * 4
      data[idx] = color
      data[idx + 1] = color
      data[idx + 2] = color
      data[idx + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.NearestFilter

  const material = mesh.material as THREE.MeshBasicMaterial
  if (material.map) {
    material.map.dispose()
  }
  material.map = texture
  material.needsUpdate = true

  // 更新几何体（如果尺寸发生变化）
  const newWidth = width * resolution
  const newHeight = height * resolution
  const geometry = mesh.geometry as THREE.PlaneGeometry

  // 检查是否需要重建几何体
  if (Math.abs(geometry.parameters.width - newWidth) > 0.001 ||
    Math.abs(geometry.parameters.height - newHeight) > 0.001) {
    mesh.geometry.dispose()
    mesh.geometry = new THREE.PlaneGeometry(newWidth, newHeight)
  }

  // 更新位置 (XY平面,Z轴向上)
  mesh.position.set(
    origin.position.x + newWidth / 2,
    origin.position.y + newHeight / 2,
    0.0 // 地图在xy平面，z=0
  )

  // 更新方向
  if (origin.orientation) {
    mesh.quaternion.set(
      origin.orientation.x,
      origin.orientation.y,
      origin.orientation.z,
      origin.orientation.w
    )
  } else {
    mesh.quaternion.set(0, 0, 0, 1)
  }
}
