import { getAuthHeaders } from '../utils/auth';
import { API_BASE_URL, GANG_QWEN_API_BASE } from '@/config';

const SECONDARY_AI_API_BASE_URL = GANG_QWEN_API_BASE;
const ENABLE_DUAL_AI = import.meta.env.VITE_ENABLE_DUAL_AI !== 'false';

type DualApiOptions = {
    method?: string;
    headers?: HeadersInit;
    bodyFactory?: () => BodyInit;
    mirror?: boolean;
    secondaryPath?: string;
}

export type AiBackendResult<T = any> = {
    ok: boolean;
    status: number;
    statusText: string;
    data: T | string | null;
    error?: string;
}

export type DualAiResult<T = any> = {
    path: string;
    secondaryPath: string | null;
    method: string;
    timestamp: string;
    primary: AiBackendResult<T>;
    secondary: AiBackendResult | null;
}

export const dualAiResponseHistory: DualAiResult[] = [];

if (typeof window !== 'undefined') {
    (window as any).__dualAiResponseHistory = dualAiResponseHistory;
}

const rememberDualAiResult = (result: DualAiResult) => {
    dualAiResponseHistory.unshift(result);
    if (dualAiResponseHistory.length > 50) {
        dualAiResponseHistory.pop();
    }
}

const parseResponseBody = async (response: Response) => {
    const text = await response.text();
    if (!text) return null;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

const requestBackend = async (url: string, method: string, headers: HeadersInit | undefined, bodyFactory?: () => BodyInit): Promise<AiBackendResult> => {
    try {
        const response = await fetch(url, {
            method,
            headers,
            body: bodyFactory?.()
        });

        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            data: await parseResponseBody(response)
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            statusText: 'Network Error',
            data: null,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

async function fetchDualAi<T = any>(path: string, options: DualApiOptions = {}): Promise<DualAiResult<T>> {
    const method = options.method || 'GET';
    const headers = options.headers;
    const mirror = ENABLE_DUAL_AI && options.mirror !== false;
    const secondaryPath = options.secondaryPath || path;

    const primaryPromise = requestBackend(`${API_BASE_URL}${path}`, method, headers, options.bodyFactory);
    const secondaryPromise = mirror
        ? requestBackend(`${SECONDARY_AI_API_BASE_URL}${secondaryPath}`, method, headers, options.bodyFactory)
        : Promise.resolve(null);

    const [primary, secondary] = await Promise.all([primaryPromise, secondaryPromise]);

    if (secondary && !secondary.ok) {
        console.warn(`[AI] secondary API returned ${secondary.status || secondary.statusText}: ${path}`, secondary.error || secondary.data);
    }

    const result: DualAiResult<T> = {
        path,
        secondaryPath: mirror ? secondaryPath : null,
        method,
        timestamp: new Date().toISOString(),
        primary: primary as AiBackendResult<T>,
        secondary
    };

    rememberDualAiResult(result);
    return result;
}

function assertOk(response: AiBackendResult): void {
    if (!response.ok) {
        throw new Error(response.error || `HTTP error! status: ${response.status}`);
    }
}

function primaryData<T>(result: DualAiResult<T>): T {
    assertOk(result.primary);
    return result.primary.data as T;
}

export interface DetectionResult {
    filename: string;
    result: any;
    report_path?: string;
    report_url?: string;
    status: string;
    message?: string;
    source?: string;
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
    source?: string;
}

const getSourceLabel = (source: 'primary' | 'secondary') => source === 'primary' ? '8000' : '8001';

const normalizeDetectionItems = (data: any, source: 'primary' | 'secondary'): DetectionResult[] => {
    const sourceLabel = getSourceLabel(source);
    const rawItems = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.data?.results)
            ? data.data.results
            : Array.isArray(data?.data)
                ? data.data
                : data?.result || data?.filename
                    ? [data]
                    : [];

    return rawItems.map((item: any, index: number) => {
        const filename = item.filename || item.name || item['图片名称'] || `检测结果 ${index + 1}`;
        const result = item.result || {
            '异常发现': item.result_type === '异常' || item.conclusion === '异常' || item['检测状态'] === '异常',
            '异常类型': item.category ? [item.category] : item['检测类别'] ? [item['检测类别']] : [],
            '异常描述': item.reason || item.conclusion || item['原因说明'] || item.message || '',
            '严重程度': item.severity || item['严重程度'] || '',
            '建议处理': item.suggestion || item['建议处理'] || ''
        };

        return {
            ...item,
            filename,
            result,
            source: item.source || sourceLabel
        };
    });
};

const normalizeReports = (data: any, source: 'primary' | 'secondary'): Report[] => {
    const sourceLabel = getSourceLabel(source);
    const rawReports = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.reports)
                ? data.reports
                : [];

    return rawReports
        .map((report: any) => {
            const name = report.name || report.filename || report.html_url?.split('/').pop();
            if (!name) return null;

            const modified = Number(report.modified)
                || (report.last_updated_at ? Date.parse(report.last_updated_at) / 1000 : 0)
                || (report.first_generated_at ? Date.parse(report.first_generated_at) / 1000 : 0)
                || 0;

            return {
                ...report,
                name,
                modified,
                source: report.source || sourceLabel
            };
        })
        .filter(Boolean) as Report[];
};

const mergeReports = (primaryDataValue: any, secondaryDataValue: any): Report[] => {
    const merged = new Map<string, Report>();

    for (const report of normalizeReports(primaryDataValue, 'primary')) {
        merged.set(report.name, report);
    }

    for (const report of normalizeReports(secondaryDataValue, 'secondary')) {
        const existing = merged.get(report.name);
        if (existing) {
            merged.set(report.name, {
                ...existing,
                source: existing.source === report.source ? existing.source : `${existing.source}/${report.source}`,
                modified: Math.max(existing.modified || 0, report.modified || 0)
            });
        } else {
            merged.set(report.name, report);
        }
    }

    return Array.from(merged.values()).sort((a, b) => (b.modified || 0) - (a.modified || 0));
};

export const aiService = {
    // Video Detection
    async detectVideo(file: File): Promise<DetectionResult> {
        const result = await fetchDualAi<DetectionResult>('/detect/video', {
            method: 'POST',
            headers: getAuthHeaders(),
            secondaryPath: '/detect/single',
            bodyFactory: () => {
                const formData = new FormData();
                formData.append('file', file);
                return formData;
            }
        });
        return primaryData(result);
    },

    async getVideosList(folderPath: string = "videos"): Promise<any> {
        const result = await fetchDualAi(`/videos/list?folder_path=${encodeURIComponent(folderPath)}`, {
            headers: getAuthHeaders(),
            mirror: false
        });
        return primaryData(result);
    },

    async detectVideoFolder(folderPath: string): Promise<any> {
        const result = await fetchDualAi('/detect/video/folder', {
            method: 'POST',
            headers: getAuthHeaders(),
            secondaryPath: '/detect/folder',
            bodyFactory: () => {
                const formData = new FormData();
                formData.append('folder_path', folderPath);
                return formData;
            }
        });
        const primary = primaryData(result);
        const secondary = result.secondary?.ok ? result.secondary.data : null;
        const mergedResults = [
            ...normalizeDetectionItems(primary, 'primary'),
            ...normalizeDetectionItems(secondary, 'secondary')
        ];

        return {
            ...(typeof primary === 'object' && primary ? primary : {}),
            results: mergedResults,
            summary: {
                ...(primary?.summary || {}),
                success: mergedResults.length
            },
            secondary_result: result.secondary
        };
    },

    // Streams
    async getStreams(): Promise<Stream[]> {
        const result = await fetchDualAi<{ streams: Stream[] }>('/streams', {
            headers: getAuthHeaders(),
            mirror: false
        });
        const data = primaryData(result);
        return data.streams;
    },

    async addStream(rtspUrl: string, name?: string, location?: string, description?: string): Promise<any> {
        const result = await fetchDualAi('/streams/add', {
            method: 'POST',
            headers: getAuthHeaders(),
            mirror: false,
            bodyFactory: () => {
                const formData = new FormData();
                formData.append('rtsp_url', rtspUrl);
                if (name) formData.append('name', name);
                if (location) formData.append('location', location);
                if (description) formData.append('description', description);
                return formData;
            }
        });
        return primaryData(result);
    },

    async deleteStream(streamId: string): Promise<any> {
        const result = await fetchDualAi(`/streams/${streamId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            mirror: false
        });
        return primaryData(result);
    },

    // Schedules
    async addSchedule(streamId: string, startTime: string, duration: number, days: string, enabled: boolean = true): Promise<any> {
        const result = await fetchDualAi('/streams/schedule/add', {
            method: 'POST',
            headers: getAuthHeaders(),
            mirror: false,
            bodyFactory: () => {
                const formData = new FormData();
                formData.append('stream_id', streamId);
                formData.append('start_time', startTime);
                formData.append('duration_minutes', duration.toString());
                formData.append('days', days);
                formData.append('enabled', enabled.toString());
                return formData;
            }
        });
        return primaryData(result);
    },

    async updateSchedule(scheduleId: string, data: { enabled?: boolean, start_time?: string, duration_minutes?: number, days?: string }): Promise<any> {
        const result = await fetchDualAi(`/streams/schedule/${scheduleId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            mirror: false,
            bodyFactory: () => {
                const formData = new FormData();
                if (data.enabled !== undefined) formData.append('enabled', data.enabled.toString());
                if (data.start_time !== undefined) formData.append('start_time', data.start_time);
                if (data.duration_minutes !== undefined) formData.append('duration_minutes', data.duration_minutes.toString());
                if (data.days !== undefined) formData.append('days', data.days);
                return formData;
            }
        });
        return primaryData(result);
    },

    async getSchedules(streamId?: string): Promise<any> {
        let url = `${API_BASE_URL}/streams/schedule/list`;
        if (streamId) {
            url += `?stream_id=${streamId}`;
        }
        const result = await fetchDualAi(url.replace(API_BASE_URL, ''), {
            headers: getAuthHeaders(),
            mirror: false
        });
        return primaryData(result);
    },

    async deleteSchedule(scheduleId: string): Promise<any> {
        const result = await fetchDualAi(`/streams/schedule/${scheduleId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            mirror: false
        });
        return primaryData(result);
    },

    // Reports
    async getReports(): Promise<Report[]> {
        const result = await fetchDualAi<Report[]>('/history/reports', {
            headers: getAuthHeaders()
        });
        const primary = primaryData(result);
        const secondary = result.secondary?.ok ? result.secondary.data : null;
        return mergeReports(primary, secondary);
    },

    async deleteReport(filename: string): Promise<any> {
        const url = `${API_BASE_URL}/local/reports/delete?fileName=${encodeURIComponent(filename)}`;
        // 使用本地文件操作 API 删除报告
        // 注意：使用 /api/local/ 前缀避免被 /api/reports 的代理拦截
        const response = await fetch(url, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    },

    getReportUrl(filename: string, source?: string): string {
        const baseUrl = ENABLE_DUAL_AI && source === '8001' ? GANG_QWEN_API_BASE : API_BASE_URL;
        // 如果是生产环境，返回完整 URL
        if (import.meta.env.PROD) {
            return `${baseUrl}/reports/${encodeURIComponent(filename)}`;
        }
        return `${baseUrl}/reports/${encodeURIComponent(filename)}`;
    }
};
