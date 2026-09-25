import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { legacyPolyfillsES5 } from './scripts/legacy-polyfills-plugin.ts'

export default defineConfig({
  base: '/tod/',
  // webOS 3.x uses Chromium 38; webOS 6.x uses Chromium 79.
  // The default minifier can reintroduce ES2015 syntax after Babel's ES5 pass.
  build: { cssTarget: 'chrome38', minify: 'terser', terserOptions: { ecma: 5 } },
  plugins: [
    react(),
    legacy({ targets: ['chrome >= 38'] }),
    legacyPolyfillsES5(),
    VitePWA({
      integration: { closeBundleOrder: 'post' },
      injectRegister: null,
      manifest: {
        background_color: '#427cbe',
        description: 'Локальная игра «Правда или действие» для компании.',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        lang: 'ru',
        name: 'Правда или Действие',
        orientation: 'any',
        scope: '/tod/',
        short_name: 'П или Д',
        start_url: '/tod/',
        theme_color: '#427cbe',
      },
      registerType: 'autoUpdate',
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globPatterns: ['**/*.{css,html,js,png,svg,woff,woff2}'],
        navigateFallback: 'index.html',
        skipWaiting: true,
      },
    }),
  ],
})
