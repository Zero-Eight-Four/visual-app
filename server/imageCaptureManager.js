import { writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { join, resolve } from 'path';
import ROSLIB from 'roslib';

export class ImageCaptureManager {
    constructor() {
        this.imageCaptureRos = null;
        this.imageCaptureTimer = null;
        this.latestImage = null;
        this.imageCaptureTopic = null;
        this.isCapturing = false;
    }

    async startImageCapture(robotIp) {
        if (this.isCapturing) {
            console.log('[ImageCaptureManager] Already capturing, restarting...');
            this.stopImageCapture();
        }

        const robotUrl = `ws://${robotIp}:9090`;
        console.log(`[ImageCaptureManager] Starting image capture from ${robotUrl}...`);

        this.imageCaptureRos = new ROSLIB.Ros({
            url: robotUrl
        });

        this.imageCaptureRos.on('connection', () => {
            console.log('[ImageCaptureManager] Image capture connected');
            this.subscribeToImage();
            this.startCaptureTimer();
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
        this.isCapturing = false;
        console.log('[ImageCaptureManager] Image capture stopped');
    }

    subscribeToImage() {
        const candidateTopics = [
            '/camera/image_raw/compressed',
            '/usb_cam/image_raw/compressed',
            '/head_camera/rgb/image_raw/compressed'
        ];

        this.imageCaptureRos.getTopics((result) => {
            let topicToUse = '/camera/image_raw/compressed'; // Default

            if (result && result.topics && Array.isArray(result.topics)) {
                const found = candidateTopics.find(t => result.topics.includes(t));
                if (found) {
                    topicToUse = found;
                }
            }

            console.log(`[ImageCaptureManager] Subscribing to camera topic: ${topicToUse}`);

            this.imageCaptureTopic = new ROSLIB.Topic({
                ros: this.imageCaptureRos,
                name: topicToUse,
                messageType: 'sensor_msgs/CompressedImage'
            });

            this.imageCaptureTopic.subscribe((message) => {
                this.latestImage = message;
            });
        }, (error) => {
            console.warn('[ImageCaptureManager] Failed to get topics, using default:', error);
            // Fallback to default
            this.imageCaptureTopic = new ROSLIB.Topic({
                ros: this.imageCaptureRos,
                name: '/camera/image_raw/compressed',
                messageType: 'sensor_msgs/CompressedImage'
            });

            this.imageCaptureTopic.subscribe((message) => {
                this.latestImage = message;
            });
        });
    }

    startCaptureTimer() {
        const checkDir = resolve(process.cwd(), 'image/check');

        // Ensure directory exists
        mkdir(checkDir, { recursive: true }).catch(err => console.error(err));

        this.imageCaptureTimer = setInterval(async () => {
            if (!this.latestImage) return;

            try {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `img_${timestamp}.jpg`; // Assuming jpeg for compressed
                const filepath = join(checkDir, filename);

                // Decode base64 and save
                const buffer = Buffer.from(this.latestImage.data, 'base64');
                await writeFile(filepath, buffer);
                // console.log(`[ImageCaptureManager] Saved image ${filename}`);

                // Manage file count
                await this.manageImageCount(checkDir);

            } catch (error) {
                console.error('[ImageCaptureManager] Error saving image:', error);
            }
        }, 2000);
    }

    async manageImageCount(dir) {
        try {
            const files = await readdir(dir);
            // Filter for image files if necessary, or just assume all files in check/ are images
            const imageFiles = files.filter(f => f.startsWith('img_'));

            if (imageFiles.length > 100) {
                // Sort by name (timestamp)
                imageFiles.sort();

                // Delete oldest
                const filesToDelete = imageFiles.slice(0, imageFiles.length - 100);
                for (const file of filesToDelete) {
                    await unlink(join(dir, file));
                    // console.log(`[ImageCaptureManager] Deleted old image ${file}`);
                }
            }
        } catch (error) {
            console.error('[ImageCaptureManager] Error managing image count:', error);
        }
    }
}
