#!/usr/bin/env python3
"""
文件传输 HTTP API 服务器
运行在机器狗上，提供文件上传、下载、列表等功能
"""

from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
import os
import shutil
from pathlib import Path
import mimetypes

app = Flask(__name__)
# 配置 CORS，允许所有来源和必要的头部
CORS(app, 
     resources={r"/api/*": {"origins": "*"}},
     supports_credentials=True,
     allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

# 配置
BASE_DIR = '/home/unitree/go2_nav/system'  # 基础目录
MAX_FILE_SIZE = 1024 * 1024 * 1024  # 最大文件大小 1GB

@app.route('/api/files/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({'success': True, 'message': 'File service is running'})

@app.route('/api/files/list', methods=['GET'])
def list_directory():
    """列出目录内容"""
    try:
        path = request.args.get('path', BASE_DIR)
        full_path = os.path.join(BASE_DIR, path.lstrip('/'))

        # 安全检查：确保路径在 BASE_DIR 下
        full_path = os.path.abspath(full_path)
        if not full_path.startswith(os.path.abspath(BASE_DIR)):
            return jsonify({'success': False, 'message': 'Invalid path'}), 400

        if not os.path.exists(full_path):
            return jsonify({'success': False, 'message': 'Path does not exist'}), 404

        items = []
        for item in os.listdir(full_path):
            item_path = os.path.join(full_path, item)
            is_dir = os.path.isdir(item_path)
            size = None if is_dir else os.path.getsize(item_path)

            items.append({
                'name': item,
                'type': 'directory' if is_dir else 'file',
                'size': size,
                'path': os.path.relpath(item_path, BASE_DIR)
            })

        return jsonify({'success': True, 'items': items})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/files/upload', methods=['POST', 'OPTIONS'])
def upload_file():
    """上传文件"""
    # 处理 OPTIONS 预检请求
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No file provided'}), 400

        file = request.files['file']
        destination = request.form.get('destination', '')

        if file.filename == '':
            return jsonify({'success': False, 'message': 'No file selected'}), 400

        # 如果 destination 为空，使用 BASE_DIR
        if not destination:
            dest_dir = BASE_DIR
        else:
            # 构建目标目录路径
            dest_dir = os.path.join(BASE_DIR, destination.lstrip('/'))
        
        dest_dir = os.path.abspath(dest_dir)

        # 安全检查
        if not dest_dir.startswith(os.path.abspath(BASE_DIR)):
            return jsonify({'success': False, 'message': 'Invalid destination path'}), 400

        # 确保目标目录存在
        os.makedirs(dest_dir, exist_ok=True)

        # 保存文件到目标目录
        file_path = os.path.join(dest_dir, file.filename)
        file.save(file_path)

        return jsonify({
            'success': True,
            'message': f'File uploaded to {file_path}',
            'path': os.path.relpath(file_path, BASE_DIR)
        })
    except Exception as e:
        import traceback
        app.logger.error(f"Upload error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/files/download', methods=['GET'])
def download_file():
    """下载文件 - 支持大文件和断点续传"""
    try:
        path = request.args.get('path')
        if not path:
            return jsonify({'success': False, 'message': 'Path parameter required'}), 400

        full_path = os.path.join(BASE_DIR, path.lstrip('/'))
        full_path = os.path.abspath(full_path)

        # 安全检查
        if not full_path.startswith(os.path.abspath(BASE_DIR)):
            return jsonify({'success': False, 'message': 'Invalid path'}), 400

        if not os.path.exists(full_path):
            return jsonify({'success': False, 'message': 'File not found'}), 404

        if os.path.isdir(full_path):
            return jsonify({'success': False, 'message': 'Cannot download directory'}), 400

        file_size = os.path.getsize(full_path)
        filename = os.path.basename(full_path)
        
        # 获取 MIME 类型
        mime_type, _ = mimetypes.guess_type(full_path)
        if not mime_type:
            mime_type = 'application/octet-stream'
        
        # 支持 Range 请求（断点续传）
        range_header = request.headers.get('Range', None)
        if range_header:
            # 解析 Range 头
            byte_start = 0
            byte_end = file_size - 1
            
            range_match = range_header.replace('bytes=', '').split('-')
            if range_match[0]:
                byte_start = int(range_match[0])
            if len(range_match) > 1 and range_match[1]:
                byte_end = int(range_match[1])
            
            # 确保范围有效
            if byte_start >= file_size or byte_end >= file_size:
                return Response('Range Not Satisfiable', status=416)
            
            content_length = byte_end - byte_start + 1
            
            def generate():
                with open(full_path, 'rb') as f:
                    f.seek(byte_start)
                    remaining = content_length
                    chunk_size = 8192  # 8KB chunks
                    while remaining > 0:
                        read_size = min(chunk_size, remaining)
                        chunk = f.read(read_size)
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        yield chunk
            
            response = Response(
                generate(),
                status=206,  # Partial Content
                headers={
                    'Content-Type': mime_type,
                    'Content-Length': str(content_length),
                    'Content-Range': f'bytes {byte_start}-{byte_end}/{file_size}',
                    'Accept-Ranges': 'bytes',
                    'Content-Disposition': f'attachment; filename="{filename}"'
                }
            )
            return response
        else:
            # 完整文件下载 - 使用流式传输
            def generate():
                with open(full_path, 'rb') as f:
                    while True:
                        chunk = f.read(8192)  # 8KB chunks
                        if not chunk:
                            break
                        yield chunk
            
            response = Response(
                generate(),
                headers={
                    'Content-Type': mime_type,
                    'Content-Length': str(file_size),
                    'Accept-Ranges': 'bytes',
                    'Content-Disposition': f'attachment; filename="{filename}"'
                }
            )
            return response
            
    except Exception as e:
        import traceback
        app.logger.error(f"Download error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/files/move', methods=['POST', 'OPTIONS'])
def move_file():
    """移动文件"""
    # 处理 OPTIONS 预检请求
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json() or {}
        source = data.get('source')
        destination = data.get('destination')

        if not source or not destination:
            return jsonify({'success': False, 'message': 'Source and destination required'}), 400

        src_path = os.path.join(BASE_DIR, source.lstrip('/'))
        dst_path = os.path.join(BASE_DIR, destination.lstrip('/'))

        src_path = os.path.abspath(src_path)
        dst_path = os.path.abspath(dst_path)

        # 安全检查
        base = os.path.abspath(BASE_DIR)
        if not src_path.startswith(base) or not dst_path.startswith(base):
            return jsonify({'success': False, 'message': 'Invalid path'}), 400

        if not os.path.exists(src_path):
            return jsonify({'success': False, 'message': 'Source not found'}), 404

        # 确保目标目录存在
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)

        shutil.move(src_path, dst_path)
        return jsonify({'success': True, 'message': 'File moved successfully'})
    except Exception as e:
        import traceback
        app.logger.error(f"Move error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/files/copy', methods=['POST', 'OPTIONS'])
def copy_file():
    """复制文件"""
    # 处理 OPTIONS 预检请求
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json() or {}
        source = data.get('source')
        destination = data.get('destination')

        if not source or not destination:
            return jsonify({'success': False, 'message': 'Source and destination required'}), 400

        src_path = os.path.join(BASE_DIR, source.lstrip('/'))
        dst_path = os.path.join(BASE_DIR, destination.lstrip('/'))

        src_path = os.path.abspath(src_path)
        dst_path = os.path.abspath(dst_path)

        # 安全检查
        base = os.path.abspath(BASE_DIR)
        if not src_path.startswith(base) or not dst_path.startswith(base):
            return jsonify({'success': False, 'message': 'Invalid path'}), 400

        if not os.path.exists(src_path):
            return jsonify({'success': False, 'message': 'Source not found'}), 404

        # 确保目标目录存在
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)

        if os.path.isdir(src_path):
            shutil.copytree(src_path, dst_path, dirs_exist_ok=True)
        else:
            shutil.copy2(src_path, dst_path)

        return jsonify({'success': True, 'message': 'File copied successfully'})
    except Exception as e:
        import traceback
        app.logger.error(f"Copy error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/files/delete', methods=['POST', 'OPTIONS'])
def delete_file():
    """删除文件或目录"""
    # 处理 OPTIONS 预检请求
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json() or {}
        path = data.get('path')

        if not path:
            return jsonify({'success': False, 'message': 'Path required'}), 400

        full_path = os.path.join(BASE_DIR, path.lstrip('/'))
        full_path = os.path.abspath(full_path)

        # 安全检查
        if not full_path.startswith(os.path.abspath(BASE_DIR)):
            return jsonify({'success': False, 'message': 'Invalid path'}), 400

        if not os.path.exists(full_path):
            return jsonify({'success': False, 'message': 'Path not found'}), 404

        if os.path.isdir(full_path):
            shutil.rmtree(full_path)
        else:
            os.remove(full_path)

        return jsonify({'success': True, 'message': 'Deleted successfully'})
    except Exception as e:
        import traceback
        app.logger.error(f"Delete error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/files/mkdir', methods=['POST', 'OPTIONS'])
def create_directory():
    """创建目录"""
    # 处理 OPTIONS 预检请求
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json() or {}
        path = data.get('path')

        if not path:
            return jsonify({'success': False, 'message': 'Path required'}), 400

        full_path = os.path.join(BASE_DIR, path.lstrip('/'))
        full_path = os.path.abspath(full_path)

        # 安全检查
        if not full_path.startswith(os.path.abspath(BASE_DIR)):
            return jsonify({'success': False, 'message': 'Invalid path'}), 400

        os.makedirs(full_path, exist_ok=True)
        return jsonify({'success': True, 'message': 'Directory created successfully'})
    except Exception as e:
        import traceback
        app.logger.error(f"Mkdir error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.errorhandler(404)
def handle_404(e):
    """处理 404 错误，记录异常请求"""
    path = request.path
    method = request.method
    remote_addr = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    # 检测可疑请求（包含完整 URL 的路径、外部域名等）
    suspicious_patterns = [
        'http://', 'https://', '.com/', '.cn/', '.net/', '.org/',
        'passport.', 'login.', 'admin.', 'api.', 'www.'
    ]
    
    is_suspicious = any(pattern in path.lower() for pattern in suspicious_patterns)
    
    if is_suspicious:
        app.logger.warning(
            f"可疑请求检测: {method} {path} "
            f"来自 {remote_addr} "
            f"User-Agent: {user_agent} "
            f"Headers: {dict(request.headers)}"
        )
    
    return jsonify({
        'success': False,
        'message': 'Endpoint not found',
        'path': path
    }), 404

@app.before_request
def log_request_info():
    """记录请求信息（仅用于调试可疑请求）"""
    # 只记录非 API 路径的请求，避免日志过多
    if not request.path.startswith('/api/'):
        app.logger.debug(
            f"非 API 请求: {request.method} {request.path} "
            f"来自 {request.remote_addr}"
        )

if __name__ == '__main__':
    # 运行服务器
    # 默认端口 8080，可以通过环境变量修改
    port = int(os.environ.get('FILE_SERVICE_PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)

