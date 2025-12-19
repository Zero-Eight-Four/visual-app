import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RosConnectionState, RosTopic, RobotStatus } from '@/types/ros'

export const useRosStore = defineStore('ros', () => {
  // State
  const connectionState = ref<RosConnectionState>({
    connected: false,
    connecting: false,
    error: null,
    url: 'ws://localhost:9090'
  })

  const topics = ref<RosTopic[]>([])
  const selectedImageTopic = ref<string>('')
  const selectedStateTopic = ref<string>('')
  const robotStatus = ref<RobotStatus | null>(null)

  // Computed
  const isConnected = computed(() => connectionState.value.connected)
  const imageTopics = computed(() =>
    topics.value.filter(
      (t) => t.messageType.includes('Image') || t.messageType.includes('CompressedImage')
    )
  )

  // Actions
  function setConnectionState(state: Partial<RosConnectionState>) {
    connectionState.value = { ...connectionState.value, ...state }
  }

  function setTopics(topicList: RosTopic[]) {
    topics.value = topicList
  }

  function setSelectedImageTopic(topic: string) {
    selectedImageTopic.value = topic
  }

  function setSelectedStateTopic(topic: string) {
    selectedStateTopic.value = topic
  }

  function setRobotStatus(status: RobotStatus) {
    robotStatus.value = status
  }

  return {
    connectionState,
    topics,
    selectedImageTopic,
    selectedStateTopic,
    robotStatus,
    isConnected,
    imageTopics,
    setConnectionState,
    setTopics,
    setSelectedImageTopic,
    setSelectedStateTopic,
    setRobotStatus
  }
})
