import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readdir, writeFile, mkdir, rm, readFile, rename } from 'fs/promises'
import { join, extname, dirname } from 'path'
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

                // 提取每个 part 的数据（两个边界之间的内容）
                for (let i = 0; i < boundaries.length - 1; i++) {
                  const start = boundaries[i] + boundaryBuffer.length
                  const end = boundaries[i + 1]
                  
                  // 跳过开头的 \r\n
                  let partStart = start
                  if (buffer[partStart] === 0x0d && buffer[partStart + 1] === 0x0a) {
                    partStart += 2
                  }
                  
                  // 提取 part 数据（不包括末尾的 \r\n）
                  let partEnd = end
                  if (partEnd >= 2 && buffer[partEnd - 2] === 0x0d && buffer[partEnd - 1] === 0x0a) {
                    partEnd -= 2
                  }
                  
                  if (partEnd > partStart) {
                    parts.push(buffer.subarray(partStart, partEnd))
                  }
                }

                let fileName = ''
                let fileData: Buffer | null = null
                let folderName = ''

                for (const part of parts) {
                  // 查找 header 和 body 的分界（\r\n\r\n）
                  const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'))
                  if (headerEnd <= 0) continue
                  
                  const header = part.subarray(0, headerEnd).toString('utf8')
                  const body = part.subarray(headerEnd + 4)
                  
                  // 移除 body 末尾的 \r\n（如果有）
                  let bodyData = body
                  if (bodyData.length >= 2 && bodyData[bodyData.length - 2] === 0x0d && bodyData[bodyData.length - 1] === 0x0a) {
                    bodyData = bodyData.subarray(0, bodyData.length - 2)
                  }
                  
                  // 解析文件夹名称
                  if (header.includes('Content-Disposition') && header.includes('name="folderName"')) {
                    folderName = bodyData.toString('utf8').trim()
                  }
                  
                  // 解析文件名和文件数据
                  if (header.includes('Content-Disposition') && header.includes('filename=')) {
                    const filenameMatch =
                      header.match(/filename="([^"]+)"/) || header.match(/filename=([^\r\n]+)/)
                    if (filenameMatch) {
                      fileName = filenameMatch[1].trim()
                      fileData = bodyData
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

                // 确定保存路径
                let filePath: string
                if (folderName && folderName.trim()) {
                  // 保存到指定地图文件夹的 map 目录
                  const targetFolder = folderName.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
                  const targetDir = join(mapsDir, targetFolder, 'map')
                  await mkdir(targetDir, { recursive: true })
                  filePath = join(targetDir, safeFileName)
                } else {
                  // 保存到 maps 根目录（兼容旧行为）
                  filePath = join(mapsDir, safeFileName)
                }

                // 保存文件
                await writeFile(filePath, fileData)

                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: true, fileName: safeFileName }))
              } catch (error) {
                console.error('File upload error:', error)
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(
                  JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to save file'
                  })
                )
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

        // API: 列出 maps 目录下的所有文件夹
        server.middlewares.use('/api/maps/list', async (req, res) => {
          try {
            const mapsDir = join(process.cwd(), 'maps')
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

            const mapsDir = join(process.cwd(), 'maps')
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

        // API: 上传地图文件夹
        server.middlewares.use('/api/maps/upload-folder', async (req, res) => {
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

                // 解析 multipart/form-data
                // 边界格式：--boundary 或 \r\n--boundary
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
                  
                  // 跳过开头的 \r\n
                  let partStart = start
                  if (buffer[partStart] === 0x0D && buffer[partStart + 1] === 0x0A) {
                    partStart += 2
                  }
                  
                  // 提取 part（不包括末尾的 \r\n）
                  let partEnd = end
                  if (partEnd >= 2 && buffer[partEnd - 2] === 0x0D && buffer[partEnd - 1] === 0x0A) {
                    partEnd -= 2
                  }
                  
                  if (partEnd > partStart) {
                    parts.push(buffer.subarray(partStart, partEnd))
                  }
                }

                let folderName = ''
                let mapName = ''
                let description = ''
                const files: Array<{ path: string; data: Buffer }> = []

                for (const part of parts) {
                  // 查找 header 和 data 的分隔符 \r\n\r\n
                  const headerEndMarker = Buffer.from('\r\n\r\n')
                  const headerEnd = part.indexOf(headerEndMarker)
                  
                  if (headerEnd > 0) {
                    const header = part.toString('utf8', 0, headerEnd)
                    const dataStart = headerEnd + 4
                    // 数据部分，去掉末尾的 \r\n（如果有）
                    let dataEnd = part.length
                    if (dataEnd >= 2 && part[dataEnd - 2] === 0x0D && part[dataEnd - 1] === 0x0A) {
                      dataEnd -= 2
                    }
                    const data = part.subarray(dataStart, dataEnd)

                    // 解析表单字段
                    if (header.includes('name="folderName"')) {
                      folderName = data.toString('utf8').trim()
                    } else if (header.includes('name="mapName"')) {
                      mapName = data.toString('utf8').trim()
                    } else if (header.includes('name="description"')) {
                      description = data.toString('utf8').trim()
                    } else if (header.includes('name="files"') && header.includes('filename=')) {
                      const filenameMatch = header.match(/filename="([^"]+)"/) || header.match(/filename=([^\r\n]+)/)
                      if (filenameMatch) {
                        const filePath = filenameMatch[1].trim()
                        files.push({ path: filePath, data })
                      }
                    }
                  }
                }

                if (!folderName || !mapName || files.length === 0) {
                  console.error('缺少必需字段')
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Missing required fields',
                    details: { folderName: !!folderName, mapName: !!mapName, filesCount: files.length }
                  }))
                  return
                }

                // 创建地图文件夹
                const mapFolderPath = join(mapsDir, folderName)
                await mkdir(mapFolderPath, { recursive: true })

                // 保存所有文件
                for (const file of files) {
                  const filePath = join(mapFolderPath, file.path)
                  const fileDir = dirname(filePath)
                  await mkdir(fileDir, { recursive: true })
                  await writeFile(filePath, file.data)
                }

                // 创建配置文件（使用输入的地图名称和描述）
                const configPath = join(mapFolderPath, 'config.json')
                const configData = {
                  name: mapName,
                  description: description || ''
                }
                await writeFile(configPath, JSON.stringify(configData, null, 2))

                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: true, folderName, mapName }))
              } catch (error) {
                console.error('Folder upload error:', error)
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(
                  JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to save folder'
                  })
                )
              }
            })

            req.on('error', (error) => {
              console.error('Request error:', error)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'Request error' }))
            })
          } catch (error) {
            console.error('Upload folder API error:', error)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Internal server error' }))
          }
        })

        // API: 保存新地图（从编辑后的地图创建新地图文件夹）
        server.middlewares.use('/api/maps/save-new-map', async (req, res) => {
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

                // 解析multipart/form-data（复用上传文件夹的逻辑）
                const boundaryMarker = `--${boundary}`
                const boundaryBuffer = Buffer.from(boundaryMarker)
                const parts: Buffer[] = []
                
                let searchIndex = 0
                const boundaries: number[] = []
                while (true) {
                  const index = buffer.indexOf(boundaryBuffer, searchIndex)
                  if (index === -1) break
                  boundaries.push(index)
                  searchIndex = index + boundaryBuffer.length
                }

                for (let i = 0; i < boundaries.length - 1; i++) {
                  const start = boundaries[i] + boundaryBuffer.length
                  const end = boundaries[i + 1]
                  
                  let partStart = start
                  if (buffer[partStart] === 0x0D && buffer[partStart + 1] === 0x0A) {
                    partStart += 2
                  }
                  
                  let partEnd = end
                  if (partEnd >= 2 && buffer[partEnd - 2] === 0x0D && buffer[partEnd - 1] === 0x0A) {
                    partEnd -= 2
                  }
                  
                  if (partEnd > partStart) {
                    parts.push(buffer.subarray(partStart, partEnd))
                  }
                }

                let folderName = ''
                let mapName = ''
                let description = ''
                const files: Array<{ path: string; data: Buffer }> = []

                for (const part of parts) {
                  const headerEndMarker = Buffer.from('\r\n\r\n')
                  const headerEnd = part.indexOf(headerEndMarker)
                  
                  if (headerEnd > 0) {
                    const header = part.toString('utf8', 0, headerEnd)
                    const dataStart = headerEnd + 4
                    let dataEnd = part.length
                    if (dataEnd >= 2 && part[dataEnd - 2] === 0x0D && part[dataEnd - 1] === 0x0A) {
                      dataEnd -= 2
                    }
                    const data = part.subarray(dataStart, dataEnd)

                    if (header.includes('name="folderName"')) {
                      folderName = data.toString('utf8').trim()
                    } else if (header.includes('name="mapName"')) {
                      mapName = data.toString('utf8').trim()
                    } else if (header.includes('name="description"')) {
                      description = data.toString('utf8').trim()
                    } else if (header.includes('name="files"') && header.includes('filename=')) {
                      const filenameMatch = header.match(/filename="([^"]+)"/) || header.match(/filename=([^\r\n]+)/)
                      if (filenameMatch) {
                        const filePath = filenameMatch[1].trim()
                        files.push({ path: filePath, data })
                      }
                    }
                  }
                }

                if (!folderName || !mapName || files.length === 0) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'Missing required fields' }))
                  return
                }

                // 创建新地图文件夹
                const mapFolderPath = join(mapsDir, folderName)
                await mkdir(mapFolderPath, { recursive: true })

                // 保存所有文件
                for (const file of files) {
                  const filePath = join(mapFolderPath, file.path)
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

                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: true, folderName, mapName }))
              } catch (error) {
                console.error('Save new map error:', error)
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(
                  JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to save new map'
                  })
                )
              }
            })

            req.on('error', (error) => {
              console.error('Request error:', error)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'Request error' }))
            })
          } catch (error) {
            console.error('Save new map API error:', error)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Internal server error' }))
          }
        })

        // API: 上传视频
        server.middlewares.use('/api/videos/upload', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          try {
            const videosDir = join(process.cwd(), 'videos')
            await mkdir(videosDir, { recursive: true })

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

                // 解析 multipart/form-data
                const boundaryMarker = `--${boundary}`
                const boundaryBuffer = Buffer.from(boundaryMarker)
                const parts: Buffer[] = []
                
                let searchIndex = 0
                const boundaries: number[] = []
                while (true) {
                  const index = buffer.indexOf(boundaryBuffer, searchIndex)
                  if (index === -1) break
                  boundaries.push(index)
                  searchIndex = index + boundaryBuffer.length
                }

                for (let i = 0; i < boundaries.length - 1; i++) {
                  const start = boundaries[i] + boundaryBuffer.length
                  const end = boundaries[i + 1]
                  
                  let partStart = start
                  if (buffer[partStart] === 0x0D && buffer[partStart + 1] === 0x0A) {
                    partStart += 2
                  }
                  
                  let partEnd = end
                  if (partEnd >= 2 && buffer[partEnd - 2] === 0x0D && buffer[partEnd - 1] === 0x0A) {
                    partEnd -= 2
                  }
                  
                  if (partEnd > partStart) {
                    parts.push(buffer.subarray(partStart, partEnd))
                  }
                }

                let fileName = ''
                let fileData: Buffer | null = null

                for (const part of parts) {
                  const headerEndMarker = Buffer.from('\r\n\r\n')
                  const headerEnd = part.indexOf(headerEndMarker)
                  
                  if (headerEnd > 0) {
                    const header = part.toString('utf8', 0, headerEnd)
                    const dataStart = headerEnd + 4
                    let dataEnd = part.length
                    if (dataEnd >= 2 && part[dataEnd - 2] === 0x0D && part[dataEnd - 1] === 0x0A) {
                      dataEnd -= 2
                    }
                    const data = part.subarray(dataStart, dataEnd)

                    if (header.includes('name="video"') && header.includes('filename=')) {
                      const filenameMatch = header.match(/filename="([^"]+)"/) || header.match(/filename=([^\r\n]+)/)
                      if (filenameMatch) {
                        fileName = filenameMatch[1].trim()
                        fileData = data
                      }
                    }
                  }
                }

                if (!fileName || !fileData) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'No video file provided' }))
                  return
                }

                // 确保文件名安全
                const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
                if (!safeFileName.endsWith('.webm')) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'Only .webm files are allowed' }))
                  return
                }

                // 创建以日期命名的文件夹（YYYYMMDD格式）
                const now = new Date()
                const dateFolder = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
                const dateDir = join(videosDir, dateFolder)
                await mkdir(dateDir, { recursive: true })

                const filePath = join(dateDir, safeFileName)
                await writeFile(filePath, fileData)

                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: true, fileName: safeFileName, folder: dateFolder }))
              } catch (error) {
                console.error('Video upload error:', error)
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(
                  JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to save video'
                  })
                )
              }
            })

            req.on('error', (error) => {
              console.error('Request error:', error)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'Request error' }))
            })
          } catch (error) {
            console.error('Upload video API error:', error)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Internal server error' }))
          }
        })

        // API: 列出所有视频（按日期文件夹组织）
        server.middlewares.use('/api/videos/list', async (req, res) => {
          try {
            const videosDir = join(process.cwd(), 'videos')
            await mkdir(videosDir, { recursive: true })

            const entries = await readdir(videosDir, { withFileTypes: true })
            const folders: Array<{ folder: string; date: string; count: number; videos: Array<{ name: string; size: string; modified: string; folder: string }> }> = []

            for (const entry of entries) {
              if (entry.isDirectory() && /^\d{8}$/.test(entry.name)) {
                // 是日期文件夹（YYYYMMDD格式）
                const folderPath = join(videosDir, entry.name)
                const videoEntries = await readdir(folderPath, { withFileTypes: true })
                const videos: Array<{ name: string; size: string; modified: string; folder: string }> = []

                for (const videoEntry of videoEntries) {
                  if (videoEntry.isFile() && videoEntry.name.endsWith('.webm')) {
                    const filePath = join(folderPath, videoEntry.name)
                    const stats = statSync(filePath)
                    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2)
                    const modified = stats.mtime.toLocaleString('zh-CN')

                    videos.push({
                      name: videoEntry.name,
                      size: `${sizeInMB} MB`,
                      modified,
                      folder: entry.name
                    })
                  }
                }

                // 按修改时间倒序排列
                videos.sort((a, b) => {
                  const aTime = statSync(join(folderPath, a.name)).mtime.getTime()
                  const bTime = statSync(join(folderPath, b.name)).mtime.getTime()
                  return bTime - aTime
                })

                // 格式化日期显示（YYYYMMDD -> YYYY-MM-DD）
                const dateStr = entry.name
                const formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`

                folders.push({
                  folder: entry.name,
                  date: formattedDate,
                  count: videos.length,
                  videos
                })
              }
            }

            // 按日期倒序排列（最新的在前）
            folders.sort((a, b) => b.folder.localeCompare(a.folder))

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, folders }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: String(error) }))
          }
        })

        // API: 下载视频
        server.middlewares.use('/api/videos/download', async (req, res) => {
          try {
            const videosDir = join(process.cwd(), 'videos')
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
            const videosDir = join(process.cwd(), 'videos')
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

        // API: 重命名视频
        server.middlewares.use('/api/videos/rename', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }))
            return
          }

          try {
            const videosDir = join(process.cwd(), 'videos')
            const chunks: Buffer[] = []

            req.on('data', (chunk: Buffer) => {
              chunks.push(chunk)
            })

            req.on('end', async () => {
              try {
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
                const oldName = body.oldName || ''
                const newName = body.newName || ''

                if (!oldName || !newName || oldName.includes('..') || newName.includes('..') || oldName.includes('/') || newName.includes('/')) {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ success: false, error: 'Invalid file name' }))
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

                const oldPath = join(videosDir, oldName)
                const newPath = join(videosDir, safeNewName)

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

        // 处理 maps 目录的文件服务（支持文件夹结构）
        server.middlewares.use('/maps', async (req, res) => {
          try {
            const mapsDir = join(process.cwd(), 'maps')
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
                          return `<li><a href="${href}${entry.isDirectory() ? '/' : ''}">${
                            entry.name
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
