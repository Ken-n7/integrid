import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    { name: 'integrid-loading-shell', transformIndexHtml: (_html, context) => context.filename?.endsWith('/index.html') ? [{ tag: 'style', children: readFileSync('src/loading.css', 'utf8'), injectTo: 'head' }] : [] },
    react(),
    // Keep offline play, while the app controls when it is safe to refresh an open screen.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
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
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ogg,mp3,wav}', '**/nunito-latin-wght-*.woff2'],
        globIgnores: ['**/gallery.html', 'art/**/*.png', 'social/**'],
      },
    }),
  ],
})
