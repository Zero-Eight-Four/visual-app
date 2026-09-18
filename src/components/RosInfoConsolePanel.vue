<template>
  <el-dialog
    v-model="visible"
    title="ROS Logs"
    width="88vw"
    class="ros-info-dialog"
    :append-to-body="true"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <template #header>
      <div class="dialog-title">
        <span class="dialog-title-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <div>
          <strong>ROS 运行日志</strong>
          <span>实时节点诊断中心</span>
        </div>
      </div>
    </template>

    <div class="ros-info-shell">
      <aside class="ros-info-sidebar">
        <div class="sidebar-heading">
          <span class="eyebrow">LOG SOURCES</span>
          <h3>节点筛选</h3>
          <p>从 /rosout 中选择需要追踪的程序</p>
        </div>
        <div class="ros-info-toolbar">
          <el-input
            v-model="filterText"
            size="small"
            clearable
            placeholder="搜索 ROS 节点"
          />
          <el-button size="small" class="refresh-button" @click="refreshTopics">
            刷新
          </el-button>
        </div>

        <div class="ros-source-hint">
          <span class="source-pulse"></span>
          /rosout · {{ programFilters.length }} 个已发现节点
        </div>

        <el-checkbox-group
          v-model="selectedNodeNames"
          class="ros-source-list"
          @change="handleNodeSelectionChange"
        >
          <el-checkbox
            v-for="program in visiblePrograms"
            :key="program.name"
            class="ros-source-item"
            :label="program.name"
          >
            <span class="source-name">{{ program.name }}</span>
            <span class="source-type">{{ program.count }} 条日志</span>
          </el-checkbox>
        </el-checkbox-group>
      </aside>

      <section class="ros-info-detail">
        <div class="detail-header">
          <div class="detail-heading">
            <span class="eyebrow">LIVE CONSOLE</span>
            <h3>ROS 日志输出</h3>
            <p>/rosout · {{ selectedNodeNames.length || '全部' }} 个节点 · 显示 {{ displayedLogRows.length }} 条</p>
          </div>
          <div class="detail-actions">
            <el-tag
              :type="rosStore.isConnected ? 'success' : 'danger'"
              effect="dark"
              class="connection-tag"
            >
              <span class="connection-dot"></span>
              {{ rosStore.isConnected ? '已连接' : '未连接' }}
            </el-tag>
            <el-button size="small" plain @click="clearLogs">
              清空
            </el-button>
            <el-button
              size="small"
              class="listen-button"
              :type="unsubscribeRosout ? 'danger' : 'primary'"
              @click="toggleRosoutSubscription"
            >
              {{ unsubscribeRosout ? '停止监听' : '开始监听' }}
            </el-button>
          </div>
        </div>

        <div v-if="errorText" class="ros-info-error">
          <span>!</span>
          {{ errorText }}
        </div>

        <div class="ros-info-output">
          <div class="console-bar">
            <span class="console-dots"><i></i><i></i><i></i></span>
            <span>rosout stream</span>
            <span class="console-count">{{ displayedLogRows.length }} entries</span>
          </div>
          <div v-if="displayedLogRows.length === 0" class="empty-log">
            {{ emptyText }}
          </div>
          <div
            v-for="row in displayedLogRows"
            :key="row.id"
            class="log-row"
            :class="`level-${row.levelName.toLowerCase()}`"
          >
            <span class="log-time">{{ row.time }}</span>
            <span class="log-level">{{ row.levelName }}</span>
            <span class="log-node">{{ row.name }}</span>
            <span class="log-message">{{ row.message }}</span>
          </div>
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'
import type { RosMessage } from '@/types/ros'

type ProgramFilter = {
  name: string
  count: number
}

type LogRow = {
  id: number
  time: string
  levelName: string
  name: string
  message: string
}

const MAX_LOG_ROWS = 300
const LOG_THROTTLE_MS = 500
const ROSOUT_TOPIC = '/rosout'
const ROSOUT_TYPE = 'rosgraph_msgs/Log'

const rosStore = useRosStore()

const visible = ref(false)
const filterText = ref('')
const selectedNodeNames = ref<string[]>([])
const logRows = ref<LogRow[]>([])
const logRowId = ref(0)
const errorText = ref('')
const unsubscribeRosout = ref<null | (() => void)>(null)
const observedNodeCounts = ref<Record<string, number>>({})

