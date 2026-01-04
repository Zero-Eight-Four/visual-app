import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { join, resolve } from 'path';
import ROSLIB from 'roslib';
import { existsSync } from 'fs';

const CONFIG_PATH = resolve(process.cwd(), 'config/schedules.json');

export class ScheduleManager {
    constructor(mapSender) {
        this.schedules = [];
        this.timer = null;
        this.mapSender = mapSender; // Function to send map to robot
        this.isProcessing = false;
    }

    async init() {
        await this.loadSchedules();
        this.startTimer();
        console.log('[ScheduleManager] Initialized');
    }

    async loadSchedules() {
        try {
            if (existsSync(CONFIG_PATH)) {
                const data = await readFile(CONFIG_PATH, 'utf-8');
                this.schedules = JSON.parse(data);
            } else {
                this.schedules = [];
                await this.saveSchedules();
            }
        } catch (error) {
            console.error('[ScheduleManager] Failed to load schedules:', error);
            this.schedules = [];
        }
    }

    async saveSchedules() {
        try {
            await writeFile(CONFIG_PATH, JSON.stringify(this.schedules, null, 2));
        } catch (error) {
            console.error('[ScheduleManager] Failed to save schedules:', error);
        }
    }

    getSchedules() {
        return this.schedules;
    }

    async addSchedule(schedule) {
        schedule.id = Date.now().toString();
        this.schedules.push(schedule);
        await this.saveSchedules();
        return schedule;
    }

    async updateSchedule(id, updates) {
        const index = this.schedules.findIndex(s => s.id === id);
        if (index !== -1) {
            this.schedules[index] = { ...this.schedules[index], ...updates };
            await this.saveSchedules();
            return this.schedules[index];
        }
        return null;
    }

    async deleteSchedule(id) {
        const index = this.schedules.findIndex(s => s.id === id);
        if (index !== -1) {
            this.schedules.splice(index, 1);
            await this.saveSchedules();
            return true;
        }
        return false;
    }

    startTimer() {
        if (this.timer) clearInterval(this.timer);
        // Check every 5 seconds
        this.timer = setInterval(() => this.checkSchedules(), 5000);
    }

    async checkSchedules() {
        // Remove global isProcessing check to allow concurrent schedules
        // if (this.isProcessing) return;

        const now = new Date();
        // Convert to Beijing Time (UTC+8)
        const utcTimestamp = now.getTime() + (now.getTimezoneOffset() * 60000);
        const beijingTimestamp = utcTimestamp + (8 * 60 * 60 * 1000);
        const beijingDate = new Date(beijingTimestamp);

        const currentDay = beijingDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
        const currentHour = beijingDate.getUTCHours();
        const currentMinute = beijingDate.getUTCMinutes();

        // Map JS getDay() to user friendly days (1=Mon, 7=Sun) or keep 0-6.
        // Let's assume the UI sends 0-6 or 1-7.
        // Standard: 0=Sun, 1=Mon, ..., 6=Sat.

        for (const schedule of this.schedules) {
            if (!schedule.enabled) continue;

            // Check Day
            // schedule.days should be an array of numbers [1, 2] for Mon, Tue
            if (!schedule.days.includes(currentDay)) continue;

            // Check Time
            // schedule.time should be "HH:mm:ss"
            const [sHour, sMinute] = schedule.time.split(':').map(Number);

            if (sHour === currentHour && sMinute === currentMinute) {
                // Prevent double execution in the same minute
                const triggerKey = `${currentDay}-${currentHour}:${currentMinute}`;
                if (schedule.lastTriggered === triggerKey) continue;

                schedule.lastTriggered = triggerKey;
                console.log(`[ScheduleManager] Triggering schedule: ${schedule.name} for robot ${schedule.robotName}`);
                this.executeSchedule(schedule);
            }
        }
    }

    async executeSchedule(schedule) {
        // this.isProcessing = true; // Removed global lock
        try {
            const { robotIp } = schedule;
            const robotUrl = `ws://${robotIp}:9090`; // Assuming standard port

            console.log(`[ScheduleManager] Connecting to robot at ${robotUrl}...`);

            const ros = new ROSLIB.Ros({
                url: robotUrl
            });

            const connectPromise = new Promise((resolve, reject) => {
                ros.on('connection', () => resolve(true));
                ros.on('error', (error) => reject(error));
                ros.on('close', () => resolve(false)); // If closed before connected?
                // Timeout
                setTimeout(() => reject(new Error('Connection timeout')), 5000);
            });

            try {
                await connectPromise;
                console.log(`[ScheduleManager] Connected to robot ${schedule.robotName}`);

                // 1. Stand Up
                const upDownTopic = new ROSLIB.Topic({
                    ros: ros,
                    name: '/upDown',
                    messageType: 'std_msgs/String'
                });
                upDownTopic.publish(new ROSLIB.Message({ data: 'up' }));
                console.log(`[ScheduleManager] Sent 'up' command to /upDown`);

                // Wait for stand up
                await new Promise(resolve => setTimeout(resolve, 5000));

                // 2. Start Navigation
                const triggerTopic = new ROSLIB.Topic({
                    ros: ros,
                    name: '/trigger_launch',
                    messageType: 'std_msgs/String'
                });
                triggerTopic.publish(new ROSLIB.Message({ data: 'start' }));
                console.log(`[ScheduleManager] Sent 'start' command to /trigger_launch`);

                // Wait for navigation to start
                await new Promise(resolve => setTimeout(resolve, 10000));

                // 3. Start Task
                const startQueueTopic = new ROSLIB.Topic({
                    ros: ros,
                    name: '/goal_queue/start',
                    messageType: 'std_msgs/Empty'
                });
                startQueueTopic.publish(new ROSLIB.Message({}));
                console.log(`[ScheduleManager] Sent start command to /goal_queue/start`);

                // Close connection after a short delay to ensure message is sent
                setTimeout(() => {
                    ros.close();
                }, 1000);

            } catch (error) {
                console.log(`[ScheduleManager] Robot ${schedule.robotName} not connected or error: ${error.message}`);
                // As per requirement: "Not connected: do not do operation"
                // So we just log and exit.
            }

        } catch (error) {
            console.error('[ScheduleManager] Error executing schedule:', error);
        } finally {
            // this.isProcessing = false; // Removed global lock
        }
    }
}
