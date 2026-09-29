/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: 'demo' | 'api'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