const programFilters = computed<ProgramFilter[]>(() => {
  return Object.entries(observedNodeCounts.value)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const visiblePrograms = computed(() => {
  const query = filterText.value.trim().toLowerCase()
  if (!query) return programFilters.value
  return programFilters.value.filter(program => program.name.toLowerCase().includes(query))
})

const displayedLogRows = computed(() => {
  if (selectedNodeNames.value.length === 0) return logRows.value
  const selected = new Set(selectedNodeNames.value)
  return logRows.value.filter(row => selected.has(row.name))
})

const emptyText = computed(() => {
  if (!rosStore.isConnected) return 'ROS is not connected'
  if (!unsubscribeRosout.value) return 'Start listening to /rosout'
  if (selectedNodeNames.value.length > 0) return 'No logs from selected programs yet'
  return 'Listening to /rosout...'
})

const levelNameByValue: Record<number, string> = {
  1: 'DEBUG',
  2: 'INFO',
  4: 'WARN',
  8: 'ERROR',
  16: 'FATAL'
}

const formatStamp = (message: RosMessage) => {
  const stamp = message?.header?.stamp
  if (stamp && typeof stamp.secs === 'number') {
    return new Date((stamp.secs * 1000) + Math.floor((stamp.nsecs || 0) / 1000000)).toLocaleTimeString()
  }
  return new Date().toLocaleTimeString()
}

const appendLog = (message: RosMessage) => {
  const level = typeof message.level === 'number' ? message.level : 2
  const nodeName = String(message.name || '-')
  const row: LogRow = {
    id: logRowId.value += 1,
    time: formatStamp(message),
    levelName: levelNameByValue[level] || String(level),
    name: nodeName,
    message: String(message.msg || JSON.stringify(message))
  }

  logRows.value = [...logRows.value, row].slice(-MAX_LOG_ROWS)
  observedNodeCounts.value = {
    ...observedNodeCounts.value,
    [nodeName]: (observedNodeCounts.value[nodeName] || 0) + 1
  }
}

const clearLogs = () => {
  logRows.value = []
}

const stopRosoutSubscription = () => {
  if (!unsubscribeRosout.value) return
  unsubscribeRosout.value()
  unsubscribeRosout.value = null
}

const toggleRosoutSubscription = async () => {
  if (unsubscribeRosout.value) {
    stopRosoutSubscription()
  } else {
    await startRosoutSubscription()
  }
}

const startRosoutSubscription = async () => {
  errorText.value = ''

  if (!visible.value) return

  if (!rosStore.isConnected) {
    stopRosoutSubscription()
    errorText.value = 'ROS is not connected'
    return
  }

  if (unsubscribeRosout.value) return

  try {
    unsubscribeRosout.value = await rosConnection.createDebugSubscription({
      topic: ROSOUT_TOPIC,
      messageType: ROSOUT_TYPE,
      throttleRate: LOG_THROTTLE_MS,
      callback: appendLog
    })
  } catch (error) {
    stopRosoutSubscription()
    errorText.value = error instanceof Error ? error.message : String(error)
  }
}

const refreshTopics = async () => {
  errorText.value = ''
  if (!rosStore.isConnected) {
    errorText.value = 'ROS is not connected'
    return
  }

  try {
    await rosStore.fetchTopics()
    await startRosoutSubscription()
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error)
  }
}

const handleNodeSelectionChange = (value: unknown) => {
  selectedNodeNames.value = Array.isArray(value) ? value.map(String) : []
}

const openPanel = async () => {
  visible.value = true
  await nextTick()
  await refreshTopics()
}

const closePanel = () => {
  visible.value = false
}

const togglePanel = () => {
  if (visible.value) {
    closePanel()
  } else {
    openPanel()
  }
}

const handleClosed = () => {
  stopRosoutSubscription()
}

const installConsoleCommand = () => {
  const command = Object.assign(() => togglePanel(), {
    open: openPanel,
    close: closePanel,
    toggle: togglePanel,
    refresh: refreshTopics,
    help: () => {
      console.info('ROS Logs commands: rosinfo(), rosinfo.open(), rosinfo.close(), rosinfo.toggle(), rosinfo.refresh()')
    }
  })

  ;(window as any).rosinfo = command
  ;(window as any).rosInfo = command
  console.info('ROS Logs console command ready: rosinfo()')
}

watch(() => rosStore.isConnected, (connected) => {
  if (!connected) {
    stopRosoutSubscription()
  } else if (visible.value) {
    refreshTopics()
  }
})

onMounted(() => {
  installConsoleCommand()
})

onUnmounted(() => {
  stopRosoutSubscription()
  if ((window as any).rosinfo) delete (window as any).rosinfo
  if ((window as any).rosInfo) delete (window as any).rosInfo
})
</script>

<style scoped>
:global(.ros-info-dialog) {
  --el-dialog-padding-primary: 0;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  background: #f8fafc;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.3);
}

:global(.ros-info-dialog .el-dialog__header) {
  margin: 0;
  padding: 18px 22px;
  border-bottom: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.88);
}

:global(.ros-info-dialog .el-dialog__headerbtn) {
  top: 20px;
  right: 20px;
}

:global(.ros-info-dialog .el-dialog__body) {
  padding: 0;
}

.dialog-title {
  display: flex;
  align-items: center;
  gap: 11px;
  color: #0f172a;
}

.dialog-title-mark,
.console-dots {
  display: flex;
  gap: 4px;
}

.dialog-title-mark {
  width: 33px;
  height: 33px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #4f46e5);
  box-shadow: 0 7px 15px rgba(37, 99, 235, 0.24);
}

