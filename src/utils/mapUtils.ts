/**
 * 地图工具函数
 * 用于读取和管理地图文件夹结构
 */

import type { MapInfo, MapConfig } from '@/types/map'
import { getAuthHeaders } from './auth'

/**
 * 获取所有地图信息
 * 读取 maps 文件夹下的所有地图文件夹
 */
export async function fetchAllMaps(): Promise<MapInfo[]> {
  try {
    // 首先获取 maps 目录下的所有文件夹
    const response = await fetch('/api/maps/list', {
      headers: getAuthHeaders()
    })

    if (!response.ok) {
      // 如果 API 不存在，尝试直接访问 maps 目录
      return await fetchMapsFromDirectory()
    }

    const data = await response.json()
    if (data.success && data.folders) {
      // 并行获取每个地图文件夹的详细信息
      const mapInfos = await Promise.all(
        data.folders.map((folder: string) => fetchMapInfo(folder))
      )
      return mapInfos.filter(info => info !== null) as MapInfo[]
    }

    return []
  } catch (error) {
    console.error('获取地图列表失败:', error)
    return []
  }
}

/**
 * 从目录直接读取地图（降级方案）
 */
async function fetchMapsFromDirectory(): Promise<MapInfo[]> {
  try {
    const response = await fetch('/maps/', {
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      return []
    }

    const text = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/html')
    const links = doc.querySelectorAll('a')
    const folders: string[] = []

    links.forEach(link => {
      const href = link.getAttribute('href')
      if (href && !href.endsWith('.pgm') && !href.endsWith('.pcd') && !href.endsWith('.json')) {
        // 提取文件夹名称（去掉末尾的 /）
        const folderName = href.replace(/\/$/, '').replace(/^.*\//, '')
        if (folderName && !folders.includes(folderName)) {
          folders.push(folderName)
        }
      }
    })

    // 并行获取每个地图文件夹的详细信息
    const mapInfos = await Promise.all(
      folders.map(folder => fetchMapInfo(folder))
    )
    return mapInfos.filter(info => info !== null) as MapInfo[]
  } catch (error) {
    console.error('从目录读取地图失败:', error)
    return []
  }
}

/**
 * 获取单个地图文件夹的详细信息
 */
async function fetchMapInfo(folderName: string): Promise<MapInfo | null> {
  try {
    // 读取配置文件
    const config = await fetchMapConfig(folderName)

    // 如果标记为已删除，则跳过
    if (config?.isDelete) {
      return null
    }

    // 查找 map 目录下的 pgm 文件
    const mapPath = await findPgmFile(folderName)
    if (!mapPath) {
      console.warn(`地图文件夹 ${folderName} 中未找到 PGM 文件`)
      return null
    }

    // 查找 map 目录下的 pcd 文件（可选）
    const pcdPath = await findPcdFile(folderName)

    // 查找 map 目录下的 yaml 文件（可选）
    const yamlPath = await findYamlFile(folderName)

    // 统计 queue 目录下的 json 文件数量
    const queueCount = await countQueueFiles(folderName)

    // 获取显示名称（优先使用配置文件中的名称，否则使用文件夹名）
    const displayName = config?.name || folderName

    // 从文件夹名称解析创建时间（格式：map_YYYYMMDD_HHmmss）
    let createTime: string | undefined
    const timeMatch = folderName.match(/map_(\d{8})_(\d{6})/)
    if (timeMatch) {
      const dateStr = timeMatch[1]  // YYYYMMDD
      const timeStr = timeMatch[2]   // HHmmss
      const year = dateStr.substring(0, 4)
      const month = dateStr.substring(4, 6)
      const day = dateStr.substring(6, 8)
      const hour = timeStr.substring(0, 2)
      const minute = timeStr.substring(2, 4)
      const second = timeStr.substring(4, 6)
      createTime = `${year}-${month}-${day} ${hour}:${minute}:${second}`
    }

    return {
      folderName,
      displayName,
      mapPath,
      pcdPath,
      yamlPath,
      queueCount,
      config: config || undefined,
      createTime
    }
  } catch (error) {
    console.error(`获取地图信息失败 (${folderName}):`, error)
    return null
  }
}

/**
 * 读取地图配置文件
 */
async function fetchMapConfig(folderName: string): Promise<MapConfig | null> {
  try {
    // 尝试读取 config.json
    const configUrl = `/maps/${encodeURIComponent(folderName)}/config.json`
    const response = await fetch(configUrl, {
      headers: getAuthHeaders()
    })

    if (response.ok) {
      try {
        const text = await response.text()
        if (!text || text.trim() === '') {
          return null
        }
        const config = JSON.parse(text)
        return config as MapConfig
      } catch (parseError) {
        console.warn(`解析 config.json 失败 (${folderName}):`, parseError)
        return null
      }
    }

    // 如果 config.json 不存在，尝试读取 map.json
    const mapConfigUrl = `/maps/${encodeURIComponent(folderName)}/map.json`
    const mapConfigResponse = await fetch(mapConfigUrl, {
      headers: getAuthHeaders()
    })

    if (mapConfigResponse.ok) {
      try {
        const text = await mapConfigResponse.text()
        if (!text || text.trim() === '') {
          return null
        }
        const config = await JSON.parse(text)
        return config as MapConfig
      } catch (parseError) {
        console.warn(`解析 map.json 失败 (${folderName}):`, parseError)
        return null
      }
    }

    // 配置文件不存在是正常的，返回 null
    return null
  } catch (error) {
    // 静默处理，配置文件是可选的
    return null
  }
}

/**
 * 查找 map 目录下的 PGM 文件
 */
async function findPgmFile(folderName: string): Promise<string | null> {
  // 1. 尝试通过 API 获取 (JSON)
  try {
    const apiUrl = `/api/maps/files?folder=${encodeURIComponent(folderName)}&subDir=map`
    const response = await fetch(apiUrl, {
      headers: getAuthHeaders()
    })
    if (response.ok) {
      const data = await response.json()
      if (data.success && data.files) {
        const pgmFile = data.files.find((f: any) => f.name.endsWith('.pgm'))
        if (pgmFile) {
          return pgmFile.url // API 返回完整的 URL 路径
        }
      }
    }
  } catch (e) {
    // API 调用失败，继续尝试静态抓取
  }

  // 2. 回退到静态目录抓取 (HTML)
  try {
    const mapDirUrl = `/maps/${encodeURIComponent(folderName)}/map/`
    const response = await fetch(mapDirUrl, {
      headers: getAuthHeaders()
    })

    if (!response.ok) {
      // 如果 map 目录不存在，尝试直接在文件夹根目录查找
      return await findPgmInRoot(folderName)
    }

    const text = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/html')
    const links = doc.querySelectorAll('a')

    for (const link of links) {
      const href = link.getAttribute('href')
      if (href && href.endsWith('.pgm')) {
        return `/maps/${encodeURIComponent(folderName)}/map/${href.replace(/^.*\//, '')}`
      }
    }

    return null
  } catch (error) {
    console.warn(`查找 PGM 文件失败 (${folderName}):`, error)
    return null
  }
}

/**
 * 在文件夹根目录查找 PGM 文件（兼容旧结构）
 */
async function findPgmInRoot(folderName: string): Promise<string | null> {
  try {
    const folderUrl = `/maps/${encodeURIComponent(folderName)}/`
    const response = await fetch(folderUrl, {
      headers: getAuthHeaders()
    })

    if (!response.ok) {
      return null
    }

    const text = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/html')
    const links = doc.querySelectorAll('a')

    for (const link of links) {
      const href = link.getAttribute('href')
      if (href && href.endsWith('.pgm')) {
        return `/maps/${encodeURIComponent(folderName)}/${href.replace(/^.*\//, '')}`
      }
    }

    return null
  } catch (error) {
    return null
  }
}

/**
 * 查找 map 目录下的 PCD 文件（可选）
 */
async function findPcdFile(folderName: string): Promise<string | undefined> {
  // 1. 尝试通过 API 获取 (JSON)
  try {
    const apiUrl = `/api/maps/files?folder=${encodeURIComponent(folderName)}&subDir=map`
    const response = await fetch(apiUrl, {
      headers: getAuthHeaders()
    })
    if (response.ok) {
      const data = await response.json()
      if (data.success && data.files) {
        const pcdFile = data.files.find((f: any) => f.name.endsWith('.pcd'))
        if (pcdFile) {
          return pcdFile.url
        }
      }
    }
  } catch (e) {
    // API 调用失败，继续尝试静态抓取
  }

  // 2. 回退到静态目录抓取 (HTML)
  try {
    const mapDirUrl = `/maps/${encodeURIComponent(folderName)}/map/`
    const response = await fetch(mapDirUrl, {
      headers: getAuthHeaders()
    })

    if (!response.ok) {
      return undefined
    }

    const text = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/html')
    const links = doc.querySelectorAll('a')

    for (const link of links) {
      const href = link.getAttribute('href')
      if (href && href.endsWith('.pcd')) {
        return `/maps/${encodeURIComponent(folderName)}/map/${href.replace(/^.*\//, '')}`
      }
    }

    return undefined
  } catch (error) {
    return undefined
  }
}

/**
 * 查找 map 目录下的 YAML 文件（可选）
 */
async function findYamlFile(folderName: string): Promise<string | undefined> {
  // 1. 尝试通过 API 获取 (JSON)
  try {
    const apiUrl = `/api/maps/files?folder=${encodeURIComponent(folderName)}&subDir=map`
    const response = await fetch(apiUrl, {
      headers: getAuthHeaders()
    })
    if (response.ok) {
      const data = await response.json()
      if (data.success && data.files) {
        const yamlFile = data.files.find((f: any) => f.name.endsWith('.yaml') || f.name.endsWith('.yml'))
        if (yamlFile) {
          return yamlFile.url
        }
      }
    }
  } catch (e) {
    // API 调用失败，继续尝试静态抓取
  }

  // 2. 回退到静态目录抓取 (HTML)
  try {
    const mapDirUrl = `/maps/${encodeURIComponent(folderName)}/map/`
    const response = await fetch(mapDirUrl, {
      headers: getAuthHeaders()
    })

    if (!response.ok) {
      return undefined
    }

    const text = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/html')
    const links = doc.querySelectorAll('a')

    for (const link of links) {
      const href = link.getAttribute('href')
      if (href && (href.endsWith('.yaml') || href.endsWith('.yml'))) {
        return `/maps/${encodeURIComponent(folderName)}/map/${href.replace(/^.*\//, '')}`
      }
    }

    return undefined
  } catch (error) {
    return undefined
  }
}

/**
 * 统计 queue 目录下的 JSON 文件数量
 */
async function countQueueFiles(folderName: string): Promise<number> {
  try {
    const files = await getQueueFiles(folderName)
    // 过滤掉 text.json
    const validFiles = files.filter(file => !file.endsWith('text.json'))
    return validFiles.length
  } catch (error) {
    console.warn(`统计路线文件失败 (${folderName}):`, error)
    return 0
  }
}

/**
 * 获取 queue 目录下的所有 JSON 文件路径
 */
export async function getQueueFiles(folderName: string): Promise<string[]> {
  // 1. 尝试通过 API 获取 (JSON)
  try {
    const apiUrl = `/api/maps/files?folder=${encodeURIComponent(folderName)}&subDir=queue`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: getAuthHeaders()
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.files) {
        return data.files
          .filter((f: any) => f.name.endsWith('.json'))
          .map((f: any) => f.url)
      }
    }
  } catch (e) {
    // API 调用失败，继续尝试静态抓取
  }

  // 2. 回退到静态目录抓取 (HTML)
  try {
    const queueDirUrl = `/maps/${encodeURIComponent(folderName)}/queue/`
    // 添加超时处理
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时
    const response = await fetch(queueDirUrl, {
      signal: controller.signal,
      headers: getAuthHeaders()
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      return []
    }

    const text = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/html')
    const links = doc.querySelectorAll('a')

    const files: string[] = []
    links.forEach(link => {
      const href = link.getAttribute('href')
      if (href && href.endsWith('.json')) {
        const fileName = href.replace(/^.*\//, '')
        files.push(`/maps/${encodeURIComponent(folderName)}/queue/${fileName}`)
      }
    })

    return files
  } catch (error) {
    console.warn(`获取路线文件列表失败 (${folderName}):`, error)
    return []
  }
}

/**
 * 获取 map 目录下的所有地图文件路径（pcd、pgm、yaml）
 */
export async function getMapFiles(folderName: string): Promise<string[]> {
  // 1. 尝试通过 API 获取 (JSON)
  try {
    const apiUrl = `/api/maps/files?folder=${encodeURIComponent(folderName)}&subDir=map`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: getAuthHeaders()
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.files) {
        return data.files
          .filter((f: any) => {
            const name = f.name.toLowerCase()
            return name.endsWith('.pgm') || name.endsWith('.pcd') || name.endsWith('.yaml') || name.endsWith('.yml')
          })
          .map((f: any) => f.url)
      }
    }
  } catch (e) {
    // API 调用失败，继续尝试静态抓取
  }

  // 2. 回退到静态目录抓取 (HTML)
  try {
    const mapDirUrl = `/maps/${encodeURIComponent(folderName)}/map/`
    // 添加超时处理
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时
    const response = await fetch(mapDirUrl, {
      signal: controller.signal,
      headers: getAuthHeaders()
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      return []
    }

    const text = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/html')
    const links = doc.querySelectorAll('a')

    const files: string[] = []
    links.forEach(link => {
      const href = link.getAttribute('href')
      if (href) {
        const fileName = href.replace(/^.*\//, '')
        // 只包含地图相关文件
        if (fileName.endsWith('.pgm') || fileName.endsWith('.pcd') ||
          fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
          files.push(`/maps/${encodeURIComponent(folderName)}/map/${fileName}`)
        }
      }
    })

    return files
  } catch (error) {
    console.warn(`获取地图文件列表失败 (${folderName}):`, error)
    return []
  }
}

