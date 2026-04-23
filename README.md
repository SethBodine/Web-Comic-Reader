# Web Comic Reader

> **Original project:** [afzafri/Web-Comic-Reader](https://github.com/afzafri/Web-Comic-Reader) by Afif Zafri  
> **Reader engine:** [DHLKeyuser/Web-Comic-Reader](https://github.com/DHLKeyuser/Web-Comic-Reader) — `cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26`

A browser-based comic reader. Drag-drop (or click to browse) a `.cbr`, `.cbz`, or `.cbt` file and read it instantly — nothing is ever uploaded to a server.

---

## Features

### Reading modes (from DHLKeyuser fork)

| Mode | How it works |
|------|-------------|
| **Paged** | One full-width page at a time. Prev/Next buttons, keyboard ← →, click to open lightbox |
| **Webtoon / Scroll** | Continuous vertical strip — all pages stacked. Lazy-loaded for performance |

Last-used mode is remembered across sessions.

### Webtoon dock (from DHLKeyuser fork)
Fixed bottom bar in scroll mode — live page counter, expand/collapse chevron, auto-hides when scrolling down and reappears on scroll-up. Tap the centre of the strip to toggle it. Collapsed state remembered.

### Scroll zoom (from DHLKeyuser fork)
`+` / `−` buttons scale the strip width 10%–200%. Persisted across sessions.

### Smart gap removal (from DHLKeyuser fork)
Analyses pixel data along the top and bottom edge of each page via canvas sampling. If both touching edges are >92% white, the gap between those pages is tightened — removes visual seams in scanned comics with white borders.

### Keyboard navigation (from DHLKeyuser fork)
`←` / `→` to page through. Ignored when lightbox is open or a text field is focused.

### Restart
Jump back to page 1 from anywhere in the toolbar.

### Large file support — up to 1 GB
Files over 100 MB are read in 64 MiB chunks with a visible byte-level progress bar. The browser stays responsive throughout.

### Lightbox gallery
Click any page in paged mode to open lightGallery 2.7.2 — zoom, fullscreen, thumbnail strip, rotation, autoplay.

---

## Supported formats

| Extension | Format | Notes |
|-----------|--------|-------|
| `.cbz` | Comic Book ZIP | Full — JSZip 3.10.1 |
| `.cbr` | Comic Book RAR | RAR4 only — RAR5 not supported |
| `.cbt` | Comic Book TAR | Full — libuntar.js |

---

## Deployment

### Cloudflare Pages (recommended)
1. Fork on GitHub
2. Cloudflare Dashboard → **Pages** → **Connect to Git** → select fork
3. Build command: *(empty)* · Output directory: `/`
4. **Save and Deploy** — `_headers` applied automatically

```bash
npm install && npm run deploy   # CLI via Wrangler
```

### Local dev
```bash
npm run dev           # http://localhost:8080
npm run dev:https     # https://localhost:8443 (requires mkcert)
```

---

## What is NOT included

This is a **client-only** reader. Intentionally excluded:

| Feature | Reason |
|---------|--------|
| Local folder library (File System Access API) | Chrome/Edge only; out of scope |
| IndexedDB directory handle persistence | Paired with folder library |
| Series grouping / library view | Paired with folder library |
| Settings panel | Mode/zoom saved directly to `localStorage` |
| Hosted library (`hosted-library.js`, `generate-library.sh`) | Requires server-side manifest |

---

## Project structure

```
├── index.html                     # Upload panel + reader output
├── assets/
│   ├── css/styles.css             # All styles
│   └── js/
│       ├── script.js              # Application logic
│       ├── vendor/
│       │   ├── dropzone.min.js    # Vendored Dropzone 5.9.3
│       │   └── dropzone.min.css
│       └── uncompress/
│           ├── uncompress.js      # Archive dispatcher (JSZip 3.x patched)
│           ├── libunrar.js        # Emscripten RAR4 decoder
│           ├── libunrar.js.mem
│           └── libuntar.js
├── _headers                       # Cloudflare Pages security headers
├── _redirects                     # SPA routing
├── wrangler.toml                  # Cloudflare Pages CLI config
├── package.json                   # Dev/deploy scripts
├── sbom.json                      # CycloneDX 1.5 SBOM
└── SECURITY.md                    # Vulnerability policy + risk register
```

---

## Attribution

### Upstream
**[afzafri/Web-Comic-Reader](https://github.com/afzafri/Web-Comic-Reader)** (MIT) by Afif Zafri — foundation, archive extraction, gallery integration.

### Reader engine
**[DHLKeyuser/Web-Comic-Reader](https://github.com/DHLKeyuser/Web-Comic-Reader)** — `cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26` branch.  
Dual reading modes, webtoon dock, zoom, smart gap removal, lazy loading, scroll visibility tracking, keyboard navigation, and `naturalCompare()` were all ported from this branch. No hosted-library code was included.

### Libraries

| Library | Version | Licence | Role |
|---------|---------|---------|------|
| [uncompress.js](https://github.com/workhorsy/uncompress.js) | bundled | MIT | Archive extraction |
| [lightGallery](https://www.lightgalleryjs.com/) | 2.7.2 CDN | GPL-3.0 | Image lightbox |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 CDN | MIT | ZIP decompression |
| [Dropzone.js](https://www.dropzone.dev/) | 5.9.3 vendored | MIT | Drag-and-drop |
| libunrar.js | bundled ~2015 | LGPL | RAR4 decompression |

---

## License

MIT — see [LICENSE](./LICENSE)  
Original © 2017 Afif Zafri · Reader engine © DHLKeyuser · Modifications © 2025 contributors
