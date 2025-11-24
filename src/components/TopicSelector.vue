<template>
    <div class="topic-selector">
        <el-select v-model="selectedTopic" placeholder="选择摄像头" size="small" filterable clearable style="width: 250px"
            @change="handleTopicChange">
            <el-option v-for="topic in topics" :key="topic.name" :label="topic.name" :value="topic.name">
                <span>{{ topic.name }}</span>
                <span style="color: #8c8c8c; font-size: 12px; margin-left: 8px">
                    {{ topic.messageType }}
                </span>
            </el-option>
        </el-select>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElSelect, ElOption } from 'element-plus'
import { useRosStore } from '@/stores/ros'

const rosStore = useRosStore()
const selectedTopic = ref<string>('')

const topics = computed(() => rosStore.topics)

const handleTopicChange = (_value: string) => {
    // 可以根据话题类型进行不同的处理
}
</script>

<style scoped>
.topic-selector {
    display: flex;
    align-items: center;
}
</style>
