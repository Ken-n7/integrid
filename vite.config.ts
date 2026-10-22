import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Offline after the first visit. A new version installs in the background and applies on the next open.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'INTEGRID In Action',
        short_name: 'INTEGRID',
        description: 'A math crossword adventure for mastering integer operations.',
        theme_color: '#ffd34e',
        background_color: '#fff7e8',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // the music too, so it plays offline. Only the Latin font file: the other scripts' fonts are never shown, so don't download them for offline
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ogg,mp3}', '**/nunito-latin-wght-*.woff2'] },
    }),
  ],
})
