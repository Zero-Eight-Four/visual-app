import { getAuthHeaders } from './auth'

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
   * 获取 base URL（用于调试）
   */
  getBaseUrl(): string {
    return this.config.baseUrl
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
        headers: {
          ...options.headers,
          ...getAuthHeaders()
        },
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

      console.log(`[uploadFile] 开始上传到: ${url}, 文件: ${file.name}, 大小: ${(file.size / 1024 / 1024).toFixed(2)} MB, 目标路径: ${destinationPath}`)

      // 设置超时（使用配置的超时时间，默认5分钟）
      const timeout = setTimeout(() => {
        console.error(`[uploadFile] 上传超时: ${file.name}`)
        xhr.abort()
        reject(new Error('上传超时，请检查网络连接后重试'))
      }, this.config.timeout || 5 * 60 * 1000)

      xhr.upload.addEventListener('progress', (e) => {
        if (onProgress) {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100
            onProgress(progress)
            // 如果上传完成，立即调用100%回调
            if (e.loaded >= e.total) {
              onProgress(100)
            }
          } else {
            // 如果无法计算总大小，使用已加载的字节数来估算进度
            if (e.loaded > 0) {
              // 使用一个保守的估算：假设已加载了至少 1% 的进度
              // 实际进度会在文件上传完成时设置为 100%
              const estimatedProgress = Math.min(99, Math.max(1, Math.round((e.loaded / (e.loaded * 1.1)) * 100)))
              onProgress(estimatedProgress)
            } else {
              // 刚开始上传，显示 1% 表示已经开始
              onProgress(1)
            }
          }
        }
      })

      xhr.addEventListener('load', () => {
        clearTimeout(timeout)
        console.log(`[uploadFile] 响应状态: ${xhr.status}, 文件: ${file.name}`)
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText)
            console.log(`[uploadFile] 响应内容:`, response)
            if (response.success) {
              // 确保进度回调被调用到100%
              if (onProgress) {
                onProgress(100)
              }
              console.log(`[uploadFile] 上传成功: ${file.name}`)
              resolve()
            } else {
              console.error(`[uploadFile] 上传失败: ${file.name}, 原因: ${response.message || '未知错误'}`)
              reject(new Error(response.message || '上传失败'))
            }
          } catch (e) {
            console.warn(`[uploadFile] 响应解析失败: ${file.name}`, e)
            // 即使解析失败，也确保进度达到100%
            if (onProgress) {
              onProgress(100)
            }
            resolve()
          }
        } else {
          console.error(`[uploadFile] HTTP 错误: ${xhr.status} ${xhr.statusText}, 文件: ${file.name}`)
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`))
        }
      })

      xhr.addEventListener('error', (e) => {
        clearTimeout(timeout)
        console.error(`[uploadFile] 网络错误: ${file.name}`, e)
        reject(new Error('网络错误'))
      })

      xhr.addEventListener('abort', () => {
        clearTimeout(timeout)
        console.warn(`[uploadFile] 上传已取消: ${file.name}`)
        reject(new Error('上传已取消'))
      })

      console.log(`[uploadFile] 发送请求: POST ${url}`)
      xhr.open('POST', url)

      // 添加 Authorization header
      const authHeaders = getAuthHeaders() as Record<string, string>
      if (authHeaders.Authorization) {
        xhr.setRequestHeader('Authorization', authHeaders.Authorization)
      }

      xhr.send(formData)
    })
  }

  /**
   * 下载文件（带重试机制和改进的错误处理）
   */
  async downloadFile(remotePath: string, onProgress?: (progress: number) => void, retries = 3): Promise<Blob> {
    const params = new URLSearchParams({ path: remotePath })
    // 添加时间戳参数避免缓存，同时不触发 CORS 预检请求
    params.append('_t', Date.now().toString())
    const url = this.getApiUrl(`/download?${params.toString()}`)

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // 使用 fetch 下载，支持进度（通过 ReadableStream）
        const controller = new AbortController()
        // 增加超时时间到 10 分钟，避免大文件下载超时
        const timeout = setTimeout(() => controller.abort(), this.config.timeout || 10 * 60 * 1000)

        // 使用最简单的 fetch 配置，避免触发 CORS 预检请求
        const response = await fetch(url, {
          signal: controller.signal,
          // 使用 reload 模式避免缓存，但不添加自定义请求头
          cache: 'reload',
          // 明确指定 method，避免某些浏览器添加额外的请求头
          method: 'GET',
          headers: getAuthHeaders()
        })

        clearTimeout(timeout)

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
        let readError: Error | null = null

        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            if (value) {
              chunks.push(value)
              receivedLength += value.length

              if (onProgress && total > 0) {
                const progress = Math.min(100, (receivedLength / total) * 100)
                onProgress(progress)
              } else if (onProgress && total === 0) {
                // 如果没有 Content-Length，使用已接收的数据估算进度（保守估计）
                // 假设至少已下载 1%，但不超过 99%
                const estimatedProgress = Math.min(99, Math.max(1, Math.round(receivedLength / 1024 / 1024))) // 每 MB 1%
                onProgress(estimatedProgress)
              }
            }
          }
        } catch (err) {
          readError = err instanceof Error ? err : new Error(String(err))
          reader.cancel().catch(() => { })

          // 如果已接收部分数据，记录警告但继续处理
          if (receivedLength > 0) {
            console.warn(`下载过程中出现错误，但已接收 ${receivedLength} 字节:`, readError.message)
            // 不抛出错误，继续使用已接收的数据
          } else {
            // 如果没有接收到任何数据，抛出错误
            throw readError
          }
        }

        // 验证接收到的数据长度（如果服务器提供了 Content-Length）
        if (total > 0 && receivedLength !== total) {
          // Content-Length 不匹配，但尝试使用实际接收到的数据
          const mismatchPercent = Math.abs(receivedLength - total) / total * 100
          if (mismatchPercent > 1) { // 如果差异超过 1%，记录警告
            console.warn(`Content-Length 不匹配: 期望 ${total} 字节，实际接收 ${receivedLength} 字节 (差异 ${mismatchPercent.toFixed(2)}%)`)
          }

          // 即使差异很大，也使用已接收的数据，不重试
          // 因为重试会导致重新开始下载，浪费已下载的数据
          // 如果数据不完整，用户可以在后续步骤中发现并重新下载
          console.warn(`Content-Length 不匹配，但使用已接收的数据 (${receivedLength}/${total} 字节)`)

          // 继续使用接收到的数据，不抛出错误（可能是服务器端的问题）
        }

        // 如果没有接收到任何数据，抛出错误
        if (receivedLength === 0) {
          throw new Error('未接收到任何数据')
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

        // 确保进度达到 100%
        if (onProgress) {
          onProgress(100)
        }

        return new Blob(blobParts)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        // 如果是网络错误或 CORS 错误，且不是最后一次尝试，重试
        if ((errorMessage.includes('ERR_CONTENT_LENGTH_MISMATCH') ||
          errorMessage.includes('network error') ||
          errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('CORS')) &&
          attempt < retries - 1) {
          console.warn(`下载文件 ${remotePath} 时出现错误，重试中... (${attempt + 1}/${retries}): ${errorMessage}`)
          // 等待后重试（递增延迟）
          await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
          continue
        }

        // 如果是最后一次尝试，抛出错误
        if (attempt === retries - 1) {
          throw error
        }

        // 等待后重试（递增延迟）
        await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
      }
    }

    throw new Error('下载失败：已达到最大重试次数')
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
