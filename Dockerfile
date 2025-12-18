FROM node:24.11.1-alpine

WORKDIR /app

COPY package.json ./

# Update npm to latest version
RUN npm install -g npm@latest

# Install dependencies (production only)
RUN npm install --omit=dev

# Copy server code and config
COPY server/ ./server/
COPY config/ ./config/
COPY dist/ ./dist/

# Create data directories
RUN mkdir -p maps image videos temp

EXPOSE 3000

CMD ["node", "server/server.js"]
