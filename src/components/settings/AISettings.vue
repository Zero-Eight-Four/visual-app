<template>
    <div class="settings-panel">
        <el-form label-position="top" size="small">
            <div class="settings-section">
                <h4 class="section-title">
                    AI识别设置
                </h4>
                <div class="placeholder-info">
                    功能开发中...
                </div>
            </div>
        </el-form>
    </div>
</template>

<script setup lang="ts">
import { ElForm } from 'element-plus'
</script>

<style scoped>
.settings-panel {
    width: 100%;
}

.settings-section {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #f0f0f0;
}

.section-title {
    margin: 0 0 12px 0;
    font-size: 13px;
    font-weight: 600;
    color: #333;
}

.placeholder-info {
    padding: 20px;
    text-align: center;
    color: #999;
    font-size: 14px;
}
</style>
