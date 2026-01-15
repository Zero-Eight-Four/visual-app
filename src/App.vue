<template>
    <router-view />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, h } from 'vue'
import { ElNotification } from 'element-plus'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'

// App.vue 作为根组件，使用 RouterView 加载路由页面

const rosStore = useRosStore()

const handleConnectionChange = (connected: boolean) => {
    rosStore.setConnectionState({ connected })
}

onMounted(() => {
    rosConnection.onConnectionChange(handleConnectionChange)

    // Setup SSE for notifications
    const eventSource = new EventSource('/api/events')
    
    eventSource.onopen = () => {
        console.log('SSE Connection opened')
    }

    eventSource.onmessage = (event) => {
        console.log('SSE Message received:', event.data)
        try {
            const data = JSON.parse(event.data)
            // Ignore initial connection message
            if (data.type === 'connected') {
                console.log('SSE Connected message received')
                return
            }

            console.log('Showing notification:', data)

            // Construct message content (support image)
            const messageContent = data.imageUrl ? h('div', null, [
                h('img', { 
                    src: data.imageUrl, 
                    style: 'width: 100%; max-height: 600px; object-fit: contain; margin-bottom: 8px; border-radius: 4px; display: block;' 
                }),
                h('div', { style: 'word-break: break-all; font-size: 16px;' }, data.message || '')
            ]) : (data.message || JSON.stringify(data))

            ElNotification({
                title: data.title || '系统通知',
                message: messageContent,
                type: data.type || 'info',
                duration: 0, // 不自动消失
                position: 'top-right', // 默认位置，会被 CSS 覆盖
                customClass: 'notification-center-override', // 自定义类名用于居中
                zIndex: 9999 // Force high z-index
            })
        } catch (e) {
            console.error('Failed to parse notification:', e)
        }
    }

    eventSource.onerror = (error) => {
        console.error('SSE Error:', error)
        // Do not close, let EventSource attempt to reconnect
    }

    // Store eventSource reference for cleanup
    (window as any)._notificationEventSource = eventSource
})

onUnmounted(() => {
    rosConnection.offConnectionChange(handleConnectionChange)
    
    // Cleanup SSE
    if ((window as any)._notificationEventSource) {
        ((window as any)._notificationEventSource as EventSource).close()
    }
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

/* 强制通知居中显示 */
.notification-center-override {
    width: 800px !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%);
    margin: 0 !important;
    right: auto !important;
    bottom: auto !important;
}
</style>
