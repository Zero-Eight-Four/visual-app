import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createRequire } from 'node:module'
import * as vue from 'vue'
import * as pinia from 'pinia'

const require = createRequire(import.meta.url)
// Exercise installed ROSLIB itself so protocol queues and subscriptions are real.
const ROSLIB = require('roslib/src/core')

function harness() {
  let now = 0
  let nextId = 0
  const timers = new Map()
  const listeners = new Map()
  const sockets = []
  class Socket {
    static CLOSED = 3
    readyState = 0
    sent = []
    handlers = new Map()
    constructor(url) { this.url = url; sockets.push(this) }
    addEventListener(name, fn) { this.handlers.set(name, fn) }
    removeEventListener(name) { this.handlers.delete(name) }
    open() { this.readyState = 1; this.onopen?.({}) }
    send(data) {
      if (this.readyState !== 1) throw new Error('Socket closed')
      this.sent.push(JSON.parse(data))
    }
    receive(message) {
      this.handlers.get('message')?.({ data: JSON.stringify(message) })
      this.onmessage?.({ data: JSON.stringify(message) })
    }
    close() {
      if (this.readyState === 3) return
      this.readyState = 3
      this.onclose?.({ code: 1006, reason: 'test transport loss', wasClean: false })
    }
  }
  const schedule = (fn, delay, interval = false) => {
    const id = ++nextId
    timers.set(id, { fn, at: now + delay, interval, delay })
    return id
  }
  const document = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn) }
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {}, debug() {} }, document,
    window: { addEventListener: (name, fn) => listeners.set(name, fn) },
    URL, Date: class extends Date { static now() { return now } },
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    setTimeout: (fn, delay) => schedule(fn, delay),
    setInterval: (fn, delay) => schedule(fn, delay, true),
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id)
  })
  const source = readFileSync(new URL('../src/services/rosConnection.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText
    .replace("await import('roslib')", 'globalThis.testRoslib')
    .replace('export const rosConnection', 'globalThis.rosConnection')
  const rosRequire = createRequire(require.resolve('roslib/src/core/Ros.js'))
  const rosModule = { exports: {} }
  vm.runInNewContext(readFileSync(require.resolve('roslib/src/core/Ros.js'), 'utf8'), {
    require: name => name === 'ws' ? Socket : rosRequire(name), module: rosModule
  })
  context.testRoslib = { ...ROSLIB, Ros: rosModule.exports }
  vm.runInContext(code, context)
  const connection = context.rosConnection
  async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve() }
  async function advance(ms) {
    const end = now + ms
    for (;;) {
      const pending = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!pending) break
      const [id, timer] = pending
      now = timer.at
      if (timer.interval) timer.at += timer.delay
      else timers.delete(id)
      timer.fn()
      await flush()
    }
    now = end
    await flush()
  }
  async function connect(config = {}) {
    const promise = connection.connect({ url: 'ws://robot:9090', ...config })
    await flush()
    sockets.at(-1).open()
    await promise
  }
  return { connection, sockets, connect, advance, flush, listeners, document, timers, clock: context }
}

test('unexpected close reconnects and restores each keyed subscriber once', async () => {
  const h = harness()
  await h.connect()
  let messages = 0
  await h.connection.subscribe({ topic: '/status', messageType: 'std_msgs/String', key: 'panel', callback: () => messages++ })
  h.sockets[0].close()
  await h.advance(2000)
  assert.equal(h.sockets.length, 2, 'an unexpected close must create a replacement connection')
  h.sockets[1].open()
  await h.flush()
  assert.equal(h.connection.isConnected(), true)
  assert.equal(h.sockets[1].sent.filter(m => m.op === 'subscribe' && m.topic === '/status').length, 1)
  h.sockets[1].receive({ op: 'publish', topic: '/status', msg: { data: 'ok' } })
  assert.equal(messages, 1)
})

test('OPEN but unresponsive transport triggers real probes and recovery', async () => {
  const h = harness()
  await h.connect()
  await h.advance(100000)
  assert.ok(h.sockets[0].sent.some(m => m.op === 'call_service'), 'heartbeats must send real requests')
  assert.ok(h.sockets.length > 1, 'missing replies must trigger recovery despite OPEN readyState')
})

