const API_BASE_URL = "/api";

export interface DetectionResult {
    filename: string;
    result: any;
    report_path?: string;
    report_url?: string;
    status: string;
    message?: string;
}

export interface Stream {
    id: string;
    name: string;
    rtsp_url: string;
    location?: string;
    description?: string;
    status: string;
}

export interface Report {
    name: string;
    modified: number;
}

export const aiService = {
    // Video Detection
    async detectVideo(file: File): Promise<DetectionResult> {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${API_BASE_URL}/detect/video`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    async getVideosList(folderPath: string = "videos"): Promise<any> {
        const response = await fetch(`${API_BASE_URL}/videos/list?folder_path=${encodeURIComponent(folderPath)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    async detectVideoFolder(folderPath: string): Promise<any> {
        const formData = new FormData();
        formData.append('folder_path', folderPath);
        const response = await fetch(`${API_BASE_URL}/detect/video/folder`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    // Streams
    async getStreams(): Promise<Stream[]> {
        const response = await fetch(`${API_BASE_URL}/streams`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.streams;
    },

    async addStream(rtspUrl: string, name?: string, location?: string, description?: string): Promise<any> {
        const formData = new FormData();
        formData.append('rtsp_url', rtspUrl);
        if (name) formData.append('name', name);
        if (location) formData.append('location', location);
        if (description) formData.append('description', description);

        const response = await fetch(`${API_BASE_URL}/streams/add`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    async deleteStream(streamId: string): Promise<any> {
        const response = await fetch(`${API_BASE_URL}/streams/${streamId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    // Schedules
    async addSchedule(streamId: string, startTime: string, duration: number, days: string, enabled: boolean = true): Promise<any> {
        const formData = new FormData();
        formData.append('stream_id', streamId);
        formData.append('start_time', startTime);
        formData.append('duration_minutes', duration.toString());
        formData.append('days', days);
        formData.append('enabled', enabled.toString());

        const response = await fetch(`${API_BASE_URL}/streams/schedule/add`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    async updateSchedule(scheduleId: string, data: { enabled?: boolean, start_time?: string, duration_minutes?: number, days?: string }): Promise<any> {
        const formData = new FormData();
        if (data.enabled !== undefined) formData.append('enabled', data.enabled.toString());
        if (data.start_time !== undefined) formData.append('start_time', data.start_time);
        if (data.duration_minutes !== undefined) formData.append('duration_minutes', data.duration_minutes.toString());
        if (data.days !== undefined) formData.append('days', data.days);

        const response = await fetch(`${API_BASE_URL}/streams/schedule/${scheduleId}`, {
            method: 'PUT',
            body: formData
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    async getSchedules(streamId?: string): Promise<any> {
        let url = `${API_BASE_URL}/streams/schedule/list`;
        if (streamId) {
            url += `?stream_id=${streamId}`;
        }
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    async deleteSchedule(scheduleId: string): Promise<any> {
        const response = await fetch(`${API_BASE_URL}/streams/schedule/${scheduleId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    // Reports
    async getReports(): Promise<Report[]> {
        const response = await fetch(`${API_BASE_URL}/history/reports`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    async deleteReport(filename: string): Promise<any> {
        const url = `${API_BASE_URL}/local/reports/delete?fileName=${encodeURIComponent(filename)}`;
        // 使用本地文件操作 API 删除报告
        // 注意：使用 /api/local/ 前缀避免被 /api/reports 的代理拦截
        const response = await fetch(url, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    getReportUrl(filename: string): string {
        return `${API_BASE_URL}/reports/${encodeURIComponent(filename)}`;
    }
};
