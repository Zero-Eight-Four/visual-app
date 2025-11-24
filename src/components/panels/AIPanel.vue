<template>
    <div class="ai-panel">
        <div class="panel-placeholder">
            <el-icon :size="64" color="#999">
                <Avatar />
            </el-icon>
            <p>AI识别面板</p>
            <p class="placeholder-text">功能开发中...</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ElIcon } from 'element-plus'
import { Avatar } from '@element-plus/icons-vue'
</script>

<style scoped>
.ai-panel {
    width: 100%;
    height: 100%;
    background-color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
}

.panel-placeholder {
    text-align: center;
    color: #999;
}

.panel-placeholder p {
    font-size: 16px;
    margin-top: 16px;
}

.placeholder-text {
    font-size: 14px;
    color: #ccc;
}
</style>
