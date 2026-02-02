import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

import packageJSON from './package.json'

export default defineConfig(({ mode }) => ({
  plugins: [
    TanStackRouterVite({
      routeFileIgnorePattern: '(^[A-Z].*)',
    }),
    react(),
    svgr(),
  ],
  resolve: {
    alias: {
      '@': resolve('./src'),
    },
  },
  // See `src/main.tsx` file to assign these defined values to window.
  define: {
    __appVersion: JSON.stringify(packageJSON.version),
    __envMode: JSON.stringify(mode),
  },
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          if (id.includes('@tauri-apps')) {
            return 'tauri-vendor'
          }

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor'
          }

          if (id.includes('@tanstack/')) {
            return 'tanstack-vendor'
          }

          if (
            id.includes('@heroui/') ||
            id.includes('/framer-motion/') ||
            id.includes('/@react-aria/') ||
            id.includes('/@react-stately/')
          ) {
            return 'ui-vendor'
          }

          return 'vendor'
        },
      },
    },
  },
}))