test('heartbeat replies keep the connection alive without leaking response handlers', async () => {
  const h = harness()
  await h.connect()
  for (let i = 0; i < 8; i++) {
    await h.advance(15000)
    const request = h.sockets[0].sent.filter(m => m.op === 'call_service').at(-1)
    assert.ok(request, 'a real request is sent')
    h.sockets[0].receive({ op: 'service_response', id: request.id, result: true, values: { nodes: [] } })
    await h.flush()
  }
  assert.equal(h.sockets.length, 1)
  assert.equal(h.connection.isConnected(), true)
})

test('manual disconnect cancels recovery and emits disconnected state', async () => {
  const h = harness()
  const changes = []
  h.connection.onConnectionChange(value => changes.push(value))
  await h.connect()
  h.sockets[0].close()
  h.connection.disconnect()
  await h.advance(60000)
  assert.equal(h.sockets.length, 1)
  assert.equal(h.connection.isConnected(), false)
  assert.equal(changes.at(-1), false)
})

test('disconnect while an initial attempt is pending rejects its promise', async () => {
  const h = harness()
  const pending = h.connection.connect({ url: 'ws://robot:9090' })
  await h.flush()
  let rejected = false
  pending.catch(() => { rejected = true })
  h.connection.disconnect()
  await h.advance(16000)
  assert.equal(rejected, true, 'cancelled connection must reject rather than hang')
  assert.equal(h.sockets.length, 1)
})

test('offline publish and service calls are rejected and never replayed', async () => {
  const h = harness()
  await h.connect()
  h.sockets[0].close()
  await assert.rejects(h.connection.publish('/cmd_vel', 'geometry_msgs/Twist', { linear: { x: 1 } }))
  await assert.rejects(h.connection.callService('/move', 'robot/Move', {}))
  await h.advance(2000)
  h.sockets.at(-1).open()
  await h.flush()
  assert.equal(h.sockets.at(-1).sent.some(m => m.op === 'publish' || m.service === '/move'), false)
})

test('disconnect during async publish prevents command from crossing connections', async () => {
  const h = harness()
  await h.connect()
  const pending = h.connection.publish('/cmd_vel', 'geometry_msgs/Twist', {})
  const rejection = assert.rejects(pending)
  h.connection.disconnect()
  await rejection
  assert.equal(h.sockets[0].sent.some(m => m.op === 'publish'), false)
})

test('autoConnect=false disables automatic recovery', async () => {
  const h = harness()
  await h.connect({ autoConnect: false })
  h.sockets[0].close()
  await h.advance(60000)
  assert.equal(h.sockets.length, 1)
})

test('late events from the previous connection cannot disconnect a replacement', async () => {
  const h = harness()
  await h.connect()
  const lateClose = h.sockets[0].onclose
  const lateError = h.sockets[0].onerror
  const changes = []
  h.connection.onConnectionChange(value => changes.push(value))
  await h.connect({ url: 'ws://other-robot:9090' })
  lateClose({ code: 1006 })
  lateError({})
  assert.equal(h.connection.isConnected(), true)
  assert.equal(changes.at(-1), true)
})

test('unsubscribing during recovery prevents resurrecting the subscription', async () => {
  const h = harness()
  await h.connect()
  await h.connection.subscribe({ topic: '/status', messageType: 'std_msgs/String', callback() {} })
  h.sockets[0].close()
  h.connection.unsubscribe('/status')
  await h.advance(2000)
  assert.equal(h.sockets.length, 2)
  h.sockets[1].open()
  assert.equal(h.sockets[1].sent.some(m => m.op === 'subscribe'), false)
})

test('service responses resolve once; pending calls reject on transport loss', async () => {
  const h = harness()
  await h.connect()
  const result = h.connection.callService('/read', 'robot/Read', {})
  const request = h.sockets[0].sent.at(-1)
  h.sockets[0].receive({ op: 'service_response', id: request.id, result: true, values: { ok: true } })
  assert.equal((await result).ok, true)
  const pending = h.connection.callService('/move', 'robot/Move', {})
  const rejection = assert.rejects(pending, /连接已断开/)
  h.sockets[0].close()
  await rejection
})

