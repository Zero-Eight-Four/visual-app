import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PublishClickType } from '@/utils/PublishClickTool'

export type ViewMode = '2d' | '3d'

export const use3DSettingsStore = defineStore('threeDSettings', () => {
  // State
  const showGrid = ref(false)
  const showAxes = ref(false)
  const backgroundColor = ref('#f0f0f0')
  const visibleTopics = ref<string[]>([])
  const viewMode = ref<ViewMode>('2d')

  // Publish settings
  const publishType = ref<PublishClickType>('pose_estimate')
  const publishPointTopic = ref('/clicked_point')
  const publishPoseTopic = ref('/goal_queue/add_pose')
  const publishPoseEstimateTopic = ref('/initialpose')
  const poseEstimateXDeviation = ref(0.5)
  const poseEstimateYDeviation = ref(0.5)
  const poseEstimateThetaDeviation = ref(Math.round((Math.PI / 12) * 100) / 100)

  // Actions
  function setShowGrid(value: boolean) {
    showGrid.value = value
  }

  function setShowAxes(value: boolean) {
    showAxes.value = value
  }

  function setBackgroundColor(color: string) {
    backgroundColor.value = color
  }

  function toggleTopicVisibility(topic: string) {
    const index = visibleTopics.value.indexOf(topic)
    if (index > -1) {
      visibleTopics.value.splice(index, 1)
    } else {
      visibleTopics.value.push(topic)
    }
  }

  function setVisibleTopics(topics: string[]) {
    visibleTopics.value = topics
  }

  function setViewMode(mode: ViewMode) {
    viewMode.value = mode
  }

  function setPublishType(type: PublishClickType) {
    publishType.value = type
  }

  function setPublishPointTopic(topic: string) {
    publishPointTopic.value = topic
  }

  function setPublishPoseTopic(topic: string) {
    publishPoseTopic.value = topic
  }

  function setPublishPoseEstimateTopic(topic: string) {
    publishPoseEstimateTopic.value = topic
  }

  function setPoseEstimateDeviations(x: number, y: number, theta: number) {
    poseEstimateXDeviation.value = x
    poseEstimateYDeviation.value = y
    poseEstimateThetaDeviation.value = theta
  }

  return {
    showGrid,
    showAxes,
    backgroundColor,
    visibleTopics,
    viewMode,
    publishType,
    publishPointTopic,
    publishPoseTopic,
    publishPoseEstimateTopic,
    poseEstimateXDeviation,
    poseEstimateYDeviation,
    poseEstimateThetaDeviation,
    setShowGrid,
    setShowAxes,
    setBackgroundColor,
    toggleTopicVisibility,
    setVisibleTopics,
    setViewMode,
    setPublishType,
    setPublishPointTopic,
    setPublishPoseTopic,
    setPublishPoseEstimateTopic,
    setPoseEstimateDeviations
  }
})
