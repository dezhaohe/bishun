# Bishun (笔顺)

> Offline Chinese stroke-order lookup PWA — paste a paragraph, tap any character to see its stroke order animated

[中文](./README.md) | **Live demo: https://dezhaohe.github.io/bishun/**

Unlike stroke-order websites that require one online query per character, this tool splits a whole paragraph into tappable character cards at once. Tap a character to see its stroke order. **Fully offline after the first visit** — install it to your phone's home screen as a standalone app.

## ✨ Features

- **Paragraph input**: paste any text; Han characters are extracted and deduplicated into tappable cards
- **Stroke-order animation**: looping demo in a practice grid, radical highlighted in red, speed ×0.5 / ×1 / ×2
- **Character info**: pinyin (incl. polyphones), stroke count, radical, structure (left-right / top-bottom / enclosure…), stroke names
- **Tracing practice** (optional, off by default): trace each stroke with your finger; wrong strokes prompt a retry
- **Fully offline**: the Service Worker precaches ~20MB of stroke data (~8MB gzipped, downloaded once)
- **Coverage**: 6,866 of the 8,105 characters in China's Table of General Standard Chinese Characters — >99.9% of everyday text

## 📱 Install on your phone

1. Open https://dezhaohe.github.io/bishun/ in your mobile browser
2. iOS Safari: Share → **Add to Home Screen**; Android Chrome: Menu → **Install app**
3. Launch from the home-screen icon — works without a network connection (do the first visit on Wi-Fi)

## 🚀 Development

```bash
git clone https://github.com/dezhaohe/bishun.git
cd bishun
npm install
npm run dev       # dev server (stroke data is generated automatically first)
npm run build     # build to dist/
npm run preview   # preview the build (with Service Worker)
```

Requires Node.js ≥ 18.

## 🔧 Self-hosting

`dist/` is fully static — any HTTPS static host works (GitHub Pages, Vercel, Cloudflare Pages, your own Nginx…). Service Workers require HTTPS (except localhost).

To deploy your fork to GitHub Pages: change the repo URL in the `deploy` script in `package.json`, then run `npm run deploy`.

## 🙏 Data sources & credits

| Project | Used for | License |
|---|---|---|
| [Hanzi Writer](https://github.com/chanind/hanzi-writer) | stroke animation & quiz rendering | MIT |
| [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) / [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) | stroke SVG data | [Arphic Public License](./ARPHICPL.TXT) |
| [cnchar](https://github.com/theajack/cnchar) | pinyin / stroke names / radical / structure | MIT |
| [Table of General Standard Chinese Characters](https://github.com/jaywcjlove/table-of-general-standard-chinese-characters) | character table | MIT |

## 📄 License

Code is released under [MIT](./LICENSE). The bundled stroke data derives from fonts released by Arphic Technology in 1999 under the [Arphic Public License](./ARPHICPL.TXT).