test('service timeout cleans its response listener and does not retry commands', async () => {
  const h = harness()
  await h.connect()
  const pending = h.connection.callService('/move', 'robot/Move', {}, 500)
  const id = h.sockets[0].sent.at(-1).id
  const rejection = assert.rejects(pending, /超时/)
  await h.advance(501)
  await rejection
  assert.equal(h.connection.ros.listenerCount(id), 0)
  assert.equal(h.sockets[0].sent.filter(m => m.service === '/move').length, 1)
})

test('failed reconnect handshakes keep retrying with bounded backoff', async () => {
  const h = harness()
  await h.connect()
  h.sockets[0].close()
  await h.advance(1000)
  assert.equal(h.sockets.length, 2)
  for (let i = 0; i < 8; i++) {
    h.sockets.at(-1).onerror({})
    const count = h.sockets.length
    await h.advance(Math.min(2000 * 2 ** i, 30000))
    assert.equal(h.sockets.length, count + 1)
    assert.ok([...h.timers.values()].every(timer => timer.delay <= 30000))
  }
  h.connection.disconnect()
})

test('foreground return probes immediately; background throttling alone does not close the connection', async () => {
  const h = harness()
  await h.connect()
  h.document.hidden = true
  await h.advance(120000)
  assert.equal(h.sockets.length, 1)
  const sent = h.sockets[0].sent.length
  h.document.hidden = false
  h.listeners.get('visibilitychange')()
  assert.ok(h.sockets[0].sent.length > sent)
})

test('debug subscriptions recover and disposal prevents later restoration', async () => {
  const h = harness()
  await h.connect()
  let count = 0
  const dispose = await h.connection.createDebugSubscription({ topic: '/debug', messageType: 'std_msgs/String', callback() { count++ } })
  h.sockets[0].close()
  await h.advance(1000)
  h.sockets[1].open()
  h.sockets[1].receive({ op: 'publish', topic: '/debug', msg: {} })
  assert.equal(count, 1)
  h.sockets[1].close()
  dispose()
  await h.advance(2000)
  h.sockets.at(-1).open()
  assert.equal(h.sockets.at(-1).sent.some(m => m.op === 'subscribe'), false)
})

test('a missing rosapi service reply still proves the WebSocket is alive', async () => {
  const h = harness()
  await h.connect()
  for (let i = 0; i < 5; i++) {
    await h.advance(15000)
    const request = h.sockets[0].sent.at(-1)
    h.sockets[0].receive({ op: 'service_response', id: request.id, result: false, values: 'Service unavailable' })
  }
  assert.equal(h.sockets.length, 1)
})

test('heartbeat response handlers are removed on every timeout', async () => {
  const h = harness()
  await h.connect()
  const ros = h.connection.ros
  for (let i = 0; i < 3; i++) {
    await h.advance(15000)
    const request = h.sockets[0].sent.at(-1)
    await h.advance(10000)
    assert.equal(ros.listenerCount(request.id), 0)
  }
  assert.equal(h.connection.isConnected(), false)
})

test('cancelled library load cannot open a socket after manual disconnect', async () => {
  const h = harness()
  const pending = h.connection.connect({ url: 'ws://robot:9090' })
  const rejection = assert.rejects(pending, /取消/)
  h.connection.disconnect()
  await rejection
  assert.equal(h.sockets.length, 0)
})

test('connection replacement rejects a publish awaiting the library', async () => {
  const h = harness()
  await h.connect()
  const pending = h.connection.publish('/cmd_vel', 'geometry_msgs/Twist', {})
  const rejection = assert.rejects(pending)
  await h.connect({ url: 'ws://other-robot:9090' })
  await rejection
  assert.equal(h.sockets[1].sent.some(m => m.op === 'publish'), false)
})

