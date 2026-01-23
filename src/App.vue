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
                duration: 10000,
                position: 'bottom-right',
                customClass: 'notification-custom-style',
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

/* 自定义通知样式 */
.notification-custom-style {
    width: 450px !important;
}
</style>
