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
export function createTextSprite(text: string, color = '#ffffff', fontSize = 48): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!

  canvas.width = 256
  canvas.height = 128

  context.fillStyle = color
  context.font = `${fontSize}px Arial`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture })
  const sprite = new THREE.Sprite(material)

  sprite.scale.set(2, 1, 1)

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

  // 将OccupancyGrid数据转换为图像（需要翻转Y轴，因为ROS地图原点在左下角，canvas原点在左上角）
  for (let i = 0; i < mapData.data.length; i++) {
    const value = mapData.data[i]
    let color = 128 // 未知区域为灰色

    if (value === -1) {
      color = 128 // 未知
    } else if (value === 0) {
      color = 255 // 空闲区域为白色
    } else if (value === 100) {
      color = 0 // 占用区域为黑色
    } else {
      // 概率值转换为灰度
      color = Math.floor(255 - (value / 100) * 255)
    }

    // 翻转Y轴：ROS地图是从下到上，canvas是从上到下
    const x = i % width
    const y = Math.floor(i / width)
    const flippedY = height - 1 - y
    const idx = (flippedY * width + x) * 4

    imageData.data[idx] = color
    imageData.data[idx + 1] = color
    imageData.data[idx + 2] = color
    imageData.data[idx + 3] = 255
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

  // 设置位置 (XY平面,Z轴向上)
  mesh.position.set(
    origin.position.x + (width * resolution) / 2,
    origin.position.y + (height * resolution) / 2,
    0.01 // 稍微抬高避免z-fighting
  )

  // 不需要旋转,保持在XY平面
  // mesh.rotation.x = -Math.PI / 2

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
    }
    data: number[]
  }
): void {
  const { width, height } = mapData.info

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const imageData = ctx.createImageData(width, height)

  for (let i = 0; i < mapData.data.length; i++) {
    const value = mapData.data[i]
    let color = 128

    if (value === -1) {
      color = 128
    } else if (value === 0) {
      color = 255
    } else if (value === 100) {
      color = 0
    } else {
      color = Math.floor(255 - (value / 100) * 255)
    }

    // 翻转Y轴：ROS地图是从下到上，canvas是从上到下
    const x = i % width
    const y = Math.floor(i / width)
    const flippedY = height - 1 - y
    const idx = (flippedY * width + x) * 4

    imageData.data[idx] = color
    imageData.data[idx + 1] = color
    imageData.data[idx + 2] = color
    imageData.data[idx + 3] = 255
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
}
