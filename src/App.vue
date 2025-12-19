<template>
    <router-view />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'

// App.vue 作为根组件，使用 RouterView 加载路由页面

const rosStore = useRosStore()

const handleConnectionChange = (connected: boolean) => {
    rosStore.setConnectionState({ connected })
}

onMounted(() => {
    rosConnection.onConnectionChange(handleConnectionChange)
})

onUnmounted(() => {
    rosConnection.offConnectionChange(handleConnectionChange)
})
</script>

<style>
#app {
    width: 100%;
    height: 100vh;
    margin: 0;
    padding: 0;
    overflow: hidden;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}
</style>
