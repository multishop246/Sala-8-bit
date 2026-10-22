import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { watch: { ignored: ['**/design/qa/**', '**/public/scenery/**'] } },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'scenery/office-reference-clean-v4.png', 'scenery/aromasil-original.png'],
      manifest: {
        name: 'Sala 8-bit',
        short_name: 'Sala 8-bit',
        description: 'Escritório virtual 3D para equipes de marketing',
        lang: 'pt-BR',
        theme_color: '#0c101d',
        background_color: '#0c101d',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, navigateFallbackDenylist: [/^\/auth/], globIgnores: ['**/postgres*', '**/*.wasm', '**/*.data', '**/*.tar.gz'] }
    })
  ]
});
