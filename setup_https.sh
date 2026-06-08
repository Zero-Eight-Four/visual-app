#!/bin/bash

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_DIR="$APP_DIR/certs"
IP_ADDR="${1:-8.148.247.53}"

mkdir -p "$CERT_DIR"

echo "Generating self-signed certificate for IP: $IP_ADDR"

openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$CERT_DIR/privkey.pem" \
  -out "$CERT_DIR/fullchain.pem" \
  -subj "/CN=$IP_ADDR" \
  -addext "subjectAltName=IP:$IP_ADDR"

chmod 600 "$CERT_DIR/privkey.pem"
chmod 644 "$CERT_DIR/fullchain.pem"

echo "Testing nginx configuration..."
sudo nginx -t

echo "Reloading nginx..."
sudo systemctl reload nginx

echo "HTTPS setup completed."
echo "Try: https://$IP_ADDR/robot-dog-web/"
echo "Note: self-signed cert will show browser warning unless you install a trusted certificate."