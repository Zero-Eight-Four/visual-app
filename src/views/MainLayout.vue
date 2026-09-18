<template>
  <div class="main-layout">
    <!-- Top Bar -->
    <div class="top-bar">
      <ConnectionStatus />
      <div class="title">
        <img
          :src="appLogoUrl"
          alt="机器狗控制平台"
          class="app-logo"
        >
        <span class="app-title-divider" aria-hidden="true"></span>
        <span class="app-title-text">机器狗控制平台</span>
      </div>
      <TopicSelector />
    </div>

    <!-- Main Content Area -->
    <div class="content-area">
      <!-- Left Panel - 3D Visualization -->
      <div class="panel panel-3d">
        <ThreeDViewer />
      </div>

      <!-- Right Panel - Info and Controls -->
      <div class="panel-group-right">
        <!-- Image Display -->
        <div class="panel panel-image">
          <ImageViewer />
        </div>

        <!-- State Info -->
        <div class="panel panel-state">
          <StateInfo />
        </div>

        <!-- Topic Publisher -->
        <div class="panel panel-publish">
          <TopicPublisher />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ConnectionStatus from '@/components/ConnectionStatus.vue'
import TopicSelector from '@/components/TopicSelector.vue'
import ThreeDViewer from '@/components/ThreeDViewer.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import StateInfo from '@/components/StateInfo.vue'
import TopicPublisher from '@/components/TopicPublisher.vue'

const appLogoFile = import.meta.env.VITE_APP_LOGO || 'logo-placeholder.png'
const appLogoUrl = `${import.meta.env.BASE_URL}${appLogoFile}`
</script>

<style scoped>
.main-layout {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #1a1a1a;
}

.top-bar {
    height: 56px;
    background-color: #252525;
    border-bottom: 1px solid #3a3a3a;
    display: flex;
    align-items: center;
    padding: 0 20px;
    gap: 10px;
    overflow-x: auto;
    overflow-y: hidden;
}

.title {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.app-logo {
    display: block;
    width: auto;
    height: 32px;
    max-width: 240px;
    object-fit: contain;
}

.app-title-divider {
    width: 2px;
    height: 18px;
    flex: 0 0 auto;
    background-color: #6D6D6D;
}

.app-title-text {
    flex: 0 1 auto;
    min-width: 0;
    color: #404040;
    font-family: var(--app-font-family);
    font-size: 17px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
}

.content-area {
    flex: 1;
    display: flex;
    gap: 10px;
    padding: 10px;
    overflow: hidden;
}

.panel {
    background-color: #252525;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    overflow: hidden;
}

.panel-3d {
    flex: 2;
    min-width: 0;
}

.panel-group-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 400px;
}

.panel-image {
    flex: 1.5;
    min-height: 0;
}

.panel-state {
    flex: 1;
    min-height: 0;
}

.panel-publish {
    flex: 1;
    min-height: 0;
}
</style>
