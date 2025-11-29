/**
 * 地图点击发布工具
 * 参考Lichtblick实现，支持在3D场景中点击发布Point、Pose和PoseEstimate消息
 */

import * as THREE from 'three'
import type { Point, Pose } from './threeUtils'

export type PublishClickType = 'point' | 'pose' | 'pose_estimate'
export type PublishClickState = 'idle' | 'place-first-point' | 'place-second-point'

export interface PublishClickEvent {
  type: PublishClickType
  point?: Point
  pose?: Pose
}

/**
 * 发布点击工具类
 * 用于在3D场景中通过鼠标点击生成并发布ROS消息
 */
export class PublishClickTool {
  private publishType: PublishClickType = 'point'
  private state: PublishClickState = 'idle'
  private point1?: THREE.Vector3
  private point2?: THREE.Vector3

  // 可视化对象
  private sphere?: THREE.Mesh
  private arrow?: THREE.Group
  private scene?: THREE.Scene

  // 回调函数
  private onPublishCallback?: (event: PublishClickEvent) => void
  private onStateChangeCallback?: (active: boolean) => void

  constructor(scene?: THREE.Scene) {
    this.scene = scene
    this.createVisualObjects()
  }

  /**
   * 创建可视化对象
   */
  private createVisualObjects() {
    if (!this.scene) return

    // 创建球体标记
    const sphereGeometry = new THREE.SphereGeometry(0.15, 16, 16)
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8
    })
    this.sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
    this.sphere.visible = false
    this.scene.add(this.sphere)

    // 创建箭头标记
    this.arrow = new THREE.Group()

    // 箭头轴
    const shaftGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 8)
    const shaftMaterial = new THREE.MeshBasicMaterial({
      color: this.publishType === 'pose_estimate' ? 0x00ffff : 0xff00ff
    })
    const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial)
    shaft.rotation.z = -Math.PI / 2
    shaft.position.x = 0.5

    // 箭头头部
    const headGeometry = new THREE.ConeGeometry(0.1, 0.25, 8)
    const headMaterial = new THREE.MeshBasicMaterial({
      color: this.publishType === 'pose_estimate' ? 0x00ffff : 0xff00ff
    })
    const head = new THREE.Mesh(headGeometry, headMaterial)
    head.rotation.z = -Math.PI / 2
    head.position.x = 1.125

    this.arrow.add(shaft)
    this.arrow.add(head)
    this.arrow.visible = false
    this.scene.add(this.arrow)
  }

  /**
   * 设置场景
   */
  setScene(scene: THREE.Scene) {
    // 从旧场景移除
    if (this.scene && this.sphere) {
      this.scene.remove(this.sphere)
      this.scene.remove(this.arrow!)
    }

    this.scene = scene
    this.createVisualObjects()
  }

  /**
   * 设置发布类型
   */
  setPublishType(type: PublishClickType) {
    this.publishType = type

    // 更新箭头颜色
    if (this.arrow) {
      const color = type === 'pose_estimate' ? 0x00ffff : 0xff00ff
      this.arrow.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          ;(child.material as THREE.MeshBasicMaterial).color.setHex(color)
        }
      })
    }
  }

  /**
   * 获取当前发布类型
   */
  getPublishType(): PublishClickType {
    return this.publishType
  }

  /**
   * 开始发布流程
   */
  start() {
    this.setState('place-first-point')
  }

  /**
   * 停止发布流程
   */
  stop() {
    this.setState('idle')
  }

  /**
   * 获取当前状态
   */
  isActive(): boolean {
    return this.state !== 'idle'
  }

  /**
   * 设置状态
   */
  private setState(state: PublishClickState) {
    this.state = state

    if (state === 'idle') {
      this.point1 = undefined
      this.point2 = undefined
      this.onStateChangeCallback?.(false)
    } else if (state === 'place-first-point') {
      this.onStateChangeCallback?.(true)
    }

    this.render()
  }

  /**
   * 处理鼠标移动
   */
  handleMouseMove(worldPoint: THREE.Vector3 | null) {
    if (!worldPoint) return

    // 确保地图在xy平面：将z坐标设置为0
    const pointOnPlane = new THREE.Vector3(worldPoint.x, worldPoint.y, 0)

    switch (this.state) {
      case 'place-first-point':
        this.point1 = pointOnPlane.clone()
        break
      case 'place-second-point':
        this.point2 = pointOnPlane.clone()
        break
    }

    this.render()
  }

  /**
   * 处理鼠标点击
   */
  handleClick(worldPoint: THREE.Vector3 | null) {
    if (!worldPoint) return

    // 确保地图在xy平面：将z坐标设置为0
    const pointOnPlane = new THREE.Vector3(worldPoint.x, worldPoint.y, 0)

    switch (this.state) {
      case 'place-first-point':
        this.point1 = pointOnPlane.clone()

        if (this.publishType === 'point') {
          // 点击一次即可发布Point
          this.publishPoint(this.point1)
          this.setState('idle')
        } else {
          // Pose和PoseEstimate需要第二次点击确定方向
          this.setState('place-second-point')
        }
        break

      case 'place-second-point':
        this.point2 = pointOnPlane.clone()

        if (this.point1) {
          this.publishPose(this.point1, this.point2)
        }

        this.setState('idle')
        break
    }

    this.render()
  }

  /**
   * 发布Point消息
   */
  private publishPoint(point: THREE.Vector3) {
    // 确保地图在xy平面：将z坐标设置为0
    this.onPublishCallback?.({
      type: 'point',
      point: {
        x: point.x,
        y: point.y,
        z: 0  // 确保z坐标为0，地图在xy平面
      }
    })
  }

  /**
   * 发布Pose消息
   */
  private publishPose(point1: THREE.Vector3, point2: THREE.Vector3) {
    // 确保地图在xy平面：将z坐标设置为0
    const p1 = new THREE.Vector3(point1.x, point1.y, 0)
    const p2 = new THREE.Vector3(point2.x, point2.y, 0)
    
    // 计算方向向量（投影到xy平面）
    const direction = new THREE.Vector3().subVectors(p2, p1)
    
    // 如果方向向量长度为0（两点重合），使用默认方向（x轴正方向，0度）
    let yaw = 0
    if (direction.length() < 0.001) {
      yaw = 0  // 默认朝向x轴正方向
    } else {
      // 归一化方向向量
      direction.normalize()
      
      // 计算yaw角（绕z轴的旋转角度）
      // atan2(y, x) 返回从x轴正方向到向量的角度
      yaw = Math.atan2(direction.y, direction.x)
    }
    
    // 创建只绕z轴旋转的四元数（确保qx=0, qy=0，只有qz和qw有值）
    // 绕z轴旋转yaw角度的四元数：(0, 0, sin(yaw/2), cos(yaw/2))
    const halfYaw = yaw * 0.5
    const quaternion = new THREE.Quaternion(
      0,  // qx = 0，没有绕x轴旋转
      0,  // qy = 0，没有绕y轴旋转
      Math.sin(halfYaw),  // qz
      Math.cos(halfYaw)   // qw
    )

    this.onPublishCallback?.({
      type: this.publishType,
      pose: {
        position: {
          x: p1.x,
          y: p1.y,
          z: 0  // 确保z坐标为0，地图在xy平面
        },
        orientation: {
          x: quaternion.x,
          y: quaternion.y,
          z: quaternion.z,
          w: quaternion.w
        }
      }
    })
  }

  /**
   * 渲染可视化对象
   */
  private render() {
    if (!this.sphere || !this.arrow) return

    if (this.publishType === 'point') {
      // Point模式显示球体
      this.arrow.visible = false
      if (this.point1) {
        this.sphere.visible = true
        // 确保球体显示在xy平面（z=0）
        this.sphere.position.set(this.point1.x, this.point1.y, 0)
      } else {
        this.sphere.visible = false
      }
    } else {
      // Pose模式显示箭头
      this.sphere.visible = false
      if (this.point1) {
        this.arrow.visible = true
        // 确保箭头显示在xy平面（z=0）
        this.arrow.position.set(this.point1.x, this.point1.y, 0)

        if (this.point2) {
          // 确保地图在xy平面：将z坐标设置为0
          const p1 = new THREE.Vector3(this.point1.x, this.point1.y, 0)
          const p2 = new THREE.Vector3(this.point2.x, this.point2.y, 0)
          const direction = new THREE.Vector3().subVectors(p2, p1)
          
          // 计算yaw角（绕z轴的旋转角度）
          let yaw = 0
          if (direction.length() < 0.001) {
            yaw = 0  // 默认朝向x轴正方向
          } else {
            direction.normalize()
            yaw = Math.atan2(direction.y, direction.x)
          }
          
          // 创建只绕z轴旋转的四元数
          const halfYaw = yaw * 0.5
          const quaternion = new THREE.Quaternion(
            0,  // qx = 0
            0,  // qy = 0
            Math.sin(halfYaw),  // qz
            Math.cos(halfYaw)   // qw
          )
          this.arrow.quaternion.copy(quaternion)
        } else {
          this.arrow.quaternion.set(0, 0, 0, 1)
        }
      } else {
        this.arrow.visible = false
      }
    }
  }

  /**
   * 设置发布回调
   */
  onPublish(callback: (event: PublishClickEvent) => void) {
    this.onPublishCallback = callback
  }

  /**
   * 设置状态变化回调
   */
  onStateChange(callback: (active: boolean) => void) {
    this.onStateChangeCallback = callback
  }

  /**
   * 清理资源
   */
  dispose() {
    if (this.scene && this.sphere) {
      this.scene.remove(this.sphere)
      this.sphere.geometry.dispose()
      ;(this.sphere.material as THREE.Material).dispose()
    }

    if (this.scene && this.arrow) {
      this.scene.remove(this.arrow)
      this.arrow.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          ;(child.material as THREE.Material).dispose()
        }
      })
    }
  }
}
