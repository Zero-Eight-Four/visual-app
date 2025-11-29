/**
 * ROS 消息发布工具函数
 */

import type { Point, Pose } from './threeUtils'

/**
 * 创建协方差数组
 */
export function makeCovarianceArray(xDev: number, yDev: number, thetaDev: number): number[] {
  const covariance = new Array(36).fill(0)
  // x variance
  covariance[0] = xDev * xDev
  // y variance
  covariance[7] = yDev * yDev
  // theta variance (yaw)
  covariance[35] = thetaDev * thetaDev
  return covariance
}

/**
 * 创建Point消息
 * 对应 Python 文件中的 /clicked_point 话题
 * 消息类型: geometry_msgs/PointStamped
 * Python 处理: cb_click 接收 msg.point.x, msg.point.y, msg.point.z
 */
export function makePointMessage(point: Point, frameId: string): any {
  const now = new Date()
  return {
    header: {
      stamp: {
        sec: Math.floor(now.getTime() / 1000),
        nsec: (now.getTime() % 1000) * 1000000
      },
      frame_id: frameId
    },
    point: {
      x: point.x,
      y: point.y,
      z: point.z || 0.0
    }
  }
}

/**
 * 创建Pose消息 (用于导航目标)
 * 对应 Python 文件中的 /goal_queue/add_pose 话题
 * 消息类型: geometry_msgs/PoseStamped
 * Python 处理: cb_add_pose 接收 msg.pose.position 和 msg.pose.orientation
 */
export function makePoseMessage(pose: Pose, frameId: string): any {
  const now = new Date()
  return {
    header: {
      stamp: {
        sec: Math.floor(now.getTime() / 1000),
        nsec: (now.getTime() % 1000) * 1000000
      },
      frame_id: frameId
    },
    pose: {
      position: {
        x: pose.position.x,
        y: pose.position.y,
        z: pose.position.z || 0.0
      },
      orientation: {
        x: pose.orientation.x,
        y: pose.orientation.y,
        z: pose.orientation.z,
        w: pose.orientation.w
      }
    }
  }
}

/**
 * 创建PoseEstimate消息 (用于初始位姿估计)
 */
export function makePoseEstimateMessage(
  pose: Pose,
  frameId: string,
  xDev: number,
  yDev: number,
  thetaDev: number
): any {
  const now = new Date()
  return {
    header: {
      stamp: {
        sec: Math.floor(now.getTime() / 1000),
        nsec: (now.getTime() % 1000) * 1000000
      },
      frame_id: frameId
    },
    pose: {
      pose: {
        position: pose.position,
        orientation: pose.orientation
      },
      covariance: makeCovarianceArray(xDev, yDev, thetaDev)
    }
  }
}