test('topic discovery responses are mapped and cannot leak across sessions', async () => {
  const h = harness()
  await h.connect()
  const topics = h.connection.getTopics()
  const request = h.sockets[0].sent.at(-1)
  h.sockets[0].receive({ op: 'service_response', id: request.id, result: true, values: { topics: ['/status'], types: ['std_msgs/String'] } })
  assert.equal((await topics)[0].name, '/status')
  const pending = h.connection.getTopics()
  const rejection = assert.rejects(pending)
  h.sockets[0].close()
  await rejection
  await h.advance(1000)
  h.sockets[1].open()
  assert.equal(h.sockets[1].sent.some(m => m.service === '/rosapi/topics'), false)
})

test('network online event accelerates scheduled recovery without parallel attempts', async () => {
  const h = harness()
  await h.connect()
  h.sockets[0].close()
  h.listeners.get('online')()
  h.listeners.get('online')()
  assert.equal(h.sockets.length, 2)
  await h.advance(2000)
  assert.equal(h.sockets.length, 2)
  h.sockets[1].open()
  assert.equal(h.connection.isConnected(), true)
})

test('keyed subscribers remain deduplicated when components resubscribe after recovery', async () => {
  const h = harness()
  await h.connect()
  let a = 0
  let b = 0
  const subscription = { topic: '/status', messageType: 'std_msgs/String' }
  await h.connection.subscribe({ ...subscription, key: 'a', callback: () => a++ })
  await h.connection.subscribe({ ...subscription, key: 'b', callback: () => b++ })
  h.sockets[0].close()
  await h.advance(1000)
  h.sockets[1].open()
  await h.connection.subscribe({ ...subscription, key: 'a', callback: () => a += 10 })
  h.sockets[1].receive({ op: 'publish', topic: '/status', msg: {} })
  assert.equal(a, 10)
  assert.equal(b, 1)
  assert.equal(h.sockets[1].sent.filter(m => m.op === 'subscribe').length, 1)
})

test('a socket closed without delivering close still enters recovery on the next probe', async () => {
  const h = harness()
  await h.connect()
  h.sockets[0].readyState = 3
  await h.advance(16000)
  assert.equal(h.sockets.length, 2)
})

// Run the actual SFC lifecycle expressions with Vue's real reactivity and the
// installed ROSLIB. Rendering, WebGL and unrelated HTTP APIs are excluded.
function componentLifecycle(h, filename, bindings, declarations, watchSources, withUnmount = false) {
  const source = readFileSync(new URL(`../src/${filename}`, import.meta.url), 'utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1]
  const ast = ts.createSourceFile(filename + '.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const statements = ast.statements.filter(node => {
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.some(d => declarations.includes(d.name.getText(ast)))
    if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return false
    const call = node.expression
    if (call.expression.getText(ast) === 'watch') return watchSources.some(needle => call.arguments[0].getText(ast).includes(needle))
    return withUnmount && call.expression.getText(ast) === 'onUnmounted'
  })
  const scope = vue.effectScope()
  const unmount = []
  const context = vm.createContext({
    ...vue, ...h.clock, ...bindings, rosConnection: h.connection,
    onUnmounted: callback => unmount.push(callback)
  })
  scope.run(() => vm.runInContext(ts.transpileModule(statements.map(s => s.getText(ast)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 }
  }).outputText, context))
  return { context, dispose: () => { scope.stop(); unmount.forEach(callback => callback()) } }
}

function connectedStore(h) {
  const store = vue.reactive({
    connectionState: { connected: false, reconnecting: false },
    get isConnected() { return this.connectionState.connected },
    topics: [], loadingTopics: false
  })
  h.connection.onConnectionChange(connected => {
    store.connectionState.connected = connected
    store.connectionState.reconnecting = h.connection.isReconnecting()
  })
  return store
}

function realStore(h) {
  pinia.setActivePinia(pinia.createPinia())
  const exports = {}
  const source = readFileSync(new URL('../src/stores/ros.ts', import.meta.url), 'utf8')
  const context = vm.createContext({
    exports, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    console: h.clock.console,
    require: name => name === 'vue' ? vue : name === 'pinia' ? pinia : { rosConnection: h.connection }
  })
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, context)
  return exports.useRosStore()
}

