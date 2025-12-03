/**
 * 地图相关类型定义
 */

// 地图信息接口
export interface MapInfo {
  folderName: string  // 文件夹名称
  displayName: string  // 显示名称（支持中文）
  mapPath: string  // 地图文件路径（map目录下的pgm文件）
  pcdPath?: string  // PCD文件路径（可选）
  yamlPath?: string  // YAML文件路径（可选）
  queueCount: number  // 路线文件数量
  config?: MapConfig  // 配置文件内容（可选）
  createTime?: string  // 创建时间（可选）
}

// 地图配置接口
export interface MapConfig {
  name?: string  // 地图名称（支持中文）
  description?: string  // 地图描述
  [key: string]: any  // 其他配置项
}

