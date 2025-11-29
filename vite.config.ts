import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readdir, writeFile } from 'fs/promises'
import { join, extname } from 'path'
import { createReadStream, statSync } from 'fs'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 自定义插件：提供 /maps/ 目录列表和文件服务
    {
      name: 'maps-directory-listing',
      configureServer(server) {
        // 处理文件上传API
        server.middlewares.use('/api/maps/upload', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          try {
            const mapsDir = join(process.cwd(), 'maps')
            const chunks: Buffer[] = []
            
            req.on('data', (chunk: Buffer) => {
              chunks.push(chunk)
            })

            req.on('end', async () => {
              try {
                const buffer = Buffer.concat(chunks)
                const contentType = req.headers['content-type'] || ''
                
                if (!contentType.includes('multipart/form-data')) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'Invalid content type' }))
                  return
                }

                const boundary = contentType.split('boundary=')[1]?.trim()
                if (!boundary) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'No boundary found' }))
                  return
                }

                // 解析multipart/form-data
                const boundaryBuffer = Buffer.from(`--${boundary}`)
                const parts: Buffer[] = []
                let lastIndex = 0

                while (true) {
                  const index = buffer.indexOf(boundaryBuffer, lastIndex)
                  if (index === -1) break
                  if (lastIndex > 0) {
                    parts.push(buffer.subarray(lastIndex + boundaryBuffer.length, index))
                  }
                  lastIndex = index + boundaryBuffer.length
                }

                let fileName = ''
                let fileData: Buffer | null = null

                for (const part of parts) {
                  const partStr = part.toString('utf8', 0, Math.min(part.length, 1000))
                  if (partStr.includes('Content-Disposition') && partStr.includes('filename=')) {
                    const filenameMatch = partStr.match(/filename="([^"]+)"/) || partStr.match(/filename=([^\r\n]+)/)
                    if (filenameMatch) {
                      fileName = filenameMatch[1].trim()
                      // 查找文件数据的开始位置（跳过头部）
                      const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
                      if (headerEnd > 0) {
                        // 移除末尾的\r\n
                        const dataEnd = part.length - 2
                        fileData = part.subarray(headerEnd + 4, dataEnd > headerEnd + 4 ? dataEnd : part.length)
                      }
                      break
                    }
                  }
                }

                if (!fileName || !fileData) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'No file provided' }))
                  return
                }

                // 确保文件名安全
                const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
                if (!safeFileName.endsWith('.pgm')) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'Only .pgm files are allowed' }))
                  return
                }

                const filePath = join(mapsDir, safeFileName)

                // 保存文件
                await writeFile(filePath, fileData)

                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: true, fileName: safeFileName }))
              } catch (error) {
                console.error('File upload error:', error)
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to save file' }))
              }
            })

            req.on('error', (error) => {
              console.error('Request error:', error)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'Request error' }))
            })
          } catch (error) {
            console.error('Upload API error:', error)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Internal server error' }))
          }
        })

        server.middlewares.use('/maps', async (req, res, next) => {
          try {
            const mapsDir = join(process.cwd(), 'maps')
            const urlPath = req.url || '/'
            
            // 如果是根路径，返回目录列表
            if (urlPath === '/' || urlPath === '') {
              const files = await readdir(mapsDir)
              const pgmFiles = files.filter(f => f.endsWith('.pgm'))
              
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
                    ${pgmFiles.map(f => `<li><a href="/maps/${f}">${f}</a></li>`).join('\n')}
                  </ul>
                </body>
                </html>
              `
              res.setHeader('Content-Type', 'text/html; charset=utf-8')
              res.end(html)
            } else {
              // 处理文件请求
              const filePath = join(mapsDir, urlPath.replace(/^\//, ''))
              try {
                const stats = statSync(filePath)
                if (stats.isFile()) {
                  // 根据文件扩展名设置 MIME 类型
                  const ext = extname(filePath).toLowerCase()
                  const mimeTypes: Record<string, string> = {
                    '.pgm': 'image/x-portable-graymap',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg'
                  }
                  const mimeType = mimeTypes[ext] || 'application/octet-stream'
                  res.setHeader('Content-Type', mimeType)
                  res.setHeader('Content-Length', stats.size)
                  createReadStream(filePath).pipe(res)
                } else {
                  res.statusCode = 404
                  res.end('Not Found')
                }
              } catch (error) {
                res.statusCode = 404
                res.end('File Not Found')
              }
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
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 3000,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
