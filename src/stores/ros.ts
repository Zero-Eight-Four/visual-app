import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RosConnectionState, RosTopic, RobotStatus } from '@/types/ros'
import { rosConnection } from '@/services/rosConnection'

export const useRosStore = defineStore('ros', () => {
  // State
  const connectionState = ref<RosConnectionState>({
    connected: false,
    connecting: false,
    error: null,
    url: 'ws://localhost:9090'
  })

  const topics = ref<RosTopic[]>([])
  const loadingTopics = ref(false)
  const topicFetchError = ref<string | null>(null)
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

  async function fetchTopics() {
    if (!connectionState.value.connected) return

    loadingTopics.value = true
    topicFetchError.value = null
    try {
      const fetchedTopics = await rosConnection.getTopics(3, 10000) // 重试3次，每次10秒
      topics.value = fetchedTopics
    } catch (error) {
      console.error('[RosStore] Fetch topics failed:', error)
      topicFetchError.value = error instanceof Error ? error.message : String(error)
      // 即使失败，也不要清空话题，保留上次的结果（如果有）
    } finally {
      loadingTopics.value = false
    }
  }

  return {
    connectionState,
    topics,
    loadingTopics,
    topicFetchError,
    selectedImageTopic,
    selectedStateTopic,
    robotStatus,
    isConnected,
    imageTopics,
    setConnectionState,
    setTopics,
    fetchTopics,
    setSelectedImageTopic,
    setSelectedStateTopic,
    setRobotStatus
  }
})
