// Optional RocketMQ bridge for producer/consumer
// Works only when @apache/rocketmq-client is installed and configuration is provided.
import { readFile } from 'fs/promises'
import { resolve } from 'path'

let RocketMQClient = null

async function loadClient() {
    if (RocketMQClient) return RocketMQClient
    try {
        RocketMQClient = await import('@apache/rocketmq-client')
        return RocketMQClient
    } catch (err) {
        console.warn('[RocketMQ] client not available, MQ features disabled:', err?.message || err)
        return null
    }
}

async function loadConfigFromFile() {
    const configPath = resolve(process.cwd(), process.env.MQ_CONFIG_PATH || 'config/rocketmq.config.json')
    try {
        const raw = await readFile(configPath, 'utf-8')
        const parsed = JSON.parse(raw)
        console.log(`[RocketMQ] loaded config from ${configPath}`)
        return parsed || {}
    } catch (err) {
        if (err && err.code !== 'ENOENT') {
            console.warn('[RocketMQ] failed to load config file, falling back to environment variables:', err.message || err)
        }
        return {}
    }
}

export class RocketMQBridge {
    constructor(config) {
        this.config = config
        this.enabled = false
        this.producer = null
        this.consumer = null
        this.running = false
        this.listeners = new Set()
    }

    async init() {
        const client = await loadClient()
        if (!client) return this

        const {
            endpoints,
            accessKey,
            secretKey,
            namespace,
            consumerGroup,
            consumerTopic,
            producerTopic
        } = this.config

        if (!endpoints || (!consumerTopic && !producerTopic)) {
            console.warn('[RocketMQ] Missing endpoints or topics, MQ disabled')
            return this
        }

        this.client = client
        this.enabled = true
        this.textEncoder = new TextEncoder()
        this.textDecoder = new TextDecoder()
        this.consumerTopic = consumerTopic
        this.producerTopic = producerTopic
        this.consumerGroup = consumerGroup || 'visual-app-consumer'

        return this
    }

    async getProducer() {
        if (!this.enabled) throw new Error('RocketMQ disabled')
        if (this.producer) return this.producer

        const { Producer } = this.client
        const { endpoints, accessKey, secretKey, namespace, producerTopic } = this.config

        const producer = new Producer({
            endpoints,
            accessKey,
            secretKey,
            namespace,
            topics: [producerTopic]
        })
        await producer.start()
        this.producer = producer
        return producer
    }

    async sendMessage(message, topicOverride) {
        if (!this.enabled) throw new Error('RocketMQ disabled')
        const producer = await this.getProducer()
        const topic = topicOverride || this.producerTopic
        const payload = typeof message === 'string' ? message : JSON.stringify(message)
        const body = this.textEncoder.encode(payload)
        const result = await producer.send({ topic, body })
        return { messageId: result?.messageId, topic }
    }

    addListener(listener) {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    notify(message) {
        for (const listener of this.listeners) {
            try {
                listener(message)
            } catch (err) {
                console.error('[RocketMQ] listener error:', err)
            }
        }
    }

    async ensureConsumer() {
        if (!this.enabled) throw new Error('RocketMQ disabled')
        if (this.consumer || !this.consumerTopic) return

        const { SimpleConsumer } = this.client
        const { endpoints, accessKey, secretKey, namespace } = this.config

        const consumer = new SimpleConsumer({
            endpoints,
            accessKey,
            secretKey,
            namespace,
            consumerGroup: this.consumerGroup,
            subscriptionExpressions: [
                { topic: this.consumerTopic, expression: '*' }
            ],
            awaitDuration: 3000
        })

        await consumer.start()
        this.consumer = consumer
        this.running = true
        this.consumeLoop().catch(err => {
            console.error('[RocketMQ] consumer loop error:', err)
            this.running = false
        })
    }

    async consumeLoop() {
        if (!this.consumer) return
        while (this.running) {
            try {
                const messages = await this.consumer.receive(16, 2000)
                if (!messages || messages.length === 0) continue
                for (const mv of messages) {
                    const bodyStr = this.textDecoder.decode(mv.body)
                    const payload = this.safeParse(bodyStr)
                    this.notify({
                        topic: mv.topic,
                        messageId: mv.messageId,
                        body: bodyStr,
                        payload
                    })
                    await this.consumer.ack(mv)
                }
            } catch (err) {
                // receive timeout is normal; other errors log and continue
                if (String(err).toLowerCase().includes('timeout')) {
                    continue
                }
                console.error('[RocketMQ] consume error:', err)
                await new Promise(r => setTimeout(r, 1000))
            }
        }
    }

    safeParse(text) {
        try {
            return JSON.parse(text)
        } catch {
            return null
        }
    }

    stop() {
        this.running = false
    }
}

let singletonPromise = null
export async function getRocketMQBridge() {
    if (singletonPromise) return singletonPromise

    const fileConfig = await loadConfigFromFile()

    const envConfig = {
        endpoints: process.env.MQ_ENDPOINTS || '',
        accessKey: process.env.MQ_ACCESS_KEY || process.env.ROCKETMQ_ACCESS_KEY || '',
        secretKey: process.env.MQ_SECRET_KEY || process.env.ROCKETMQ_SECRET_KEY || '',
        namespace: process.env.MQ_NAMESPACE || '',
        producerTopic: process.env.MQ_PRODUCER_TOPIC || process.env.MQ_TOPIC || 'visual_app_up',
        consumerTopic: process.env.MQ_CONSUMER_TOPIC || process.env.MQ_TOPIC_DOWN || 'visual_app_down',
        consumerGroup: process.env.MQ_CONSUMER_GROUP || 'visual-app-consumer'
    }

    // File config overrides env where provided; keeps defaults safe for pm2/nginx starts.
    const config = { ...envConfig, ...fileConfig }

    const bridge = new RocketMQBridge(config)
    singletonPromise = bridge.init()
    return singletonPromise
}
