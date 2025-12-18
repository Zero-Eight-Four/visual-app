#!/bin/bash

# 1. Build Frontend
echo "Building Frontend..."
npm install
npm run build

# 2. Build Backend Docker Image
echo "Building Backend Docker Image..."
sudo docker build -t visual-app-backend .

# 3. Stop and Remove Existing Container
echo "Stopping existing container..."
sudo docker stop visual-backend || true
sudo docker rm visual-backend || true

# 4. Run New Container
echo "Starting new container..."
sudo docker run -d \
  --name visual-backend \
  --restart always \
  -p 3000:3000 \
  -v $(pwd)/maps:/app/maps \
  -v $(pwd)/image:/app/image \
  -v $(pwd)/videos:/app/videos \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/temp:/app/temp \
  visual-app-backend

echo "Deployment Complete!"
echo "Frontend files are in: $(pwd)/dist"
echo "Backend is running on port 3000"