test('changing camera while offline subscribes the newly selected camera after recovery', async () => {
  const h = harness()
  const rosStore = connectedStore(h)
  await h.connect()
  const settingsStore = vue.reactive({ selectedTopic: '/camA', setSelectedTopic(topic) { this.selectedTopic = topic } })
  h.connection.getTopics = async () => ['/camA', '/camB'].map(name => ({ name, messageType: 'sensor_msgs/Image' }))
  let frames = 0
  const component = componentLifecycle(h, 'components/panels/ImagePanel.vue', {
    rosStore, settingsStore, selectedTopic: vue.ref('/camA'), hasImage: vue.ref(true),
    handleImageMessage: () => frames++, subscribeToTaskStatus: async () => {}, autoSubscribeDefaultCamera: async () => {}
  }, ['subscribeToSelectedCamera', 'cameraSubscriptionVersion', 'captureSessionId', 'cancelAutoCaptureOnDisconnect'], ['rosStore.isConnected', 'settingsStore.selectedTopic'])
  await h.flush()
  h.sockets[0].close()
  await h.flush()
  settingsStore.selectedTopic = '/camB'
  await h.flush()
  await h.advance(1000)
  h.sockets[1].open()
  await h.flush()
  h.sockets[1].receive({ op: 'publish', topic: '/camB', msg: {} })
  assert.equal(frames, 1, 'the selected camera must resume even when selection changed offline')
  component.dispose()
})

test('automatic recovery retains navigation and queue display until fresh ROS data arrives', async () => {
  const h = harness()
  const rosStore = connectedStore(h)
  await h.connect()
  const isNavigationRunning = vue.ref(true)
  const taskStatus = vue.ref({ queueSize: 5, currentIndex: 2, isRunning: true })
  const availableQueues = vue.ref(['routeA'])
  const component = componentLifecycle(h, 'components/settings/ThreeDSettings.vue', {
    rosStore, isNavigationRunning, taskStatus, availableQueues, cancelManualMovement() {},
    queueInfos: vue.ref({ routeA: { points: 5 } }), queueListSubscription: true,
    mapManagerStatusText: vue.ref('running'), mapManagerResultText: vue.ref('ok'),
    subscribeToNavigationStatus: async () => {}, subscribeToMapManagerStatus: async () => {},
    subscribeToTaskStatus: async () => {}, subscribeToCommandTopics: async () => {}, subscribeToQueueList: async () => {}
  }, ['queueRefreshTimer'], ['rosStore.isConnected'])
  h.sockets[0].close()
  await h.flush()
  assert.equal(isNavigationRunning.value, true)
  assert.equal(taskStatus.value.currentIndex, 2)
  assert.equal(availableQueues.value[0], 'routeA')
  component.dispose()
})

test('obsolete discovery failure cannot overwrite successful recovery metadata', async () => {
  const h = harness()
  const store = realStore(h)
  store.setConnectionState({ connected: true })
  const pending = []
  h.connection.getTopics = () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
  const old = store.fetchTopics()
  store.setConnectionState({ connected: false, reconnecting: true })
  store.setConnectionState({ connected: true, reconnecting: false })
  const fresh = store.fetchTopics()
  pending[1].resolve([{ name: '/new', messageType: 'std_msgs/String' }])
  await fresh
  pending[0].reject(new Error('old transport closed'))
  await old
  assert.equal(store.topicFetchError, null)
  assert.equal(store.topics[0].name, '/new')
})

test('obsolete discovery completion cannot clear the new request loading indicator', async () => {
  const h = harness()
  const store = realStore(h)
  store.setConnectionState({ connected: true })
  const pending = []
  h.connection.getTopics = () => new Promise(resolve => pending.push(resolve))
  const old = store.fetchTopics()
  const fresh = store.fetchTopics()
  pending[0]([])
  await old
  assert.equal(store.loadingTopics, true)
  pending[1]([])
  await fresh
})

