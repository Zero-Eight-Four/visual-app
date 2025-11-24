<template>
    <div class="publish-settings">
        <el-scrollbar height="100%">
            <div class="settings-content">
                <el-form label-width="120px" size="small">
                    <!-- 发布类型选择 -->
                    <el-form-item label="发布类型">
                        <el-select v-model="publishType" @change="handleTypeChange">
                            <el-option label="发布当前位姿" value="pose_estimate" />
                            <el-option label="发布目标位姿" value="pose" />
                            <el-option label="发布点" value="point" />
                        </el-select>
                    </el-form-item>

                    <!-- 发布点设置 -->
                    <template v-if="publishType === 'point'">
                        <el-form-item label="发布话题">
                            <el-input v-model="pointTopic" placeholder="/clicked_point" />
                        </el-form-item>
                        <el-alert title="点击地图发布点坐标" type="info" :closable="false" style="margin-bottom: 12px" />
                    </template>

                    <!-- 发布目标位姿设置 -->
                    <template v-if="publishType === 'pose'">
                        <el-form-item label="发布话题">
                            <el-input v-model="poseTopic" placeholder="/move_base_simple/goal" />
                        </el-form-item>
                        <el-alert title="点击两次设置导航目标：第一次设置位置，第二次设置方向" type="info" :closable="false"
                            style="margin-bottom: 12px" />
                    </template>

                    <!-- 发布当前位姿设置 -->
                    <template v-if="publishType === 'pose_estimate'">
                        <el-form-item label="发布话题">
                            <el-input v-model="poseEstimateTopic" placeholder="/initialpose" />
                        </el-form-item>

                        <el-divider content-position="left">协方差设置</el-divider>

                        <el-form-item label="X 标准差">
                            <el-input-number v-model="xDeviation" :min="0" :max="10" :step="0.1" :precision="2"
                                style="width: 100%" />
                        </el-form-item>

                        <el-form-item label="Y 标准差">
                            <el-input-number v-model="yDeviation" :min="0" :max="10" :step="0.1" :precision="2"
                                style="width: 100%" />
                        </el-form-item>

                        <el-form-item label="Theta 标准差">
                            <el-input-number v-model="thetaDeviation" :min="0" :max="3.14" :step="0.01" :precision="2"
                                style="width: 100%" />
                        </el-form-item>

                        <el-alert title="点击两次设置初始位姿：第一次设置位置，第二次设置朝向" type="info" :closable="false"
                            style="margin-bottom: 12px" />
                    </template>

                    <el-divider />

                    <!-- 使用说明 -->
                    <div class="help-section">
                        <h4>使用说明</h4>
                        <ol>
                            <li>从工具栏选择发布类型</li>
                            <li>在地图上点击以发布消息</li>
                            <li>发布点: 点击一次发布点坐标</li>
                            <li>发布位姿: 点击两次设置位置和方向</li>
                        </ol>
                    </div>
                </el-form>
            </div>
        </el-scrollbar>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
    ElForm,
    ElFormItem,
    ElSelect,
    ElOption,
    ElInput,
    ElInputNumber,
    ElScrollbar,
    ElDivider,
    ElAlert
} from 'element-plus'
import { use3DSettingsStore } from '@/stores/threeDSettings'

const settingsStore = use3DSettingsStore()

const publishType = computed({
    get: () => settingsStore.publishType,
    set: (val) => settingsStore.setPublishType(val)
})

const pointTopic = computed({
    get: () => settingsStore.publishPointTopic,
    set: (val) => settingsStore.setPublishPointTopic(val)
})

const poseTopic = computed({
    get: () => settingsStore.publishPoseTopic,
    set: (val) => settingsStore.setPublishPoseTopic(val)
})

const poseEstimateTopic = computed({
    get: () => settingsStore.publishPoseEstimateTopic,
    set: (val) => settingsStore.setPublishPoseEstimateTopic(val)
})

const xDeviation = computed({
    get: () => settingsStore.poseEstimateXDeviation,
    set: (val) => {
        settingsStore.setPoseEstimateDeviations(
            val,
            settingsStore.poseEstimateYDeviation,
            settingsStore.poseEstimateThetaDeviation
        )
    }
})

const yDeviation = computed({
    get: () => settingsStore.poseEstimateYDeviation,
    set: (val) => {
        settingsStore.setPoseEstimateDeviations(
            settingsStore.poseEstimateXDeviation,
            val,
            settingsStore.poseEstimateThetaDeviation
        )
    }
})

const thetaDeviation = computed({
    get: () => settingsStore.poseEstimateThetaDeviation,
    set: (val) => {
        settingsStore.setPoseEstimateDeviations(
            settingsStore.poseEstimateXDeviation,
            settingsStore.poseEstimateYDeviation,
            val
        )
    }
})

const handleTypeChange = () => {
    // 类型变化时可以做一些额外处理
}
</script>

<style scoped>
.publish-settings {
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.settings-content {
    padding: 16px;
}

.help-section {
    margin-top: 16px;
    padding: 12px;
    background-color: #f5f5f5;
    border-radius: 4px;
}

.help-section h4 {
    margin: 0 0 8px 0;
    font-size: 13px;
    color: #333;
}

.help-section ol {
    margin: 0;
    padding-left: 20px;
    font-size: 12px;
    color: #666;
}

.help-section li {
    margin-bottom: 4px;
}
</style>
