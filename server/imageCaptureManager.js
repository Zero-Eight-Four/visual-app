import { writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import ROSLIB from 'roslib';
import { shouldRouteImageToImage2 } from './imageRoutingConfig.js';

const ENABLE_SECONDARY_IMAGE_ROUTING = !['0', 'false', 'no', 'off'].includes(
    String(process.env.ENABLE_SECONDARY_IMAGE_ROUTING ?? (process.env.NODE_ENV !== 'production' ? 'true' : 'false')).trim().toLowerCase()
);
const CAPTURE_INTERVAL_MS = 10000;
const DEFAULT_CAMERA_TOPIC = '/camera/image_raw/compressed';
const CAMERA_TOPIC_CANDIDATES = [
    '/camera/image_raw/compressed',
    '/camera/visible/image_raw/compressed',
    '/usb_cam/image_raw/compressed',
    '/head_camera/rgb/image_raw/compressed'
];

function normalizeRobotUrl(robotSource) {
    const value = String(robotSource || '').trim();
    if (!value) {
        throw new Error('Robot URL or IP is required');
    }

    const withProtocol = value.includes('://') ? value : `ws://${value}`;
    const url = new URL(withProtocol);
    if (!url.port) {
        url.port = '9090';
    }
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    }

    return url.toString();
}

export class ImageCaptureManager {
    constructor() {
        this.imageCaptureRos = null;
        this.imageCaptureTimer = null;
        this.latestImage = null;
        this.latestImageVersion = 0;
        this.lastSavedImageVersion = 0;
        this.isSavingFrame = false;
        this.imageCaptureTopic = null;
        this.subscribedTopicName = '';
        this.isCapturing = false;
        this.imageRootDir = 'image';
    }

    async startImageCapture(robotSource) {
        if (this.isCapturing) {
            console.log('[ImageCaptureManager] Already capturing, restarting...');
            this.stopImageCapture();
        }

        const robotUrl = normalizeRobotUrl(robotSource);
        this.imageRootDir = ENABLE_SECONDARY_IMAGE_ROUTING && shouldRouteImageToImage2(robotUrl) ? 'image2' : 'image';
        console.log(`[ImageCaptureManager] Starting image capture from ${robotUrl}...`);

        this.imageCaptureRos = new ROSLIB.Ros({
            url: robotUrl
        });

        this.imageCaptureRos.on('connection', () => {
            console.log('[ImageCaptureManager] Image capture connected');
            this.subscribeToImage();
            this.isCapturing = true;
        });

        this.imageCaptureRos.on('error', (error) => {
            console.error('[ImageCaptureManager] Image capture error:', error);
            this.stopImageCapture();
        });

        this.imageCaptureRos.on('close', () => {
            console.log('[ImageCaptureManager] Image capture connection closed');
            this.stopImageCapture();
        });
    }

    getStatus() {
        return {
            isCapturing: this.isCapturing,
            imageRootDir: this.imageRootDir,
            subscribedTopicName: this.subscribedTopicName,
            latestImageVersion: this.latestImageVersion,
            lastSavedImageVersion: this.lastSavedImageVersion
        };
    }

    stopImageCapture() {
        if (this.imageCaptureTimer) {
            clearInterval(this.imageCaptureTimer);
            this.imageCaptureTimer = null;
        }
        if (this.imageCaptureTopic) {
            this.imageCaptureTopic.unsubscribe();
            this.imageCaptureTopic = null;
        }
        if (this.imageCaptureRos) {
            this.imageCaptureRos.close();
            this.imageCaptureRos = null;
        }
        this.latestImage = null;
        this.latestImageVersion = 0;
        this.lastSavedImageVersion = 0;
        this.isSavingFrame = false;
        this.subscribedTopicName = '';
        this.isCapturing = false;
        console.log('[ImageCaptureManager] Image capture stopped');
    }

    createImageSubscription(topicName) {
        if (!this.imageCaptureRos) return;

        if (this.imageCaptureTopic) {
            this.imageCaptureTopic.unsubscribe();
            this.imageCaptureTopic = null;
        }

        console.log(`[ImageCaptureManager] Subscribing to camera topic: ${topicName}`);

        this.imageCaptureTopic = new ROSLIB.Topic({
            ros: this.imageCaptureRos,
            name: topicName,
            messageType: 'sensor_msgs/CompressedImage',
            throttle_rate: 0
        });

        this.subscribedTopicName = topicName;
        this.imageCaptureTopic.subscribe((message) => {
            this.latestImage = message;
            this.latestImageVersion += 1;
        });

        this.startCaptureTimer();
    }

    subscribeToImage() {
        this.imageCaptureRos.getTopics((result) => {
            let topicToUse = DEFAULT_CAMERA_TOPIC;

            if (result && result.topics && Array.isArray(result.topics)) {
                const found = CAMERA_TOPIC_CANDIDATES.find(t => result.topics.includes(t));
                if (found) {
                    topicToUse = found;
                }
            }

            this.createImageSubscription(topicToUse);
        }, (error) => {
            console.warn(`[ImageCaptureManager] Failed to get topics, using ${DEFAULT_CAMERA_TOPIC}:`, error);
            this.createImageSubscription(DEFAULT_CAMERA_TOPIC);
        });
    }

    startCaptureTimer() {
        if (this.imageCaptureTimer) return;

        const checkDir = resolve(process.cwd(), this.imageRootDir, 'check');

        // Ensure directory exists
        mkdir(checkDir, { recursive: true }).catch(err => console.error(err));

        this.imageCaptureTimer = setInterval(async () => {
            if (!this.latestImage || this.isSavingFrame) return;
            if (this.latestImageVersion === this.lastSavedImageVersion) return;

            this.isSavingFrame = true;
            try {
                const imageVersion = this.latestImageVersion;
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `img_${timestamp}.jpg`; // Assuming jpeg for compressed
                const filepath = join(checkDir, filename);

                // Decode base64 and save
                const imageData = this.latestImage.data;
                const buffer = typeof imageData === 'string'
                    ? Buffer.from(imageData, 'base64')
                    : Buffer.from(imageData);

                await writeFile(filepath, buffer);
                this.lastSavedImageVersion = imageVersion;
                console.log(`[ImageCaptureManager] Saved ${this.imageRootDir}/check/${filename} from ${this.subscribedTopicName}`);

            } catch (error) {
                console.error('[ImageCaptureManager] Error saving image:', error);
            } finally {
                this.isSavingFrame = false;
            }
        }, CAPTURE_INTERVAL_MS);
    }
}