test('unmounting the robot status panel while offline prevents orphan subscriptions', async () => {
  const h = harness()
  const rosStore = connectedStore(h)
  await h.connect()
  const component = componentLifecycle(h, 'components/panels/RobotStatusPanel.vue', {
    rosStore, isFirstCheckAfterConnect: vue.ref(false), handleStatusMessage() {}, handleDogStatusMessage() {}
  }, ['subscribeToStatus', 'statusPanelDisposed'], ['rosStore.isConnected'], true)
  await h.flush()
  h.sockets[0].close()
  await h.flush()
  component.dispose()
  await h.advance(1000)
  h.sockets[1].open()
  assert.equal(h.sockets[1].sent.filter(message => message.op === 'subscribe').length, 0)
})

test('unsubscribe cancels registration still awaiting the library', async () => {
  const h = harness()
  await h.connect()
  const pending = h.connection.subscribe({ topic: '/status', messageType: 'std_msgs/String', callback() {} })
  h.connection.unsubscribe('/status')
  await pending
  assert.equal(h.sockets[0].sent.some(message => message.op === 'subscribe'), false)
})

test('automatic recovery preserves active floor and cached route markers', async () => {
  const h = harness()
  const rosStore = connectedStore(h)
  await h.connect()
  const settingsStore = vue.reactive({ activeMapLabel: 'floor2', setActiveMapLabel(label) { this.activeMapLabel = label } })
  const markerMessagesByTopic = { '/goal_queue/markers2': { markers: [{ id: 1 }] } }
  const component = componentLifecycle(h, 'components/panels/ThreeDPanel.vue', {
    rosStore, settingsStore, isThreeReady: false, currentMarkerTopic: '/goal_queue/markers2',
    currentMapLabel: 'floor2', hasFloorMarkerTopics: true, markerMessagesByTopic, clearMarkers() {}
  }, [], ['rosStore.isConnected'])
  h.sockets[0].close()
  await h.flush()
  assert.equal(settingsStore.activeMapLabel, 'floor2')
  assert.ok(markerMessagesByTopic['/goal_queue/markers2'])
  h.connection.disconnect()
  await h.flush()
  assert.equal(settingsStore.activeMapLabel, 'map', 'explicit cancellation clears stale map state')
  component.dispose()
})

test('paused heartbeat still sends keepalive traffic without counting timeout failures', async () => {
  const h = harness()
  await h.connect()
  h.connection.pauseHeartbeat()
  await h.advance(120000)
  assert.ok(h.sockets[0].sent.some(message => message.op === 'call_service'))
  assert.equal(h.sockets.length, 1)
  h.connection.resumeHeartbeat()
  await h.advance(76000)
  assert.ok(h.sockets.length > 1)
})

test('movement held before a disconnect never resumes from the old interval', async () => {
  const h = harness()
  const rosStore = connectedStore(h)
  await h.connect()
  h.clock.window.setInterval = h.clock.setInterval
  const moveInterval = vue.ref(null)
  const component = componentLifecycle(h, 'components/settings/ThreeDSettings.vue', {
    rosStore, isConnected: vue.computed(() => rosStore.isConnected), moveInterval,
    isNavigationRunning: vue.ref(true), taskStatus: vue.ref({}), availableQueues: vue.ref([]), queueInfos: vue.ref({}),
    queueListSubscription: null, mapManagerStatusText: vue.ref(''), mapManagerResultText: vue.ref(''),
    subscribeToNavigationStatus() {}, subscribeToMapManagerStatus() {}, subscribeToTaskStatus() {},
    subscribeToCommandTopics() {}, subscribeToQueueList() {}
  }, ['queueRefreshTimer', 'cancelManualMovement', 'startMove', 'publishTwist'], ['rosStore.isConnected'])
  vm.runInContext("startMove('forward')", component.context)
  await h.flush()
  h.sockets[0].close()
  await h.flush()
  assert.equal(moveInterval.value, null, 'transport loss cancels the movement timer')
  await h.advance(1000)
  h.sockets[1].open()
  await h.advance(500)
  assert.equal(h.sockets[1].sent.some(message => message.topic === '/cmd_vel' && message.op === 'publish'), false)
  component.dispose()
})

