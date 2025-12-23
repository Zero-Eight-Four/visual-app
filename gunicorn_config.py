# Gunicorn 配置文件

import multiprocessing
import os

# 服务器配置
bind = f"0.0.0.0:{os.environ.get('FILE_SERVICE_PORT', '8080')}"
workers = int(os.environ.get('GUNICORN_WORKERS', multiprocessing.cpu_count() * 2 + 1))
worker_class = 'sync'
worker_connections = 1000
timeout = 1200  # 增加到 20 分钟，支持大文件上传
keepalive = 5

# 日志配置
accesslog = '-'
errorlog = '-'
loglevel = 'info'

# 进程名称
proc_name = 'file_transfer_api'

# 其他配置
max_requests = 1000
max_requests_jitter = 50
preload_app = True

