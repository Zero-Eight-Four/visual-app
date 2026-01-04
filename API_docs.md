# API Documentation

## Notification API

该 API 用于向前端发送实时通知弹窗。支持显示文本消息和图片。

### Endpoint

`POST /api/notification`

### Request Headers

| Header | Value |
|--------|-------|
| Content-Type | `application/json` |

### Request Body Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `message` | string | Yes | - | 通知的正文内容。 |
| `title` | string | No | "系统通知" | 通知的标题。 |
| `imageUrl` | string | No | - | 要在通知中显示的图片 URL 地址。 |
| `type` | string | No | "info" | 通知的类型，决定图标和颜色。可选值: `success`, `warning`, `info`, `error`。 |
| `duration` | number | No | 4500 | 通知显示的持续时间（毫秒）。设置为 `0` 则不会自动关闭。 |

### Response

**Status Code**: `200 OK`

```json
{
  "success": true,
  "count": 1  // 接收到通知的在线客户端数量
}
```

### Examples

#### 1. 发送普通文本通知

```bash
curl -X POST http://localhost:3000/api/notification \
  -H "Content-Type: application/json" \
  -d '{
    "title": "任务完成",
    "message": "所有后台任务已处理完毕。",
    "type": "success"
  }'
```

#### 2. 发送带图片的通知

```bash
curl -X POST http://localhost:3000/api/notification \
  -H "Content-Type: application/json" \
  -d '{
    "title": "检测警报",
    "message": "在区域 A 发现异常目标。",
    "imageUrl": "https://element-plus.org/images/element-plus-logo.svg",
    "type": "warning",
    "duration": 0
  }'
```

#### 3. Python `requests` 示例

```python
import requests

url = "http://localhost:3000/api/notification"
payload = {
    "title": "Python 脚本通知",
    "message": "数据分析已完成。",
    "type": "info"
}

try:
    response = requests.post(url, json=payload)
    print(response.json())
except Exception as e:
    print(f"Error: {e}")
```

### Notes

*   该功能基于 Server-Sent Events (SSE) 实现。
*   前端必须保持连接状态才能收到通知。
*   `imageUrl` 支持以下格式：
    *   HTTP/HTTPS URL: `https://example.com/image.jpg`
    *   服务器相对路径: `/images/check/img_1.jpg`
    *   服务器本地绝对路径 (仅限 `image` 目录下): `/home/zeroef/visual-app/image/check/img_1.jpg` (会自动转换为 URL)