test('a capture scan interrupted by transport loss cannot send later scan commands after recovery', async () => {
  const h = harness()
  const rosStore = connectedStore(h)
  rosStore.isAutoCapturing = false
  rosStore.setAutoCapturing = value => { rosStore.isAutoCapturing = value }
  await h.connect()
  const component = componentLifecycle(h, 'components/panels/ImagePanel.vue', {
    rosStore, settingsStore: vue.reactive({ selectedTopic: '', setSelectedTopic() {} }),
    selectedTopic: vue.ref(''), hasImage: vue.ref(true),
    isAutoCapturing: vue.computed(() => rosStore.isAutoCapturing),
    uploadCurrentFrame: async () => {}, handleImageMessage() {},
    subscribeToTaskStatus: async () => {}, autoSubscribeDefaultCamera: async () => {},
    ElMessage: { info() {}, success() {}, warning() {}, error() {} }
  }, ['captureSessionId', 'cameraSubscriptionVersion', 'subscribeToSelectedCamera', 'cancelAutoCaptureOnDisconnect',
    'publishPtzCommand', 'sleep', 'runThreeLevelScan', 'startAutoCapture', 'stopAutoCapture'], ['rosStore.isConnected'])
  const scan = vm.runInContext("startAutoCapture('capture-folder')", component.context)
  await h.flush()
  assert.ok(h.sockets[0].sent.some(message => message.topic === '/camera_control/tilt_up'))
  h.sockets[0].close()
  await h.flush()
  assert.equal(rosStore.isAutoCapturing, false, 'interrupted browser motion must stop its async sequence')
  await h.advance(1000)
  h.sockets[1].open()
  await h.advance(4000)
  assert.equal(h.sockets[1].sent.some(message => message.op === 'publish'), false)
  await scan
  component.dispose()
})

test('navigation panel unmount cancels subscriptions between sequential awaits', async () => {
  const h = harness()
  await h.connect()
  const component = componentLifecycle(h, 'components/settings/ThreeDSettings.vue', {
    queueRefreshTimer: null, cancelManualMovement() {}, threeDPanelRef: vue.ref(null),
    startImageCapture() {}, stopImageCapture() {}, ElMessage: { error() {} }
  }, ['navigationPanelDisposed', 'subscribeForNavigation', 'subscribeToCommandTopics', 'queueListSubscription'], [], true)
  const pending = vm.runInContext('subscribeToCommandTopics()', component.context)
  component.dispose()
  await pending
  assert.equal(h.connection.subscribers.size, 0)
})

test('navigation and queue listeners receive fresh state after recovery and reset on explicit cancel', async () => {
  const h = harness()
  const rosStore = connectedStore(h)
  await h.connect()
  const isNavigationRunning = vue.ref(true)
  const taskStatus = vue.ref({ queueSize: 5, currentIndex: 2, isRunning: true })
  const availableQueues = vue.ref(['routeA'])
  const component = componentLifecycle(h, 'components/settings/ThreeDSettings.vue', {
    rosStore, isNavigationRunning, taskStatus, availableQueues, cancelManualMovement() {},
    queueName: vue.ref('routeA'), queueInfos: vue.ref({ routeA: { points: 5 } }),
    mapManagerStatusText: vue.ref('running'), mapManagerResultText: vue.ref(''),
    subscribeToMapManagerStatus() {}, subscribeToTaskStatus() {}, subscribeToCommandTopics() {}, ElMessage: { error() {} }
  }, ['queueRefreshTimer', 'navigationPanelDisposed', 'subscribeForNavigation', 'subscribeToNavigationStatus',
    'subscribeToQueueList', 'queueListSubscription'], ['rosStore.isConnected'])
  await h.flush()
  h.sockets[0].close()
  await h.flush()
  assert.equal(isNavigationRunning.value, true)
  await h.advance(1000)
  h.sockets[1].open()
  await h.flush()
  h.sockets[1].receive({ op: 'publish', topic: '/launch_trigger_status', msg: { data: 'stopped' } })
  h.sockets[1].receive({ op: 'publish', topic: '/goal_queue/list', msg: { data: JSON.stringify({ queues: [{ name: 'routeB', points: 8 }] }) } })
  assert.equal(isNavigationRunning.value, false)
  assert.equal(availableQueues.value[0], 'routeB')
  h.sockets[1].close()
  await h.flush()
  h.connection.disconnect()
  await h.flush()
  assert.equal(availableQueues.value.length, 0)
  component.dispose()
})

