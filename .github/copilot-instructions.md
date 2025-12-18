# Copilot Instructions for Visual App

## Architecture Overview
- **Frontend**: Vue 3 (Composition API), Vite, TypeScript, Element Plus.
- **State Management**: Pinia (`src/stores`).
- **Backend**: Node.js/Express (`server.js`) acting as a file server (maps, videos) and API proxy.
- **ROS Integration**: `roslib` via WebSocket (`src/services/rosConnection.ts`).
- **3D Visualization**: `three.js` (`src/utils/threeUtils.ts`, `src/components/ThreeDViewer.vue`).

## Key Patterns & Conventions

### ROS Communication
- **Service**: Use `RosConnection` class (`src/services/rosConnection.ts`) for all ROS interactions.
- **Dynamic Import**: `roslib` is dynamically imported to handle loading failures gracefully.
- **Heartbeat**: The connection service implements a custom heartbeat mechanism with configurable intervals and timeouts.
- **Store**: Use `useRosStore` (`src/stores/ros.ts`) to access connection state and topics.

### Map Management
- **Structure**: Maps are stored in `maps/<timestamp>/` containing:
  - `config.json`: Map metadata.
  - `map/`: `.pgm` and `.yaml` files.
  - `queue/`: Task queue JSON files.
- **Fetching**: Use `mapUtils.ts` to fetch map data. It supports an API endpoint `/api/maps/list` with a fallback to directory scraping.

### Backend & Proxy
- **Server**: `server.js` serves static files (`/maps`) and proxies requests to the external API (`http://8.148.247.53:8000`).
- **Uploads**: Handles multipart file uploads with streaming to avoid memory issues.

### 3D Visualization
- **Utils**: Use `threeUtils.ts` for common Three.js objects (grids, axes, lights).
- **Viewer**: `ThreeDViewer.vue` is the main component for rendering 3D content.

## Developer Workflows
- **Development**: `npm run dev` starts the Vite dev server.
- **Build**: `npm run build` runs type checking (`vue-tsc`) and builds the app.
- **Linting**: `npm run lint` uses ESLint.

## Critical Files
- `src/services/rosConnection.ts`: Core ROS logic.
- `server.js`: Backend server and proxy configuration.
- `src/utils/mapUtils.ts`: Map file handling logic.
- `src/stores/ros.ts`: ROS state management.
