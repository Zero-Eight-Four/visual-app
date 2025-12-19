import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useImageSettingsStore = defineStore('imageSettings', () => {
  // State
  const selectedTopic = ref('')
  const smooth = ref(true)
  const rotation = ref(0)
  const flipHorizontal = ref(false)
  const flipVertical = ref(false)

  // Actions
  function setSelectedTopic(topic: string) {
    selectedTopic.value = topic
  }

  function setSmooth(value: boolean) {
    smooth.value = value
  }

  function setRotation(value: number) {
    rotation.value = value
  }

  function setFlipHorizontal(value: boolean) {
    flipHorizontal.value = value
  }

  function setFlipVertical(value: boolean) {
    flipVertical.value = value
  }

  return {
    selectedTopic,
    smooth,
    rotation,
    flipHorizontal,
    flipVertical,
    setSelectedTopic,
    setSmooth,
    setRotation,
    setFlipHorizontal,
    setFlipVertical
  }
})