.dialog-title-mark i {
  width: 3px;
  border-radius: 4px;
  background: #fff;
}

.dialog-title-mark i:nth-child(1) { height: 9px; opacity: 0.7; }
.dialog-title-mark i:nth-child(2) { height: 15px; }
.dialog-title-mark i:nth-child(3) { height: 11px; opacity: 0.85; }

.dialog-title strong,
.dialog-title span {
  display: block;
}

.dialog-title strong { font-size: 15px; letter-spacing: 0.02em; }
.dialog-title > div > span { margin-top: 2px; color: #94a3b8; font-size: 11px; }

.ros-info-shell {
  display: grid;
  grid-template-columns: minmax(280px, 29%) 1fr;
  height: min(72vh, 760px);
  min-height: 0;
  background: #f8fafc;
}

.ros-info-sidebar {
  min-width: 0;
  min-height: 0;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}

.sidebar-heading { padding: 22px 18px 15px; }
.eyebrow { color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 0.13em; }
.sidebar-heading h3,
.detail-heading h3 { margin: 5px 0 0; color: #0f172a; font-size: 16px; letter-spacing: -0.02em; }
.sidebar-heading p { margin: 5px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.45; }

.ros-info-toolbar {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 0 18px 15px;
}

.ros-info-toolbar :deep(.el-input__wrapper) { border-radius: 9px; background: #fff; box-shadow: 0 0 0 1px #e2e8f0 inset; }
.refresh-button { border-radius: 9px; }

.ros-source-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  border-block: 1px solid #e2e8f0;
  color: #64748b;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.58);
}

.source-pulse { width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.13); }

.ros-source-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
}

.ros-source-item {
  width: 100%;
  min-height: 48px;
  margin: 0;
  border-radius: 9px;
  padding: 8px 9px;
  display: flex;
  align-items: center;
}

.ros-source-item:hover {
  background: #eaf1ff;
}

.ros-source-item.is-checked { background: #eaf1ff; }
.ros-source-item :deep(.el-checkbox__input) { align-self: flex-start; margin-top: 2px; }
.ros-source-item :deep(.el-checkbox__label) {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.source-name {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.source-type {
  font-size: 11px;
  color: #94a3b8;
  overflow-wrap: anywhere;
}

.ros-info-detail {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.detail-header {
  min-height: 78px;
  padding: 14px 20px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.detail-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.detail-actions .el-button { border-radius: 8px; }
.connection-tag { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 999px; font-weight: 500; }
.connection-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.ros-info-error {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 12px 20px 0;
  padding: 9px 11px;
  border: 1px solid #fecaca;
  border-radius: 9px;
  background: #fff1f2;
  color: #b91c1c;
  font-size: 12px;
}

.ros-info-error > span { display: inline-grid; width: 16px; height: 16px; place-items: center; border-radius: 50%; background: #ef4444; color: #fff; font-weight: 700; }

.ros-info-output {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 0 10px;
  overflow-x: auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: #0f172a;
  color: #d1d5db;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
}

.console-bar { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 9px; padding: 9px 13px; border-bottom: 1px solid rgba(148, 163, 184, 0.16); background: rgba(15, 23, 42, 0.95); color: #94a3b8; font-size: 11px; backdrop-filter: blur(8px); }
.console-dots i { display: block; width: 7px; height: 7px; border-radius: 50%; background: #fb7185; }
.console-dots i:nth-child(2) { background: #fbbf24; }
.console-dots i:nth-child(3) { background: #34d399; }
.console-count { margin-left: auto; color: #64748b; }

.empty-log {
  padding: 26px 18px;
  color: #94a3b8;
}

.log-row {
  display: grid;
  grid-template-columns: 86px 58px minmax(120px, 220px) 1fr;
  gap: 10px;
  padding: 6px 14px;
  border-left: 3px solid transparent;
}

.log-row:hover {
  background: rgba(96, 165, 250, 0.09);
}

.log-time,
.log-node {
  color: #9ca3af;
  overflow-wrap: anywhere;
}

.log-level {
  font-weight: 600;
  letter-spacing: 0.03em;
}

.log-message {
  color: #e5e7eb;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.level-debug {
  border-left-color: #6b7280;
}

.level-info {
  border-left-color: #3b82f6;
}

.level-warn {
  border-left-color: #f59e0b;
}

.level-error,
.level-fatal {
  border-left-color: #ef4444;
}

.level-info .log-level { color: #60a5fa; }
.level-debug .log-level { color: #94a3b8; }

.level-warn .log-level {
  color: #fbbf24;
}

.level-error .log-level,
.level-fatal .log-level {
  color: #f87171;
}

@media (max-width: 860px) {
  .ros-info-shell {
    grid-template-columns: 1fr;
    height: 76vh;
  }

  .ros-info-sidebar {
    max-height: 260px;
    border-right: 0;
    border-bottom: 1px solid #dcdfe6;
  }

  .log-row {
    grid-template-columns: 72px 52px 1fr;
  }

  .log-node {
    display: none;
  }
}
</style>
