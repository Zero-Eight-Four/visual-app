/**
 * 基于 HTTP API 的文件传输工具
 * 不依赖 rosbridge，直接通过 HTTP 请求进行文件传输
 * 
 * 后端 API 说明：
 * - BASE_DIR = '/home/unitree/go2_nav/system'
 * - 所有路径参数（path, destination, source）都是相对于 BASE_DIR 的路径
 * - 例如：上传到 map 目录，destination 应该是 'map'，而不是完整路径
 * - 后端会自动处理路径拼接和安全检查（确保路径在 BASE_DIR 下）
 */

// 文件传输配置
export interface HttpFileTransferConfig {
  baseUrl: string // 例如: http://192.168.1.100:8080
  apiPrefix?: string // 例如: /api/files
  timeout?: number // 请求超时时间（毫秒）
}

// 文件项接口
export interface HttpFileItem {
  name: string
  type: 'file' | 'directory'
  size?: number
  path: string
  modified?: string
}

// 默认配置
const DEFAULT_CONFIG: Partial<HttpFileTransferConfig> = {
  apiPrefix: '/api/files',
  timeout: 30000
}

/**
 * HTTP 文件传输客户端类
 */
export class HttpFileTransferClient {
  private config: HttpFileTransferConfig

  constructor(config: HttpFileTransferConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as HttpFileTransferConfig
  }

  /**
   * 获取完整的 API URL
   */
  private getApiUrl(endpoint: string): string {
    const prefix = this.config.apiPrefix || ''
    return `${this.config.baseUrl}${prefix}${endpoint}`
  }

  /**
   * 发送 HTTP 请求
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = this.getApiUrl(endpoint)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
      }

      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        return await response.json()
      } else {
        return (await response.blob()) as unknown as T
      }
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('请求超时')
      }
      throw error
    }
  }

  /**
   * 列出目录内容
   */
  async listDirectory(path: string): Promise<HttpFileItem[]> {
    const params = new URLSearchParams({ path })
    const result = await this.request<{
      success: boolean
      items?: HttpFileItem[]
      message?: string
    }>(`/list?${params.toString()}`)

    if (!result.success) {
      throw new Error(result.message || '列出目录失败')
    }

    return result.items || []
  }

  /**
   * 上传文件
   */
  async uploadFile(
    file: File,
    destinationPath: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('destination', destinationPath)

    // 使用 XMLHttpRequest 以支持上传进度
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const url = this.getApiUrl('/upload')

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const progress = (e.loaded / e.total) * 100
          onProgress(progress)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText)
            if (response.success) {
              resolve()
            } else {
              reject(new Error(response.message || '上传失败'))
            }
          } catch {
            resolve()
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('网络错误'))
      })

      xhr.addEventListener('abort', () => {
        reject(new Error('上传已取消'))
      })

      xhr.open('POST', url)
      xhr.send(formData)
    })
  }

  /**
   * 下载文件
   */
  async downloadFile(remotePath: string, onProgress?: (progress: number) => void): Promise<Blob> {
    const params = new URLSearchParams({ path: remotePath })
    const url = this.getApiUrl(`/download?${params.toString()}`)

    // 使用 fetch 下载，支持进度（通过 ReadableStream）
    const response = await fetch(url)
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
    }

    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength, 10) : 0

    if (!response.body) {
      throw new Error('响应体为空')
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let receivedLength = 0

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      if (value) {
        chunks.push(value)
        receivedLength += value.length

        if (onProgress && total > 0) {
          const progress = (receivedLength / total) * 100
          onProgress(progress)
        }
      }
    }

    // 将 Uint8Array 数组转换为 Blob
    // 确保每个 chunk 都是独立的 Uint8Array
    const blobParts: BlobPart[] = chunks.map((chunk) => {
      // 创建新的 ArrayBuffer 副本以避免类型问题
      const buffer = new ArrayBuffer(chunk.byteLength)
      const view = new Uint8Array(buffer)
      view.set(chunk)
      return view
    })
    return new Blob(blobParts)
  }

  /**
   * 移动文件
   */
  async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    const result = await this.request<{ success: boolean; message?: string }>('/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: sourcePath, destination: destinationPath })
    })

    if (!result.success) {
      throw new Error(result.message || '移动文件失败')
    }
  }

  /**
   * 复制文件
   */
  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    const result = await this.request<{ success: boolean; message?: string }>('/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: sourcePath, destination: destinationPath })
    })

    if (!result.success) {
      throw new Error(result.message || '复制文件失败')
    }
  }

  /**
   * 删除文件或目录
   */
  async deleteFile(path: string): Promise<void> {
    const result = await this.request<{ success: boolean; message?: string }>('/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    })

    if (!result.success) {
      throw new Error(result.message || '删除失败')
    }
  }

  /**
   * 创建目录
   */
  async createDirectory(path: string): Promise<void> {
    const result = await this.request<{ success: boolean; message?: string }>('/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    })

    if (!result.success) {
      throw new Error(result.message || '创建目录失败')
    }
  }

  /**
   * 检查连接
   */
  async checkConnection(): Promise<boolean> {
    try {
      const result = await this.request<{ success: boolean }>('/health', {
        method: 'GET'
      })
      return result.success !== false
    } catch {
      return false
    }
  }
}

/**
 * 从 WebSocket URL 提取 HTTP URL
 * 例如: ws://192.168.1.100:9090 -> http://192.168.1.100:8080
 * 确保不使用 localhost 或 127.0.0.1，避免与本地开发服务器冲突
 */
export function extractHttpUrlFromWsUrl(wsUrl: string, httpPort: number = 8080): string {
  try {
    const url = new URL(wsUrl)
    const hostname = url.hostname
    
    // 如果 hostname 是 localhost 或 127.0.0.1，抛出错误
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      throw new Error('不能使用 localhost 连接机器狗，请使用机器狗的实际 IP 地址')
    }
    
    return `http://${hostname}:${httpPort}`
  } catch (error) {
    // 如果解析失败，尝试简单替换
    let httpUrl = wsUrl
      .replace('ws://', 'http://')
      .replace('wss://', 'https://')
      .replace(/:\d+/, `:${httpPort}`)
    
    // 检查是否包含 localhost
    if (httpUrl.includes('localhost') || httpUrl.includes('127.0.0.1')) {
      throw new Error('不能使用 localhost 连接机器狗，请使用机器狗的实际 IP 地址')
    }
    
    return httpUrl
  }
}

/**
 * 创建默认的 HTTP 文件传输客户端
 * 从 ROS 连接 URL 自动推断 HTTP 服务地址
 */
export function createHttpFileTransferClient(
  wsUrl: string,
  httpPort: number = 8080
): HttpFileTransferClient {
  const baseUrl = extractHttpUrlFromWsUrl(wsUrl, httpPort)
  return new HttpFileTransferClient({ baseUrl })
}
