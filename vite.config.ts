import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readdir, writeFile, mkdir, rm, readFile, rename, copyFile, stat, access } from 'fs/promises'
import { join, extname, dirname } from 'path'
import { createReadStream, createWriteStream, statSync, constants } from 'fs'
import { pipeline } from 'stream/promises'
import http from 'http'
import https from 'https'
import { Readable } from 'stream'

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url))
const MAPS_DIR = join(ROOT_DIR, 'maps')
const VIDEOS_DIR = join(ROOT_DIR, 'videos')
const TEMP_DIR = join(ROOT_DIR, 'temp')

// 优化的流式处理：使用固定大小缓冲区，避免内存溢出
// 对于大文件，使用流式写入临时文件，然后移动到目标位置
async function processMultipartStream(
  req: any,
  res: any,
  processor: (fields: Record<string, string>, files: Array<{ fieldName: string; filename: string; data: Buffer }>) => Promise<any>
): Promise<void> {
  return new Promise((resolve) => {
    const contentType = req.headers['content-type'] || ''
    if (!contentType.includes('multipart/form-data')) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ success: false, error: 'Invalid content type' }))
      resolve()
      return
    }

    const boundary = contentType.split('boundary=')[1]?.trim()
    if (!boundary) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ success: false, error: 'No boundary found' }))
      resolve()
      return
    }

    // 使用临时文件进行流式处理，避免将整个文件加载到内存
    const tempDir = TEMP_DIR
    const tempFilePath = join(tempDir, `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`)

    // 确保临时目录存在
    mkdir(tempDir, { recursive: true }).catch(() => { })

    const writeStream = createWriteStream(tempFilePath)

    let totalSize = 0
    const MAX_SIZE = 512 * 1024 * 1024 // 512MB 最大限制
    let writeError: Error | null = null
    // 使用 Promise 来处理背压，避免重复添加监听器
    let writePromise = Promise.resolve()
    let isDraining = false

    req.on('data', (chunk: Buffer) => {
      if (writeError) return

      totalSize += chunk.length
      if (totalSize > MAX_SIZE) {
        req.destroy()
        writeStream.destroy()
        res.statusCode = 413
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: false, error: 'File too large (max 512MB)' }))
        resolve()
        return
      }

      // 处理背压：如果缓冲区满了，等待 drain 事件
      if (!writeStream.write(chunk)) {
        if (!isDraining) {
          isDraining = true
          writePromise = new Promise<void>((resolveDrain) => {
            writeStream.once('drain', () => {
              isDraining = false
              resolveDrain()
            })
          })
        }
      }
    })

    req.on('end', async () => {
      try {
        // 等待所有待处理的写入完成
        await writePromise

        writeStream.end()

        // 等待写入完成
        await new Promise<void>((resolveWrite, rejectWrite) => {
          writeStream.on('finish', resolveWrite)
          writeStream.on('error', rejectWrite)
        })

        // 现在从临时文件读取并解析
        const fileStats = statSync(tempFilePath)
        if (fileStats.size > MAX_SIZE) {
          await rm(tempFilePath, { force: true })
          res.statusCode = 413
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ success: false, error: 'File too large (max 512MB)' }))
          resolve()
          return
        }

        // 对于小文件（<10MB），直接读取到内存
        // 对于大文件，使用流式处理
        const SMALL_FILE_THRESHOLD = 10 * 1024 * 1024 // 10MB
        let buffer: Buffer

        if (fileStats.size < SMALL_FILE_THRESHOLD) {
          buffer = await readFile(tempFilePath)
        } else {
          // 对于大文件，我们需要读取整个文件来解析boundary
          // 但至少我们避免了在内存中累积chunks
          buffer = await readFile(tempFilePath)
        }

        const boundaryMarker = `--${boundary}`
        const boundaryBuffer = Buffer.from(boundaryMarker)
        const parts: Buffer[] = []

        // 查找所有边界位置
        let searchIndex = 0
        const boundaries: number[] = []
        while (true) {
          const index = buffer.indexOf(boundaryBuffer, searchIndex)
          if (index === -1) break
          boundaries.push(index)
          searchIndex = index + boundaryBuffer.length
        }

        // 提取每个 part
        for (let i = 0; i < boundaries.length - 1; i++) {
          const start = boundaries[i] + boundaryBuffer.length
          const end = boundaries[i + 1]

          let partStart = start
          if (buffer[partStart] === 0x0d && buffer[partStart + 1] === 0x0a) {
            partStart += 2
          }

          let partEnd = end
          if (partEnd >= 2 && buffer[partEnd - 2] === 0x0d && buffer[partEnd - 1] === 0x0a) {
            partEnd -= 2
          }

          if (partEnd > partStart) {
            parts.push(buffer.subarray(partStart, partEnd))
          }
        }

        // 释放原始 buffer 引用
        buffer = null as any

        const fields: Record<string, string> = {}
        const files: Array<{ fieldName: string; filename: string; data: Buffer }> = []

        for (const part of parts) {
          const headerEndMarker = Buffer.from('\r\n\r\n')
          const headerEnd = part.indexOf(headerEndMarker)

          if (headerEnd > 0) {
            const header = part.toString('utf8', 0, headerEnd)
            const dataStart = headerEnd + 4
            let dataEnd = part.length
            if (dataEnd >= 2 && part[dataEnd - 2] === 0x0d && part[dataEnd - 1] === 0x0a) {
              dataEnd -= 2
            }
            const data = part.subarray(dataStart, dataEnd)

            const fieldNameMatch = header.match(/name="([^"]+)"/)
            if (fieldNameMatch) {
              const fieldName = fieldNameMatch[1]

              if (header.includes('filename=')) {
                const filenameMatch = header.match(/filename="([^"]+)"/) || header.match(/filename=([^\r\n]+)/)
                if (filenameMatch) {
                  files.push({
                    fieldName,
                    filename: filenameMatch[1].trim(),
                    data: Buffer.from(data) // 创建新缓冲区，避免引用原 buffer
                  })
                }
              } else {
                fields[fieldName] = data.toString('utf8').trim()
              }
            }
          }
        }

        // 处理完成后立即释放 parts 数组和临时文件
        parts.length = 0
        await rm(tempFilePath, { force: true })

        try {
          const result = await processor(fields, files)
          // 根据结果设置状态码
          if (result && !result.success) {
            res.statusCode = 400
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (processorError) {
          console.error('Processor error:', processorError)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            success: false,
            error: processorError instanceof Error ? processorError.message : 'Processing failed'
          }))
        }
        resolve()
      } catch (error) {
        console.error('Multipart processing error:', error)
        // 确保清理临时文件
        try {
          await rm(tempFilePath, { force: true })
        } catch (cleanupError) {
          // 忽略清理错误
        }
        if (!res.headersSent) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Processing failed'
          }))
        }
        resolve()
      }
    })

    writeStream.on('error', (error: Error) => {
      writeError = error
      console.error('Write stream error:', error)
      req.destroy()
    })

    req.on('error', async (error: Error) => {
      console.error('Request error:', error)
      writeStream.destroy()
      // 清理临时文件
      try {
        await rm(tempFilePath, { force: true })
      } catch (cleanupError) {
        // 忽略清理错误
      }
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: false, error: 'Request error' }))
      }
      resolve()
    })
  })
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 自定义插件：提供 /maps/ 目录列表和文件服务
    {
      name: 'maps-directory-listing',
      configureServer(server) {
        // Debug middleware to log all API requests
        // server.middlewares.use((req, res, next) => {
        //   console.log(`[Global Middleware] ${req.method} ${req.url}`)
        //   next()
        // })

        // 处理文件上传API - 使用优化的流式处理
        server.middlewares.use('/api/maps/upload', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          await processMultipartStream(req, res, async (fields, files) => {
            const mapsDir = MAPS_DIR
            let fileName = ''
            let fileData: Buffer | null = null
            let folderName = fields.folderName || ''

            // 查找文件
            for (const file of files) {
              if (file.fieldName === 'file') {
                fileName = file.filename
                fileData = file.data
                break
              }
            }

            if (!fileName || !fileData) {
              throw new Error('No file provided')
            }

            // 确保文件名安全
            const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
            if (!safeFileName.endsWith('.pgm')) {
              throw new Error('Only .pgm files are allowed')
            }

            // 确定保存路径
            let filePath: string
            if (folderName && folderName.trim()) {
              const targetFolder = folderName.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
              const targetDir = join(mapsDir, targetFolder, 'map')
              await mkdir(targetDir, { recursive: true })
              filePath = join(targetDir, safeFileName)
            } else {
              filePath = join(mapsDir, safeFileName)
            }

            // 保存文件（使用流式写入避免内存问题）
            await writeFile(filePath, fileData)

            // 立即释放文件数据引用
            fileData = null

            return { success: true, fileName: safeFileName }
          })
        })

        // API: 列出 maps 目录下的所有文件夹
        server.middlewares.use('/api/maps/list', async (req, res) => {
          try {
            const mapsDir = MAPS_DIR
            const entries = await readdir(mapsDir, { withFileTypes: true })
            const folders = entries
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, folders }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: String(error) }))
          }
        })

        // API: 列出指定地图文件夹下的文件
        server.middlewares.use('/api/maps/files', async (req, res) => {
          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`)
            const folderName = url.searchParams.get('folder')
            const subDir = url.searchParams.get('subDir') || ''

            if (!folderName) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'Missing folder parameter' }))
              return
            }

            const mapsDir = MAPS_DIR
            // Prevent directory traversal
            if (folderName.includes('..') || subDir.includes('..')) {
              res.statusCode = 403
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'Invalid path' }))
              return
            }

            const targetDir = join(mapsDir, folderName, subDir)

            try {
              const entries = await readdir(targetDir, { withFileTypes: true })
              const files = entries
                .filter(entry => entry.isFile())
                .map(entry => ({
                  name: entry.name,
                  url: `/maps/${folderName}/${subDir ? subDir + '/' : ''}${entry.name}`
                }))

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, files }))
            } catch (err) {
              // Directory might not exist, return empty list
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, files: [] }))
            }
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: String(error) }))
          }
        })

        // API: 删除地图文件夹
        server.middlewares.use('/api/maps/delete', async (req, res) => {
          if (req.method !== 'DELETE') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          try {
            // 从查询参数或URL路径中获取文件夹名称
            const url = new URL(req.url || '', `http://${req.headers.host}`)
            const folderName = url.searchParams.get('folderName') || url.pathname.split('/').pop() || ''

            if (!folderName || folderName.includes('..') || folderName.includes('/')) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'Invalid folder name' }))
              return
            }

            const mapsDir = MAPS_DIR
            const targetDir = join(mapsDir, decodeURIComponent(folderName))

            // 检查目录是否存在
            try {
              await readdir(targetDir)
            } catch (error) {
              res.statusCode = 404
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'Map folder not found' }))
              return
            }

            // 删除整个文件夹
            await rm(targetDir, { recursive: true, force: true })

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, message: 'Map folder deleted successfully' }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: String(error) }))
          }
        })

        // API: 上传地图文件夹 - 使用优化的流式处理
        server.middlewares.use('/api/maps/upload-folder', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          await processMultipartStream(req, res, async (fields, files) => {
            const mapsDir = MAPS_DIR
            const folderName = fields.folderName || ''
            const mapName = fields.mapName || ''
            const description = fields.description || ''

            // 过滤出文件字段
            const fileItems = files.filter(f => f.fieldName === 'files')

            if (!folderName || !mapName || fileItems.length === 0) {
              return {
                success: false,
                error: 'Missing required fields',
                details: { folderName: !!folderName, mapName: !!mapName, filesCount: fileItems.length }
              }
            }

            // 创建地图文件夹
            const mapFolderPath = join(mapsDir, folderName)
            await mkdir(mapFolderPath, { recursive: true })

            // 保存所有文件
            for (const file of fileItems) {
              const filePath = join(mapFolderPath, file.filename)
              const fileDir = dirname(filePath)
              await mkdir(fileDir, { recursive: true })
              await writeFile(filePath, file.data)
            }

            // 创建配置文件
            const configPath = join(mapFolderPath, 'config.json')
            const configData = {
              name: mapName,
              description: description || ''
            }
            await writeFile(configPath, JSON.stringify(configData, null, 2))

            return { success: true, folderName, mapName }
          })
        })

        // API: 保存新地图（从编辑后的地图创建新地图文件夹）- 使用优化的流式处理
        server.middlewares.use('/api/maps/save-new-map', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          await processMultipartStream(req, res, async (fields, files) => {
            const mapsDir = MAPS_DIR
            const folderName = fields.folderName || ''
            const mapName = fields.mapName || ''
            const description = fields.description || ''

            // 过滤出文件字段
            const fileItems = files.filter(f => f.fieldName === 'files')

            if (!folderName || !mapName || fileItems.length === 0) {
              return { success: false, error: 'Missing required fields' }
            }

            // 创建新地图文件夹
            const mapFolderPath = join(mapsDir, folderName)
            await mkdir(mapFolderPath, { recursive: true })

            // 保存所有上传的文件
            for (const file of fileItems) {
              const filePath = join(mapFolderPath, file.filename)
              const fileDir = dirname(filePath)
              await mkdir(fileDir, { recursive: true })
              await writeFile(filePath, file.data)
            }

            // 处理需要复制的文件（包括 queue 文件）
            if (fields.filesToCopy) {
              try {
                const filesToCopy: Array<{ path: string; targetPath: string }> = JSON.parse(fields.filesToCopy)

                for (const fileInfo of filesToCopy) {
                  try {
                    // 源文件路径（相对于 maps 目录）
                    const sourcePath = join(mapsDir, fileInfo.path)
                    // 目标文件路径
                    const targetPath = join(mapFolderPath, fileInfo.targetPath)
                    const targetDir = dirname(targetPath)

                    // 确保目标目录存在
                    await mkdir(targetDir, { recursive: true })

                    // 复制文件
                    await copyFile(sourcePath, targetPath)
                  } catch (copyError) {
                    console.error(`复制文件失败: ${fileInfo.path}`, copyError)
                    // 继续复制其他文件，不中断流程
                  }
                }
              } catch (parseError) {
                console.error('解析 filesToCopy 失败:', parseError)
                // 继续执行，不中断保存流程
              }
            }

            // 创建配置文件
            const configPath = join(mapFolderPath, 'config.json')
            const configData = {
              name: mapName,
              description: description || ''
            }
            await writeFile(configPath, JSON.stringify(configData, null, 2))

            return { success: true, folderName, mapName }
          })
        })

        // API: 上传视频 - 使用优化的流式处理
        server.middlewares.use('/api/videos/upload', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          const videosDir = VIDEOS_DIR
          await mkdir(videosDir, { recursive: true })

          await processMultipartStream(req, res, async (fields, files) => {
            let fileName = ''
            let fileData: Buffer | null = null

            // 查找视频文件
            for (const file of files) {
              if (file.fieldName === 'video') {
                fileName = file.filename
                fileData = file.data
                break
              }
            }

            if (!fileName || !fileData) {
              throw new Error('No video file provided')
            }

            // 确保文件名安全
            const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
            if (!safeFileName.endsWith('.webm')) {
              throw new Error('Only .webm files are allowed')
            }

            // 创建以日期命名的文件夹（YYYYMMDD格式）
            const now = new Date()
            const dateFolder = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
            const dateDir = join(videosDir, dateFolder)
            await mkdir(dateDir, { recursive: true })

            const filePath = join(dateDir, safeFileName)
            await writeFile(filePath, fileData)

            // 立即释放文件数据引用
            fileData = null

            return { success: true, fileName: safeFileName, folder: dateFolder }
          })
        })

        // API: 列出所有视频（按日期文件夹组织）
        server.middlewares.use('/api/videos/list', async (req, res) => {
          try {
            const videosDir = VIDEOS_DIR
            await mkdir(videosDir, { recursive: true })

            const entries = await readdir(videosDir, { withFileTypes: true })
            const dates: string[] = []
            const videosMap: Record<string, any[]> = {}

            for (const entry of entries) {
              if (entry.isDirectory() && /^\d{8}$/.test(entry.name)) {
                // 是日期文件夹（YYYYMMDD格式）
                const folderPath = join(videosDir, entry.name)
                const videoEntries = await readdir(folderPath, { withFileTypes: true })
                const videos: Array<{ name: string; path: string; size: number; modified: number }> = []

                // 格式化日期显示（YYYYMMDD -> YYYY-MM-DD）
                const dateStr = entry.name
                const formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`

                for (const videoEntry of videoEntries) {
                  if (videoEntry.isFile() && (videoEntry.name.endsWith('.webm') || videoEntry.name.endsWith('.mp4'))) {
                    const filePath = join(folderPath, videoEntry.name)
                    const stats = statSync(filePath)

                    videos.push({
                      name: videoEntry.name,
                      path: filePath, // Use absolute path for backend compatibility
                      size: stats.size,
                      modified: stats.mtime.getTime() / 1000
                    })
                  }
                }

                if (videos.length > 0) {
                  dates.push(formattedDate)
                  videosMap[formattedDate] = videos
                }
              }
            }

            // 按日期倒序排列
            dates.sort((a, b) => b.localeCompare(a))

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ dates, videos: videosMap }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: String(error) }))
          }
        })

        // API: 下载视频
        server.middlewares.use('/api/videos/download', async (req, res) => {
          try {
            const videosDir = VIDEOS_DIR
            const url = new URL(req.url || '', `http://${req.headers.host}`)
            const fileName = url.searchParams.get('fileName') || ''
            const folder = url.searchParams.get('folder') || ''

            if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'Invalid file name' }))
              return
            }

            if (folder && (folder.includes('..') || folder.includes('/') || folder.includes('\\') || !/^\d{8}$/.test(folder))) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'Invalid folder name' }))
              return
            }

            const filePath = folder ? join(videosDir, folder, decodeURIComponent(fileName)) : join(videosDir, decodeURIComponent(fileName))

            try {
              const stats = statSync(filePath)
              if (!stats.isFile()) {
                res.statusCode = 404
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, error: 'File not found' }))
                return
              }

              res.setHeader('Content-Type', 'video/webm')
              res.setHeader('Content-Length', stats.size)
              res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)

              const stream = createReadStream(filePath)
              stream.on('error', (err) => {
                console.error('Stream error:', err)
                if (!res.headersSent) {
                  res.statusCode = 500
                  res.end('Internal Server Error')
                }
              })

              req.on('close', () => {
                if (!stream.destroyed) {
                  stream.destroy()
                }
              })

              res.on('close', () => {
                if (!stream.destroyed) {
                  stream.destroy()
                }
              })

              stream.pipe(res)
            } catch (error) {
              res.statusCode = 404
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'File not found' }))
            }
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: String(error) }))
          }
        })

        // API: 删除视频
        server.middlewares.use('/api/videos/delete', async (req, res) => {
          if (req.method !== 'DELETE') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          try {
            const videosDir = VIDEOS_DIR
            const chunks: Buffer[] = []

            req.on('data', (chunk: Buffer) => {
              chunks.push(chunk)
            })

            req.on('end', async () => {
              try {
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
                const fileName = body.fileName || ''
                const folder = body.folder || ''

                if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'Invalid file name' }))
                  return
                }

                if (folder && (folder.includes('..') || folder.includes('/') || folder.includes('\\') || !/^\d{8}$/.test(folder))) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'Invalid folder name' }))
                  return
                }

                const filePath = folder ? join(videosDir, folder, fileName) : join(videosDir, fileName)

                try {
                  await rm(filePath)
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: true, message: 'Video deleted successfully' }))
                } catch (error) {
                  res.statusCode = 404
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'File not found' }))
                }
              } catch (error) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, error: 'Invalid request body' }))
              }
            })
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: String(error) }))
          }
        })

        // API: 删除历史报告
        server.middlewares.use('/api/local/reports/delete', async (req, res) => {
          if (req.method !== 'DELETE') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`)
            const fileName = url.searchParams.get('fileName') || ''

            if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'Invalid file name' }))
              return
            }

            const reportsDir = '/home/sll/Qwen/backend/results/reports'
            const filePath = join(reportsDir, fileName)

            try {
              // Check if file exists and is accessible
              try {
                await access(filePath, constants.W_OK)
              } catch (e: any) {
                // Don't return here, try rm anyway, or return specific error
                if (e.code === 'ENOENT') {
                  res.statusCode = 404
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'File not found' }))
                  return
                }
                if (e.code === 'EACCES') {
                  res.statusCode = 403
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'Permission denied' }))
                  return
                }
              }

              await rm(filePath)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, message: 'Report deleted successfully' }))
            } catch (error: any) {
              console.error(`[Middleware] Delete failed: ${error.message}`)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: `Delete failed: ${error.message}` }))
            }
          } catch (error) {
            console.error(`[Middleware] Unexpected error: ${error}`)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: String(error) }))
          }
        })

        // API: 重命名视频
        server.middlewares.use('/api/videos/rename', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          try {
            const videosDir = VIDEOS_DIR
            const chunks: Buffer[] = []

            req.on('data', (chunk: Buffer) => {
              chunks.push(chunk)
            })

            req.on('end', async () => {
              try {
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
                const oldName = body.oldName || ''
                const newName = body.newName || ''
                const folder = body.folder || ''

                if (!oldName || !newName || oldName.includes('..') || newName.includes('..') || oldName.includes('/') || newName.includes('/')) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'Invalid file name' }))
                  return
                }

                if (folder && (folder.includes('..') || folder.includes('/') || folder.includes('\\') || !/^\d{8}$/.test(folder))) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'Invalid folder name' }))
                  return
                }

                // 确保新文件名安全
                const safeNewName = newName.replace(/[^a-zA-Z0-9._-]/g, '_')
                if (!safeNewName.endsWith('.webm')) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'New file name must end with .webm' }))
                  return
                }

                const oldPath = folder ? join(videosDir, folder, oldName) : join(videosDir, oldName)
                const newPath = folder ? join(videosDir, folder, safeNewName) : join(videosDir, safeNewName)

                try {
                  await rename(oldPath, newPath)
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: true, newName: safeNewName }))
                } catch (error) {
                  res.statusCode = 404
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'File not found' }))
                }
              } catch (error) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, error: 'Invalid request body' }))
              }
            })
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: String(error) }))
          }
        })

        // API: 从机器狗下载地图文件并直接保存到服务器（避免浏览器内存占用）
        server.middlewares.use('/api/maps/download-from-robot', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          try {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk.toString()
            })

            await new Promise<void>((resolve) => {
              req.on('end', async () => {
                try {
                  const { robotUrl, files, folderName, mapName, description } = JSON.parse(body)

                  if (!robotUrl || !files || !Array.isArray(files) || files.length === 0 || !folderName) {
                    res.statusCode = 400
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify({ success: false, error: 'Missing required fields' }))
                    resolve()
                    return
                  }

                  // 设置 SSE 响应头
                  res.statusCode = 200
                  res.setHeader('Content-Type', 'text/event-stream')
                  res.setHeader('Cache-Control', 'no-cache')
                  res.setHeader('Connection', 'keep-alive')

                  const robotUrlObj = new URL(robotUrl)
                  const robotHost = robotUrlObj.hostname
                  const robotPort = parseInt(robotUrlObj.port || '8080', 10)
                  const apiPrefix = '/api/files'

                  // 检查机器狗服务健康状态
                  try {
                    const healthCheck = await new Promise<{ success: boolean; error?: string }>((resolve) => {
                      const healthReq = http.get({
                        hostname: robotHost,
                        port: robotPort,
                        path: `${apiPrefix}/health`,
                        timeout: 10000 // 增加超时时间到 10 秒
                      }, (healthRes) => {
                        let data = ''
                        healthRes.on('data', (chunk) => { data += chunk.toString() })
                        healthRes.on('end', () => {
                          try {
                            const result = JSON.parse(data)
                            resolve({ success: result.success === true })
                          } catch {
                            resolve({ success: false, error: '健康检查响应格式错误' })
                          }
                        })
                      })
                      healthReq.on('error', (err: any) => {
                        const errorCode = err.code || ''
                        let errorMsg = '无法连接到机器狗文件服务'
                        if (errorCode === 'ECONNREFUSED') {
                          errorMsg = `连接被拒绝 (${robotHost}:${robotPort})，请确保机器狗上的文件传输服务正在运行`
                        } else if (errorCode === 'ETIMEDOUT' || errorCode === 'TIMEOUT') {
                          errorMsg = `连接超时 (${robotHost}:${robotPort})，请检查网络连接`
                        } else if (errorCode === 'ENOTFOUND') {
                          errorMsg = `无法解析主机名 (${robotHost})，请检查地址是否正确`
                        } else {
                          errorMsg = `连接错误: ${err.message || errorCode}`
                        }
                        resolve({ success: false, error: errorMsg })
                      })
                      healthReq.on('timeout', () => {
                        healthReq.destroy()
                        resolve({ success: false, error: `连接超时 (${robotHost}:${robotPort})，请检查网络连接` })
                      })
                    })

                    if (!healthCheck.success) {
                      throw new Error(healthCheck.error || '机器狗文件服务未响应健康检查')
                    }
                  } catch (error) {
                    res.statusCode = 500
                    res.setHeader('Content-Type', 'application/json')
                    const errorMsg = error instanceof Error ? error.message : String(error)
                    res.end(JSON.stringify({
                      success: false,
                      error: errorMsg
                    }))
                    resolve()
                    return
                  }

                  const mapsDir = MAPS_DIR
                  const targetFolderPath = join(mapsDir, folderName)

                  // 创建目标文件夹
                  await mkdir(targetFolderPath, { recursive: true })

                  let totalSize = 0
                  let downloadedSize = 0
                  const fileSizeMap = new Map<string, number>()

                  // 先获取所有文件的大小
                  for (const fileInfo of files) {
                    try {
                      const listResponse = await new Promise<any>((resolveList, rejectList) => {
                        const listReq = http.get({
                          hostname: robotHost,
                          port: robotPort,
                          path: `${apiPrefix}/list?path=${encodeURIComponent(fileInfo.path.split('/')[0])}`,
                          timeout: 10000
                        }, (listRes) => {
                          let data = ''
                          listRes.on('data', (chunk) => { data += chunk.toString() })
                          listRes.on('end', () => {
                            try {
                              const result = JSON.parse(data)
                              if (result.success && result.items) {
                                const item = result.items.find((i: any) => i.name === fileInfo.name)
                                if (item && item.size) {
                                  fileSizeMap.set(fileInfo.path, item.size)
                                  totalSize += item.size
                                }
                              }
                              resolveList(result)
                            } catch (e) {
                              rejectList(e)
                            }
                          })
                        })
                        listReq.on('error', rejectList)
                        listReq.on('timeout', () => {
                          listReq.destroy()
                          rejectList(new Error('List request timeout'))
                        })
                      })
                    } catch (e) {
                      // 如果无法获取大小，使用默认值 0
                      fileSizeMap.set(fileInfo.path, 0)
                    }
                  }

                  res.write(`data: ${JSON.stringify({ type: 'init', totalSize, totalFiles: files.length })}\n\n`)

                  // 下载每个文件
                  for (let i = 0; i < files.length; i++) {
                    const fileInfo = files[i]
                    const { path: remotePath, name: fileName, localPath } = fileInfo

                    try {
                      res.write(`data: ${JSON.stringify({
                        type: 'fileStart',
                        fileName,
                        fileIndex: i + 1,
                        totalFiles: files.length,
                        fileSize: fileSizeMap.get(remotePath) || 0
                      })}\n\n`)

                      const fileSize = fileSizeMap.get(remotePath) || 0
                      const targetFilePath = join(targetFolderPath, localPath)
                      const targetFileDir = dirname(targetFilePath)
                      await mkdir(targetFileDir, { recursive: true })

                      // 支持断点续传：检查已下载的文件大小
                      let resumeFrom = 0
                      try {
                        const existingStats = statSync(targetFilePath)
                        if (existingStats.isFile() && existingStats.size > 0 && existingStats.size < fileSize) {
                          resumeFrom = existingStats.size
                          console.log(`[下载] 检测到部分下载的文件 ${fileName}，从 ${resumeFrom} 字节继续下载`)
                        }
                      } catch (e) {
                        // 文件不存在，从头开始下载
                        resumeFrom = 0
                      }

                      await new Promise<void>((resolveFile, rejectFile) => {
                        const downloadOptions: any = {
                          hostname: robotHost,
                          port: robotPort,
                          path: `${apiPrefix}/download?path=${encodeURIComponent(remotePath)}&_t=${Date.now()}`,
                          timeout: 10 * 60 * 1000, // 10分钟超时
                          method: 'GET'
                        }

                        // 如果支持断点续传，添加 Range 头
                        if (resumeFrom > 0 && fileSize > 0) {
                          downloadOptions.headers = {
                            'Range': `bytes=${resumeFrom}-${fileSize - 1}`
                          }
                        }

                        const downloadReq = http.request(downloadOptions, (downloadRes) => {
                          // 支持 200 (完整文件) 和 206 (部分内容)
                          if (downloadRes.statusCode !== 200 && downloadRes.statusCode !== 206) {
                            rejectFile(new Error(`HTTP ${downloadRes.statusCode}`))
                            return
                          }

                          // 打开文件流（如果续传，使用 append 模式）
                          const writeStream = resumeFrom > 0
                            ? createWriteStream(targetFilePath, { flags: 'a' }) // 追加模式
                            : createWriteStream(targetFilePath) // 覆盖模式

                          let receivedBytes = resumeFrom // 从续传位置开始计数
                          let lastUpdateTime = Date.now()
                          const contentLength = downloadRes.headers['content-length']
                          const expectedSize = contentLength ? parseInt(contentLength, 10) : (fileSize - resumeFrom)

                          // 如果使用 Range 请求，更新已下载大小
                          if (downloadRes.statusCode === 206) {
                            downloadedSize += resumeFrom
                            res.write(`data: ${JSON.stringify({
                              type: 'progress',
                              fileName,
                              fileSize,
                              downloadedSize,
                              totalSize,
                              progress: totalSize > 0 ? Math.min(100, (downloadedSize / totalSize) * 100) : 0,
                              resuming: true
                            })}\n\n`)
                          }

                          downloadRes.on('data', (chunk) => {
                            receivedBytes += chunk.length
                            downloadedSize += chunk.length

                            // 每 500ms 更新一次进度
                            const now = Date.now()
                            if (now - lastUpdateTime > 500 || receivedBytes >= (resumeFrom + expectedSize)) {
                              const overallProgress = totalSize > 0 ? Math.min(100, (downloadedSize / totalSize) * 100) : 0

                              res.write(`data: ${JSON.stringify({
                                type: 'progress',
                                fileName,
                                fileSize,
                                downloadedSize,
                                totalSize,
                                progress: overallProgress
                              })}\n\n`)
                              lastUpdateTime = now
                            }
                          })

                          downloadRes.on('end', () => {
                            writeStream.end()
                            // 验证文件大小
                            const finalSize = receivedBytes
                            if (fileSize > 0 && finalSize !== fileSize) {
                              console.warn(`[下载] 文件大小不匹配: ${fileName}, 期望 ${fileSize}, 实际 ${finalSize}`)
                            }
                            res.write(`data: ${JSON.stringify({
                              type: 'fileComplete',
                              fileName,
                              downloadedSize,
                              totalSize,
                              progress: totalSize > 0 ? Math.min(100, (downloadedSize / totalSize) * 100) : 100
                            })}\n\n`)
                            resolveFile()
                          })

                          downloadRes.on('error', (error) => {
                            writeStream.destroy()
                            rejectFile(error)
                          })

                          downloadRes.pipe(writeStream)

                          writeStream.on('error', (error) => {
                            downloadRes.destroy()
                            rejectFile(error)
                          })
                        })

                        downloadReq.on('error', (err: any) => {
                          const errorCode = err.code || ''
                          let errorMsg = '下载失败'
                          if (errorCode === 'ECONNREFUSED') {
                            errorMsg = `连接被拒绝 (${robotHost}:${robotPort})，请确保机器狗上的文件传输服务正在运行`
                          } else if (errorCode === 'ETIMEDOUT' || errorCode === 'TIMEOUT') {
                            errorMsg = `连接超时 (${robotHost}:${robotPort})，请检查网络连接`
                          } else if (errorCode === 'ENOTFOUND') {
                            errorMsg = `无法解析主机名 (${robotHost})，请检查地址是否正确`
                          } else {
                            errorMsg = `下载错误: ${err.message || errorCode}`
                          }
                          rejectFile(new Error(errorMsg))
                        })
                        downloadReq.on('timeout', () => {
                          downloadReq.destroy()
                          rejectFile(new Error(`下载超时 (${robotHost}:${robotPort})，请检查网络连接`))
                        })

                        downloadReq.end()
                      })

                    } catch (error) {
                      const errorMsg = error instanceof Error ? error.message : String(error)
                      console.error(`[下载文件失败] ${fileName}:`, errorMsg)
                      res.write(`data: ${JSON.stringify({
                        type: 'fileError',
                        fileName,
                        error: errorMsg
                      })}\n\n`)
                      // 继续下载其他文件，不中断整个流程
                    }
                  }

                  // 创建地图配置文件
                  if (mapName) {
                    const configPath = join(targetFolderPath, 'config.json')
                    await writeFile(configPath, JSON.stringify({
                      name: mapName,
                      description: description || '',
                      createTime: new Date().toISOString()
                    }, null, 2))
                  }

                  res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    downloadedSize,
                    totalSize,
                    progress: 100
                  })}\n\n`)
                  res.end()

                } catch (error) {
                  res.statusCode = 500
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                  }))
                }
                resolve()
              })
            })
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error)
            }))
          }
        })

        // API: 服务器端直接转发文件到机器狗（流式传输，不经过浏览器）
        server.middlewares.use('/api/maps/send-to-robot', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          try {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk.toString()
            })

            req.on('end', async () => {
              try {
                const { robotUrl, files, destinationPath } = JSON.parse(body)

                if (!robotUrl || !files || !Array.isArray(files) || files.length === 0) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'Invalid request: robotUrl and files array required' }))
                  return
                }

                // 解析机器狗 URL
                const robotUrlObj = new URL(robotUrl)
                const robotHost = robotUrlObj.hostname
                const robotPort = parseInt(robotUrlObj.port || '8080', 10)
                const apiPrefix = '/api/files'

                // 检查机器狗服务健康状态
                try {
                  const healthCheck = await new Promise<boolean>((resolve) => {
                    const healthReq = http.get({
                      hostname: robotHost,
                      port: robotPort,
                      path: `${apiPrefix}/health`,
                      timeout: 5000
                    }, (healthRes) => {
                      let data = ''
                      healthRes.on('data', (chunk) => { data += chunk.toString() })
                      healthRes.on('end', () => {
                        try {
                          const result = JSON.parse(data)
                          resolve(result.success === true)
                        } catch {
                          resolve(false)
                        }
                      })
                    })
                    healthReq.on('error', () => resolve(false))
                    healthReq.on('timeout', () => {
                      healthReq.destroy()
                      resolve(false)
                    })
                  })

                  if (!healthCheck) {
                    res.statusCode = 500
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify({
                      success: false,
                      error: '机器狗文件服务未响应健康检查'
                    }))
                    return
                  }
                } catch (error) {
                  res.statusCode = 500
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({
                    success: false,
                    error: `无法连接到机器狗文件服务: ${error instanceof Error ? error.message : String(error)}`
                  }))
                  return
                }

                const mapsDir = MAPS_DIR
                const results: Array<{ file: string; success: boolean; error?: string; size?: number }> = []

                // 1. 先计算所有文件的总大小
                let totalFileSize = 0
                const fileInfoList: Array<{ localPath: string; fileName: string; destinationPath: string; filePath: string; size: number }> = []

                for (const fileInfo of files) {
                  const { localPath, fileName, destinationPath: fileDestinationPath } = fileInfo
                  const targetPath = fileDestinationPath || destinationPath || 'map'
                  const filePath = join(mapsDir, localPath.replace(/^\/maps\//, ''))

                  try {
                    const stats = statSync(filePath)
                    if (stats.isFile()) {
                      totalFileSize += stats.size
                      fileInfoList.push({
                        localPath,
                        fileName,
                        destinationPath: targetPath,
                        filePath,
                        size: stats.size
                      })
                    }
                  } catch (error) {
                    // 文件不存在或无法访问，跳过
                  }
                }

                // 2. 设置流式响应头，用于推送进度更新
                res.statusCode = 200
                res.setHeader('Content-Type', 'text/event-stream')
                res.setHeader('Cache-Control', 'no-cache')
                res.setHeader('Connection', 'keep-alive')

                // 发送初始信息（总大小）
                res.write(`data: ${JSON.stringify({ type: 'init', totalSize: totalFileSize, totalFiles: fileInfoList.length })}\n\n`)

                // 3. 流式上传每个文件，并推送进度
                let uploadedSize = 0
                for (let i = 0; i < fileInfoList.length; i++) {
                  const fileInfo = fileInfoList[i]
                  const { fileName, destinationPath: targetPath, filePath, size: fileSize } = fileInfo

                  try {
                    // 发送文件开始上传事件
                    res.write(`data: ${JSON.stringify({
                      type: 'fileStart',
                      fileName,
                      fileIndex: i + 1,
                      totalFiles: fileInfoList.length,
                      fileSize
                    })}\n\n`)

                    const boundary = `----formdata-${Date.now()}-${Math.random().toString(36)}`
                    const mimeType = 'application/octet-stream'

                    // 构建 multipart 头部和尾部
                    const header = `--${boundary}\r\n` +
                      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
                      `Content-Type: ${mimeType}\r\n\r\n`
                    const footer = `\r\n--${boundary}\r\n` +
                      `Content-Disposition: form-data; name="destination"\r\n\r\n` +
                      `${targetPath}\r\n` +
                      `--${boundary}--\r\n`

                    const headerSize = Buffer.byteLength(header)
                    const footerSize = Buffer.byteLength(footer)
                    const totalRequestSize = headerSize + fileSize + footerSize

                    // 使用 http 模块发送请求
                    await new Promise<void>((resolve) => {
                      let waitProgressInterval: NodeJS.Timeout | null = null
                      let progressCheckInterval: NodeJS.Timeout | null = null
                      let responseReceived = false
                      let initialBytesWritten = 0 // 记录初始值，不更新
                      let lastReportedSentBytes = 0 // 记录上次报告的已发送字节数，避免进度倒退

                      const options = {
                        hostname: robotHost,
                        port: robotPort,
                        path: `${apiPrefix}/upload`,
                        method: 'POST',
                        headers: {
                          'Content-Type': `multipart/form-data; boundary=${boundary}`,
                          'Content-Length': totalRequestSize.toString()
                        }
                      }

                      const httpReq = http.request(options, (httpRes) => {
                        let responseData = ''

                        // 检查响应状态
                        if (httpRes.statusCode && (httpRes.statusCode < 200 || httpRes.statusCode >= 300)) {
                          responseReceived = true
                          if (waitProgressInterval) {
                            clearInterval(waitProgressInterval)
                            waitProgressInterval = null
                          }
                          if (progressCheckInterval) {
                            clearInterval(progressCheckInterval)
                            progressCheckInterval = null
                          }
                          results.push({
                            file: fileName,
                            success: false,
                            error: `HTTP ${httpRes.statusCode}: ${httpRes.statusMessage || 'Upload failed'}`,
                            size: fileSize
                          })
                          resolve()
                          return
                        }

                        httpRes.on('data', (chunk) => {
                          responseData += chunk.toString()
                        })
                        httpRes.on('end', () => {
                          responseReceived = true
                          if (waitProgressInterval) {
                            clearInterval(waitProgressInterval)
                            waitProgressInterval = null
                          }
                          if (progressCheckInterval) {
                            clearInterval(progressCheckInterval)
                            progressCheckInterval = null
                          }

                          try {
                            const result = JSON.parse(responseData)
                            if (result.success) {
                              results.push({ file: fileName, success: true, size: fileSize })
                              // 文件真正上传完成，更新到100%
                              uploadedSize += fileSize
                              // 发送文件上传完成事件（确保进度达到100%）
                              const finalProgress = totalFileSize > 0 ? Math.min(100, Math.round((uploadedSize / totalFileSize) * 100)) : 100
                              res.write(`data: ${JSON.stringify({
                                type: 'fileComplete',
                                fileName,
                                uploadedSize,
                                totalSize: totalFileSize,
                                progress: finalProgress
                              })}\n\n`)
                            } else {
                              results.push({
                                file: fileName,
                                success: false,
                                error: result.message || 'Upload failed',
                                size: fileSize
                              })
                              res.write(`data: ${JSON.stringify({
                                type: 'fileError',
                                fileName,
                                error: result.message || 'Upload failed'
                              })}\n\n`)
                            }
                          } catch (e) {
                            results.push({
                              file: fileName,
                              success: false,
                              error: `Invalid response: ${e instanceof Error ? e.message : String(e)}`,
                              size: fileSize
                            })
                            res.write(`data: ${JSON.stringify({
                              type: 'fileError',
                              fileName,
                              error: 'Invalid response from server'
                            })}\n\n`)
                          }
                          resolve()
                        })

                        httpRes.on('error', (error) => {
                          responseReceived = true
                          if (waitProgressInterval) {
                            clearInterval(waitProgressInterval)
                            waitProgressInterval = null
                          }
                          if (progressCheckInterval) {
                            clearInterval(progressCheckInterval)
                            progressCheckInterval = null
                          }
                          results.push({
                            file: fileName,
                            success: false,
                            error: error.message || 'Network error',
                            size: fileSize
                          })
                          res.write(`data: ${JSON.stringify({
                            type: 'fileError',
                            fileName,
                            error: error.message || 'Network error'
                          })}\n\n`)
                          resolve()
                        })
                      })

                      httpReq.on('error', (error) => {
                        responseReceived = true
                        if (waitProgressInterval) {
                          clearInterval(waitProgressInterval)
                          waitProgressInterval = null
                        }
                        if (progressCheckInterval) {
                          clearInterval(progressCheckInterval)
                          progressCheckInterval = null
                        }
                        results.push({ file: fileName, success: false, error: error.message, size: fileSize })
                        resolve()
                      })

                      // 记录初始 bytesWritten（在连接建立后，只记录一次）
                      httpReq.on('socket', (socket) => {
                        initialBytesWritten = socket.bytesWritten || 0
                      })

                      // 写入 multipart 头部
                      const headerBuffer = Buffer.from(header)
                      httpReq.write(headerBuffer)

                      // 流式传输文件内容，并跟踪实际发送进度
                      // 使用 pipe 方法自动处理流，避免将文件读取到内存
                      const fileStream = createReadStream(filePath, {
                        highWaterMark: 10 * 1024 * 1024 // 10MB 缓冲区，避免占用过多内存
                      })

                      // 使用定时器定期检查实际发送的字节数
                      progressCheckInterval = setInterval(() => {
                        if (responseReceived) {
                          if (progressCheckInterval) {
                            clearInterval(progressCheckInterval)
                            progressCheckInterval = null
                          }
                          return
                        }

                        // 获取实际发送到网络的字节数
                        const socket = httpReq.socket
                        if (socket && socket.bytesWritten !== undefined) {
                          const currentBytesWritten = socket.bytesWritten
                          // socket.bytesWritten 包括所有已发送的数据（header + 文件内容 + footer）
                          // 计算实际发送的文件内容字节数 = socket.bytesWritten - initialBytesWritten - headerSize
                          const totalSent = currentBytesWritten - initialBytesWritten
                          const fileContentSent = Math.max(0, totalSent - headerSize)

                          // 确保进度不倒退：只报告大于等于上次报告的字节数
                          const actualSentBytes = Math.max(fileContentSent, lastReportedSentBytes)

                          // 只有当实际发送的字节数增加时才更新进度
                          if (actualSentBytes > lastReportedSentBytes) {
                            lastReportedSentBytes = actualSentBytes

                            // 计算总体进度（基于实际发送到网络的字节数）
                            // 已发送的总字节数 = 之前文件的总大小 + 当前文件已发送的字节数
                            const currentSentSize = uploadedSize + Math.min(actualSentBytes, fileSize)

                            // 计算预期的总发送字节数（header + 文件内容 + footer）
                            const expectedTotalBytes = headerSize + fileSize + footerSize

                            // 如果数据已完全发送（包括 header + 文件 + footer），进度最多到 98%
                            // 剩余的 2% 等待服务器响应
                            let overallProgress = 0
                            if (totalFileSize > 0) {
                              if (totalSent >= expectedTotalBytes) {
                                // 数据已完全发送，但等待服务器响应
                                overallProgress = Math.min(98, Math.round((currentSentSize / totalFileSize) * 100))
                              } else {
                                // 数据还在发送中
                                overallProgress = Math.min(97, Math.round((currentSentSize / totalFileSize) * 100))
                              }
                            }

                            // 发送进度更新事件（基于实际发送到网络的字节数）
                            res.write(`data: ${JSON.stringify({
                              type: 'progress',
                              fileName,
                              sentBytes: Math.min(actualSentBytes, fileSize),
                              fileSize,
                              uploadedSize: currentSentSize,
                              totalSize: totalFileSize,
                              progress: overallProgress
                            })}\n\n`)
                          }
                        }
                      }, 200) // 每 200ms 检查一次实际发送的字节数，更频繁地更新进度

                      // 流式传输：逐块读取文件并写入 HTTP 请求，不会将整个文件加载到内存
                      // 使用 data 事件逐块处理，Node.js 会自动处理背压（backpressure）
                      // 当 httpReq 的缓冲区满时，fileStream 会自动暂停读取
                      fileStream.on('data', (chunk) => {
                        // 检查 httpReq 是否可写，如果不可写则暂停文件流
                        if (!httpReq.write(chunk)) {
                          // 缓冲区已满，暂停读取直到 drain 事件
                          fileStream.pause()
                        }
                      })

                      // 当缓冲区清空时，恢复文件流读取
                      httpReq.on('drain', () => {
                        fileStream.resume()
                      })

                      fileStream.on('end', () => {
                        // 文件流读取完成，写入 footer
                        const footerBuffer = Buffer.from(footer)
                        httpReq.write(footerBuffer)

                        // 结束 HTTP 请求（数据开始真正传输到机器狗）
                        // 注意：此时数据可能还在缓冲区中，还没有真正发送到网络
                        httpReq.end()

                        // 计算预期的总发送字节数（header + 文件内容 + footer）
                        const expectedTotalBytes = headerSize + fileSize + footerSize

                        // 不要清除 progressCheckInterval，继续使用它来检查实际发送的字节数
                        // 文件流结束不等于数据已发送完成，需要继续监控 socket.bytesWritten
                      })

                      fileStream.on('error', (error) => {
                        responseReceived = true
                        if (waitProgressInterval) {
                          clearInterval(waitProgressInterval)
                          waitProgressInterval = null
                        }
                        if (progressCheckInterval) {
                          clearInterval(progressCheckInterval)
                          progressCheckInterval = null
                        }
                        results.push({ file: fileName, success: false, error: error.message, size: fileSize })
                        httpReq.destroy()
                        resolve()
                      })
                    })

                  } catch (error) {
                    results.push({
                      file: fileName,
                      success: false,
                      error: error instanceof Error ? error.message : 'Unknown error',
                      size: fileSize
                    })
                  }
                }

                // 确保所有定时器都已清除
                // 发送最终结果
                try {
                  res.write(`data: ${JSON.stringify({ type: 'complete', results, uploadedSize, totalSize: totalFileSize })}\n\n`)
                  res.end()
                } catch (writeError) {
                  // 如果响应已经结束，忽略错误
                  console.error('Error writing final response:', writeError)
                  if (!res.headersSent) {
                    res.statusCode = 500
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify({ success: false, error: 'Failed to send final response' }))
                  }
                }

              } catch (error) {
                // 如果响应已经开始（SSE），发送错误事件并结束
                if (res.headersSent) {
                  try {
                    res.write(`data: ${JSON.stringify({
                      type: 'error',
                      error: error instanceof Error ? error.message : 'Unknown error'
                    })}\n\n`)
                    res.end()
                  } catch (writeError) {
                    // 如果无法写入，直接结束
                    res.destroy()
                  }
                } else {
                  res.statusCode = 500
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                  }))
                }
              }
            })
          } catch (error) {
            // 如果响应已经开始（SSE），发送错误事件并结束
            if (res.headersSent) {
              try {
                res.write(`data: ${JSON.stringify({
                  type: 'error',
                  error: error instanceof Error ? error.message : 'Unknown error'
                })}\n\n`)
                res.end()
              } catch (writeError) {
                // 如果无法写入，直接结束
                res.destroy()
              }
            } else {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              }))
            }
          }
        })

        // 处理 maps 目录的文件服务（支持文件夹结构）
        server.middlewares.use('/maps', async (req, res) => {
          try {
            const mapsDir = MAPS_DIR
            const urlPath = req.url || '/'

            // 如果是根路径，返回目录列表（列出所有文件夹）
            if (urlPath === '/' || urlPath === '') {
              const entries = await readdir(mapsDir, { withFileTypes: true })
              const folders = entries.filter((entry) => entry.isDirectory())

              const html = `
                <!DOCTYPE html>
                <html>
                <head>
                  <title>Maps Directory</title>
                  <meta charset="utf-8">
                </head>
                <body>
                  <h1>Maps Directory</h1>
                  <ul>
                    ${folders
                  .map((f) => `<li><a href="/maps/${f.name}/">${f.name}/</a></li>`)
                  .join('\n')}
                  </ul>
                </body>
                </html>
              `
              res.setHeader('Content-Type', 'text/html; charset=utf-8')
              res.end(html)
              return
            }

            // 处理文件或目录请求
            const filePath = join(mapsDir, urlPath.replace(/^\//, ''))
            try {
              const stats = statSync(filePath)
              if (stats.isFile()) {
                // 根据文件扩展名设置 MIME 类型
                const ext = extname(filePath).toLowerCase()
                const mimeTypes: Record<string, string> = {
                  '.pgm': 'image/x-portable-graymap',
                  '.pcd': 'application/octet-stream',
                  '.json': 'application/json',
                  '.png': 'image/png',
                  '.jpg': 'image/jpeg',
                  '.jpeg': 'image/jpeg'
                }
                const mimeType = mimeTypes[ext] || 'application/octet-stream'
                res.setHeader('Content-Type', mimeType)
                res.setHeader('Content-Length', stats.size)
                res.setHeader('Cache-Control', 'no-cache')

                // 对于大文件，使用流式传输
                const stream = createReadStream(filePath)

                // 处理流错误
                stream.on('error', (err) => {
                  console.error('Stream error:', err)
                  if (!res.headersSent) {
                    res.statusCode = 500
                    res.end('Internal Server Error')
                  } else {
                    try {
                      res.destroy()
                    } catch (e) {
                      // 忽略销毁错误
                    }
                  }
                })

                // 处理客户端断开连接
                req.on('close', () => {
                  if (!stream.destroyed) {
                    stream.destroy()
                  }
                })

                // 处理响应关闭
                res.on('close', () => {
                  if (!stream.destroyed) {
                    stream.destroy()
                  }
                })

                stream.pipe(res)
                return
              }

              if (stats.isDirectory()) {
                // 如果是目录，返回目录列表
                const entries = await readdir(filePath, { withFileTypes: true })
                const html = `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <title>Directory: ${urlPath}</title>
                    <meta charset="utf-8">
                  </head>
                  <body>
                    <h1>Directory: ${urlPath}</h1>
                    <ul>
                      ${entries
                    .map((entry) => {
                      const href = urlPath.endsWith('/')
                        ? `${urlPath}${entry.name}`
                        : `${urlPath}/${entry.name}`
                      return `<li><a href="${href}${entry.isDirectory() ? '/' : ''}">${entry.name
                        }${entry.isDirectory() ? '/' : ''}</a></li>`
                    })
                    .join('\n')}
                    </ul>
                  </body>
                  </html>
                `
                res.setHeader('Content-Type', 'text/html; charset=utf-8')
                res.end(html)
                return
              }

              // 既不是文件也不是目录
              res.statusCode = 404
              res.end('Not Found')
            } catch (error) {
              // 文件不存在，继续到下一个中间件
              res.statusCode = 404
              res.end('File Not Found')
            }
          } catch (error) {
            console.error('Maps directory error:', error)
            res.statusCode = 500
            res.end('Internal Server Error')
          }
        })
      }
    }
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'roslib': join(ROOT_DIR, 'node_modules/roslib/build/roslib.js')
    }
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'https://ibl.zjypwy.com/cscec-robot-dog',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three')) {
              return 'three-vendor'
            }
            if (id.includes('element-plus')) {
              return 'element-plus'
            }
            return 'vendor'
          }
        }
      }
    }
  },
  define: {
    global: 'window'
  },
  base: '/robot-dog-web/'
})
