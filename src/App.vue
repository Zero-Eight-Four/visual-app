<template>
  <router-view />
  <RosInfoConsolePanel />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, h } from 'vue'
import { ElNotification } from 'element-plus'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'
import RosInfoConsolePanel from '@/components/RosInfoConsolePanel.vue'

// App.vue 作为根组件，使用 RouterView 加载路由页面

const rosStore = useRosStore()
const POLL_INTERVAL_MS = 2000
const SSE_CONNECT_TIMEOUT_MS = 3000

const handleConnectionChange = (connected: boolean) => {
    rosStore.setConnectionState({ connected })
}

let eventSource: EventSource | null = null
let pollTimer: number | null = null
let sseConnectTimer: number | null = null
let lastNotificationId = 0
const shownNotificationIds = new Set<number>()

const renderNotification = (data: any) => {
    if (typeof data.id === 'number') {
        lastNotificationId = Math.max(lastNotificationId, data.id)
        if (shownNotificationIds.has(data.id)) {
            return
        }
        shownNotificationIds.add(data.id)
        if (shownNotificationIds.size > 500) {
            const firstId = shownNotificationIds.values().next().value
            if (typeof firstId === 'number') {
                shownNotificationIds.delete(firstId)
            }
        }
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
}

const stopPolling = () => {
    if (pollTimer) {
        window.clearInterval(pollTimer)
        pollTimer = null
    }
}

const pollNotifications = async () => {
    try {
        const response = await fetch(`/api/notifications/poll?since=${lastNotificationId}`, {
            cache: 'no-store'
        })
        if (!response.ok) {
            throw new Error(`poll failed: ${response.status}`)
        }
        const payload = await response.json()
        const notifications = Array.isArray(payload.notifications) ? payload.notifications : []
        notifications.forEach(renderNotification)
        if (typeof payload.lastId === 'number') {
            lastNotificationId = Math.max(lastNotificationId, payload.lastId)
        }
    } catch (error) {
        console.error('Notification poll failed:', error)
    }
}

const syncNotificationBaseline = async () => {
    try {
        const response = await fetch('/api/notifications/poll?since=0', {
            cache: 'no-store'
        })
        if (!response.ok) return
        const payload = await response.json()
        if (typeof payload.lastId === 'number') {
            lastNotificationId = Math.max(lastNotificationId, payload.lastId)
        }
    } catch (error) {
        console.error('Notification baseline sync failed:', error)
    }
}

const startPolling = () => {
    if (pollTimer) return
    console.warn('SSE did not deliver messages, falling back to notification polling')
    pollNotifications()
    pollTimer = window.setInterval(pollNotifications, POLL_INTERVAL_MS)
}

onMounted(() => {
    rosConnection.onConnectionChange(handleConnectionChange)
    syncNotificationBaseline()

    // Setup SSE for notifications
    eventSource = new EventSource('/api/events')
    sseConnectTimer = window.setTimeout(startPolling, SSE_CONNECT_TIMEOUT_MS)
    
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
                if (sseConnectTimer) {
                    window.clearTimeout(sseConnectTimer)
                    sseConnectTimer = null
                }
                stopPolling()
                return
            }

            renderNotification(data)
        } catch (e) {
            console.error('Failed to parse notification:', e)
        }
    }

    eventSource.onerror = (error) => {
        console.error('SSE Error:', error)
        // Do not close, let EventSource attempt to reconnect
        startPolling()
    }

    // Store eventSource reference for cleanup
    (window as any)._notificationEventSource = eventSource
})

onUnmounted(() => {
    rosConnection.offConnectionChange(handleConnectionChange)
    stopPolling()
    if (sseConnectTimer) {
        window.clearTimeout(sseConnectTimer)
        sseConnectTimer = null
    }
    
    // Cleanup SSE
    if (eventSource) {
        eventSource.close()
        eventSource = null
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
