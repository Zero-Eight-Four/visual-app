ARG NODE_IMAGE=docker.m.daocloud.io/library/node:24.11.1-alpine
FROM ${NODE_IMAGE}

WORKDIR /app

COPY package.json package-lock.json ./

# Keep npm on a Node 24.11-compatible major version.
RUN npm install -g npm@11 --registry=https://registry.npmmirror.com

# Install dependencies (production only)
RUN npm install --omit=dev --registry=https://registry.npmmirror.com

# Copy server code and config
COPY server/ ./server/
COPY config/ ./config/
COPY dist/ ./dist/

# Create data directories
RUN mkdir -p maps image videos temp

EXPOSE 3000

CMD ["node", "server/server.js"]
