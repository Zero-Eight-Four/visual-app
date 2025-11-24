<template>
    <div class="topic-publisher">
        <div class="publisher-header">
            <h3>话题发布</h3>
        </div>
        <div class="publisher-content">
            <el-scrollbar height="100%">
                <div class="form-section">
                    <el-form :model="publishForm" label-width="80px" size="small">
                        <el-form-item label="话题名称">
                            <el-input v-model="publishForm.topic" placeholder="/example_topic" />
                        </el-form-item>

                        <el-form-item label="消息类型">
                            <el-input v-model="publishForm.messageType" placeholder="std_msgs/String" />
                        </el-form-item>

                        <el-form-item label="消息内容">
                            <el-input v-model="publishForm.message" type="textarea" :rows="8"
                                placeholder='{"data": "Hello ROS"}' />
                        </el-form-item>

                        <el-form-item>
                            <el-button type="primary" @click="handlePublish" :disabled="!canPublish"
                                style="width: 100%">
                                发布消息
                            </el-button>
                        </el-form-item>
                    </el-form>
                </div>

                <div v-if="publishHistory.length > 0" class="history-section">
                    <h4>发布历史</h4>
                    <div v-for="(item, index) in publishHistory" :key="index" class="history-item">
                        <div class="history-header">
                            <span class="topic-name">{{ item.topic }}</span>
                            <span class="timestamp">{{ item.timestamp }}</span>
                        </div>
                        <div class="message-preview">{{ item.messagePreview }}</div>
                    </div>
                </div>
            </el-scrollbar>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
    ElForm,
    ElFormItem,
    ElInput,
    ElButton,
    ElScrollbar,
    ElMessage
} from 'element-plus'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'

interface PublishForm {
    topic: string
    messageType: string
    message: string
}

interface HistoryItem {
    topic: string
    timestamp: string
    messagePreview: string
}

const rosStore = useRosStore()

const publishForm = ref<PublishForm>({
    topic: '',
    messageType: 'std_msgs/String',
    message: '{"data": "Hello ROS"}'
})

const publishHistory = ref<HistoryItem[]>([])

const canPublish = computed(() =>
    rosStore.isConnected &&
    publishForm.value.topic &&
    publishForm.value.messageType &&
    publishForm.value.message
)

const handlePublish = async () => {
    try {
        // 解析JSON消息
        const message = JSON.parse(publishForm.value.message)

        // 发布消息
        await rosConnection.publish(
            publishForm.value.topic,
            publishForm.value.messageType,
            message
        )

        // 添加到历史记录
        publishHistory.value.unshift({
            topic: publishForm.value.topic,
            timestamp: new Date().toLocaleTimeString(),
            messagePreview: publishForm.value.message.substring(0, 50) + '...'
        })

        // 限制历史记录数量
        if (publishHistory.value.length > 10) {
            publishHistory.value = publishHistory.value.slice(0, 10)
        }

        ElMessage.success('消息发布成功')
    } catch (error) {
        ElMessage.error('发布失败: ' + (error instanceof Error ? error.message : '未知错误'))
    }
}
</script>

<style scoped>
.topic-publisher {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.publisher-header {
    padding: 10px 15px;
    background-color: #2a2a2a;
    border-bottom: 1px solid #3a3a3a;
}

.publisher-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
}

.publisher-content {
    flex: 1;
    overflow: hidden;
}

.form-section {
    padding: 15px;
}

.history-section {
    padding: 15px;
    border-top: 1px solid #3a3a3a;
}

.history-section h4 {
    margin: 0 0 10px 0;
    font-size: 13px;
    color: #909399;
}

.history-item {
    padding: 10px;
    margin-bottom: 8px;
    background-color: #1a1a1a;
    border-radius: 4px;
    border: 1px solid #3a3a3a;
}

.history-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 5px;
}

.topic-name {
    font-size: 13px;
    color: #409eff;
    font-weight: 500;
}

.timestamp {
    font-size: 12px;
    color: #909399;
}

.message-preview {
    font-size: 12px;
    color: #c0c4cc;
    font-family: monospace;
}
</style>
