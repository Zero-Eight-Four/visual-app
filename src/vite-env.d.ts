/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROS_URL?: string
  readonly VITE_APP_LOGO?: string
  readonly VITE_APP_FAVICON?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
