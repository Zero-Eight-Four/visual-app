import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PublishClickType } from '@/utils/PublishClickTool'

export type ViewMode = '2d' | '3d'
export type MapLabel = 'floor1' | 'floor2' | 'map'

export const MAP_TOPIC_BY_LABEL: Record<MapLabel, string> = {
  floor1: '/map1',
  floor2: '/map2',
  map: '/map'
}

export const MAP_ID_BY_LABEL: Record<MapLabel, 0 | 1 | 2> = {
  floor1: 1,
  floor2: 2,
  map: 0
}

export const FRAME_ID_BY_LABEL: Record<MapLabel, string> = {
  floor1: 'floor1',
  floor2: 'floor2',
  map: 'map'
}

export const QUEUE_POSE_TOPIC_BY_LABEL: Record<MapLabel, string> = {
  floor1: '/goal_queue/add_pose1',
  floor2: '/goal_queue/add_pose2',
  map: '/goal_queue/add_pose'
}

export const use3DSettingsStore = defineStore('threeDSettings', () => {
  // State
  const showGrid = ref(false)
  const showAxes = ref(false)
  const backgroundColor = ref('#f0f0f0')
  const visibleTopics = ref<string[]>([])
  const viewMode = ref<ViewMode>('2d')
  const selectedMapLabel = ref<MapLabel>('floor1')
  const activeMapLabel = ref<MapLabel>('map')
  const multiFloorMapsReady = ref(false)

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

  function setSelectedMapLabel(label: MapLabel) {
    selectedMapLabel.value = label
  }

  function setActiveMapLabel(label: MapLabel) {
    activeMapLabel.value = label
  }

  function setMultiFloorMapsReady(value: boolean) {
    multiFloorMapsReady.value = value
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
    selectedMapLabel,
    activeMapLabel,
    multiFloorMapsReady,
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
    setSelectedMapLabel,
    setActiveMapLabel,
    setMultiFloorMapsReady,
    setPublishType,
    setPublishPointTopic,
    setPublishPoseTopic,
    setPublishPoseEstimateTopic,
    setPoseEstimateDeviations
  }
})
