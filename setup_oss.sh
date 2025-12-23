#!/bin/bash

# 天翼云 OSS 配置信息
ACCESS_KEY_ID="e6f7497bf3a64721ba8d79bc4d942a4b"
ACCESS_KEY_SECRET="3449881e62484af5877613aae9d2cfa6"
BUCKET_NAME="zjypwy-pre"
ENDPOINT="https://hubei-41.zos.ctyun.cn"
MOUNT_POINT="/mnt/oss"

# 检查是否安装了 s3fs
if ! command -v s3fs &> /dev/null; then
    echo "正在安装 s3fs..."
    if [ -f /etc/debian_version ]; then
        sudo apt-get update && sudo apt-get install -y s3fs
    elif [ -f /etc/redhat-release ]; then
        sudo yum install -y epel-release && sudo yum install -y s3fs-fuse
    else
        echo "无法自动安装 s3fs，请手动安装: https://github.com/s3fs-fuse/s3fs-fuse"
        exit 1
    fi
fi

# 配置凭证
echo "${ACCESS_KEY_ID}:${ACCESS_KEY_SECRET}" > ~/.passwd-s3fs
chmod 600 ~/.passwd-s3fs

# 创建挂载点
sudo mkdir -p ${MOUNT_POINT}

# 卸载旧挂载 (如果存在)
sudo umount ${MOUNT_POINT} 2>/dev/null || true

# 挂载 OSS
# -o allow_other: 允许其他用户访问 (Docker 需要)
# -o use_path_request_style: 兼容 S3
# -o url: 端点地址
echo "正在挂载 ${BUCKET_NAME} 到 ${MOUNT_POINT}..."
sudo s3fs ${BUCKET_NAME} ${MOUNT_POINT} \
    -o passwd_file=${HOME}/.passwd-s3fs \
    -o url=${ENDPOINT} \
    -o use_path_request_style \
    -o allow_other \
    -o mp_umask=000

if [ $? -eq 0 ]; then
    echo "挂载成功！"
    echo "挂载路径: ${MOUNT_POINT}"
    ls -lh ${MOUNT_POINT}
else
    echo "挂载失败，请检查配置和网络。"
fi
