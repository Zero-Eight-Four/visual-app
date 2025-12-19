<template>
    <div class="main-layout">
        <!-- Top Bar -->
        <div class="top-bar">
            <ConnectionStatus />
            <div class="title">机器狗控制平台</div>
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
    height: 50px;
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
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    flex: 1;
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
