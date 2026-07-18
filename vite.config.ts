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
        // 只预缓存体积小、离线首屏必需的应用外壳（HTML / 图标 / manifest）。
        // 关键：凡是页面运行时会自己请求的资源（字库 JSON、演示 GIF、JS/CSS）一律不预缓存，
        // 否则 Service Worker 首次安装时会与页面并行地再下载一遍，导致每个资源在首访时被请求两次
        // （strokes.json 20MB 会被下载两次 = 40MB）。这些资源改由下面的 runtimeCaching 在页面
        // 自身请求时顺带写入缓存——只请求一次，之后离线可用。
        globPatterns: ['**/*.{html,svg,png,webmanifest}'],
        runtimeCaching: [
          {
            // 应用 JS/CSS：文件名带内容哈希、内容不可变，缓存优先命中即用；新版本会用新文件名
            urlPattern: /\/assets\/.*\.(?:js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'bishun-assets',
              expiration: { maxEntries: 30 },
            },
          },
          {
            // 扩展字库（按需下载，约 10MB）：缓存优先；内容更新时须升 TRAD_PACK_VERSION 换 URL
            urlPattern: /strokes-trad\.json/,
            handler: 'CacheFirst',
            options: { cacheName: 'bishun-trad-pack' },
          },
          {
            // 基础字库（约 20MB）：缓存优先，只下载一次；内容更新时须升 STROKES_PACK_VERSION 换 URL
            urlPattern: /strokes\.json/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'bishun-base-pack',
              expiration: { maxEntries: 4 },
            },
          },
          {
            // 字表索引与演示 GIF：体积很小，用 SWR 顺带自动更新，无需版本号
            urlPattern: /(trad-index\.json|demo-bi\.gif)/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'bishun-misc' },
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