test('camera discovery replies arriving out of order cannot restore the old selection', async () => {
  const h = harness()
  const rosStore = connectedStore(h)
  await h.connect()
  const settingsStore = vue.reactive({ selectedTopic: '/camA', setSelectedTopic(topic) { this.selectedTopic = topic } })
  const queries = []
  h.connection.getTopics = () => new Promise(resolve => queries.push(resolve))
  const component = componentLifecycle(h, 'components/panels/ImagePanel.vue', {
    rosStore, settingsStore, selectedTopic: vue.ref('/camA'), hasImage: vue.ref(false),
    handleImageMessage() {}, subscribeToTaskStatus: async () => {}, autoSubscribeDefaultCamera: async () => {}
  }, ['subscribeToSelectedCamera', 'cameraSubscriptionVersion', 'captureSessionId', 'cancelAutoCaptureOnDisconnect'], ['settingsStore.selectedTopic'])
  settingsStore.selectedTopic = '/camB'
  await h.flush()
  const topics = ['/camA', '/camB'].map(name => ({ name, messageType: 'sensor_msgs/Image' }))
  queries[1](topics)
  await h.flush()
  queries[0](topics)
  await h.flush()
  assert.equal(h.sockets[0].sent.filter(message => message.op === 'subscribe').length, 1)
  assert.equal(h.sockets[0].sent.find(message => message.op === 'subscribe').topic, '/camB')
  component.dispose()
})

test('50 reconnect cycles deliver one callback per message and keep one live heartbeat timer', async () => {
  const h = harness()
  await h.connect()
  let updates = 0
  await h.connection.subscribe({ topic: '/status', messageType: 'std_msgs/String', key: 'panel', callback: () => updates++ })
  for (let cycle = 0; cycle < 50; cycle++) {
    h.sockets.at(-1).close()
    await h.advance(Math.min(1000 * 2 ** Math.min(cycle, 5), 30000))
    h.sockets.at(-1).open()
    await h.flush()
    h.sockets.at(-1).receive({ op: 'publish', topic: '/status', msg: {} })
    assert.equal(updates, cycle + 1)
    assert.equal(h.connection.subscribers.size, 1)
    assert.equal(h.timers.size, 1)
  }
  h.connection.disconnect()
  assert.equal(h.timers.size, 0)
})

test('an uninterrupted three-level scan still finishes, centers the PTZ and continues navigation once', async () => {
  const h = harness()
  const rosStore = connectedStore(h)
  rosStore.isAutoCapturing = false
  rosStore.setAutoCapturing = value => { rosStore.isAutoCapturing = value }
  await h.connect()
  const component = componentLifecycle(h, 'components/panels/ImagePanel.vue', {
    rosStore, isAutoCapturing: vue.computed(() => rosStore.isAutoCapturing),
    uploadCurrentFrame: async () => {}, ElMessage: { info() {}, success() {}, warning() {}, error() {} }
  }, ['captureSessionId', 'publishPtzCommand', 'sleep', 'runThreeLevelScan', 'startAutoCapture', 'stopAutoCapture'], [])
  const scan = vm.runInContext("startAutoCapture('capture-folder')", component.context)
  await h.flush()
  await h.advance(60000)
  await scan
  const commands = h.sockets[0].sent.filter(message => message.op === 'publish').map(message => message.topic)
  assert.deepEqual(commands.slice(-3), ['/camera_control/stop', '/camera_control/center', '/goal_queue/continue'])
  assert.equal(commands.filter(topic => topic === '/goal_queue/continue').length, 1)
  assert.equal(commands.filter(topic => topic === '/camera_control/continuous_pan_right').length, 2)
  assert.equal(rosStore.isAutoCapturing, false)
  component.dispose()
})
