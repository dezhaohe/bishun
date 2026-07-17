import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  server: { port: 5175 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        // 基础笔顺数据一并预缓存，保证首访后完全离线可用；
        // 繁体扩展包不预缓存，用户按需下载后由 runtimeCaching 缓存
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        globIgnores: ['**/strokes-trad.json'],
        maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /strokes-trad\.json/,
            handler: 'CacheFirst',
            options: { cacheName: 'bishun-trad-pack' },
          },
        ],
      },
      manifest: {
        name: '笔顺随身查',
        short_name: '笔顺随身查',
        description: '整段识别，点字看笔顺，离线可用：粘贴一段话，点任意字查看笔顺动画',
        lang: 'zh-CN',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#c0392b',
        background_color: '#faf9f7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
