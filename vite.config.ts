import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['dart.png'],
      manifest: {
        name: 'P의 여행',
        short_name: 'P의여행',
        description: '운명의 다트로 결정하는 무계획 여행',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone', // 브라우저 UI 없이 전체화면 앱처럼 실행
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ]
});