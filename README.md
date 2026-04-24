# Web Comic Reader

> **Original project:** [afzafri/Web-Comic-Reader](https://github.com/afzafri/Web-Comic-Reader) by Afif Zafri  
> **Reader engine:** [DHLKeyuser/Web-Comic-Reader](https://github.com/DHLKeyuser/Web-Comic-Reader) — `cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26`

A browser-based comic reader. Drag-drop (or click to browse) a `.cbr`, `.cbz`, or `.cbt` file and read it instantly — nothing is ever uploaded to a server.

---

## Current version: v2.2.1

### Changes in v2.2.1 (bug fixes)

| # | File | Fix |
|---|------|-----|
| 1 | `uncompress.js` | **Critical:** `archiveOpenFile()` was passing a Promise to its callback instead of a resolved archive for `.cbz` files, causing all ZIP comics to silently fail to render. Fixed by detecting the Promise return from `archiveOpenArrayBuffer()` and awaiting it before calling the callback. |
| 2 | `assets/js/vendor/dropzone.min.css` | Stripped all obsolete vendor prefixes (`-moz-border-radius`, `-webkit-transition`, `-moz-transition`, `@-ms-keyframes`) that were generating Firefox console warnings. No functional change. |
| 3 | `_headers` | Added `Cache-Control: no-cache, must-revalidate` rules for `/assets/*`, `/*.js`, and `/*.css` paths to prevent stale file caching after deployments. |

### Known non-actionable console notices

| Message | Source | Status |
|---------|--------|--------|
| `CSP blocked inline script (gaoptout.js)` | Google Analytics Opt-out **browser extension** injecting an inline script into the page. Not our code. | Cannot fix — do not add the hash to CSP as it would only apply to that one user's extension version. |
| `lightgallery-bundle.min.css`: `speak`, `-moz-osx-font-smoothing`, `@-ms-keyframes` warnings | Inside the CDN-hosted lightGallery 2.7.2 bundle. We do not control CDN files. | Cosmetic Firefox parser notices — no functionality impact. |
| `asm.js is deprecated` — `libunrar.js` | `libunrar.js` is a ~2015 Emscripten asm.js build. Firefox shows an informational deprecation notice. | RAR4 decoding still works. Long-term fix: replace with a WASM build (tracked in `SECURITY.md`). |

---

## Features

### Reading modes (from DHLKeyuser fork)

| Mode | Behaviour |
|------|-----------|
| **Paged** | One full-width page at a time. Prev/Next buttons + keyboard ← →. Click page to open lightbox. |
| **Webtoon / Scroll** | Continuous vertical strip — all pages stacked. IntersectionObserver lazy-loads images 800px ahead of viewport. |

Last-used mode is remembered in `localStorage`.

### Webtoon dock (from DHLKeyuser fork)
Fixed bottom bar, active in scroll mode only:
- Live page counter (`N / total`)
- Expand/collapse chevron button — state remembered in `localStorage`
- **Auto-hides** when scrolling down (≥6px delta), reappears on scroll-up
- **Tap-to-toggle:** tap the centre 50% of the scroll strip to show/hide the dock
- `updateDockPadding()` ensures content is never hidden beneath it

### Scroll zoom (from DHLKeyuser fork)
`+` / `−` toolbar buttons scale strip width 10%–200%. Disabled in paged mode. Persisted to `localStorage`.

### Smart gap removal (from DHLKeyuser fork)
Canvas pixel-sampling on each image load: samples a 20px strip at the top and bottom edge. If >92% of pixels are near-white (R, G, B all >240) on both touching edges, the gap between those pages is tightened to 6px (or 0 in full-strip mode), removing visual seams in scanned comics with white borders. Toggle persisted to `localStorage`.

### Keyboard navigation (from DHLKeyuser fork)
`←` / `→` arrow keys. Disabled when lightbox is open or a text field is focused.

### Restart
Toolbar button — jumps back to page 1.

### Large file support — up to 1 GB
Files ≤100 MB: single `FileReader` fast path.  
Files >100 MB: `readFileChunked()` reads in 64 MiB slices, yields between chunks via `setTimeout`, assembles into one `ArrayBuffer`. A byte-level progress bar shows loading progress.

### Lightbox gallery
Click any page in paged mode to open lightGallery 2.7.2 — zoom, fullscreen, thumbnail strip, rotation, autoplay.

### Drag-drop + click-to-open
Drop a file onto the upload zone or click anywhere in it to open the system file picker.

---

## Supported formats

| Extension | Format | Notes |
|-----------|--------|-------|
| `.cbz` | Comic Book ZIP | Full — JSZip 3.10.1 async API |
| `.cbr` | Comic Book RAR | RAR4 only — libunrar.js (asm.js ~2015); RAR5 not supported |
| `.cbt` | Comic Book TAR | Full — libuntar.js |

---

## Deployment

### Cloudflare Pages (recommended)

1. Fork this repository on GitHub
2. Cloudflare Dashboard → **Pages** → **Connect to Git** → select your fork
3. Build command: *(leave empty)* · Output directory: `/`
4. **Save and Deploy**

`_headers` is automatically applied by Cloudflare Pages — all security headers and cache-control rules are served at the edge. HTTPS is provided automatically.

```bash
# CLI deploy via Wrangler
npm install
npm run deploy
```

### Local development

```bash
npm run dev           # http://localhost:8080  (Quick Read only — no HTTPS)
npm run dev:https     # https://localhost:8443 (requires mkcert certs)
```

---

## What is NOT included

This is a **client-only** file reader. Intentionally excluded:

| Feature | Reason excluded |
|---------|----------------|
| Local folder library (File System Access API) | Chrome/Edge only; not in scope |
| IndexedDB directory handle persistence | Paired with folder library |
| Series grouping / accordion library view | Paired with folder library |
| Settings panel (default mode, auto-advance) | Mode/zoom saved directly to `localStorage` |
| Hosted library (`hosted-library.js`, `generate-library.sh`) | Requires server-side manifest |

---

## Project structure

```
├── index.html                     # Upload panel + reader output structure
├── assets/
│   ├── css/
│   │   └── styles.css             # All styles — upload card + full reader
│   └── js/
│       ├── script.js              # Application logic
│       ├── vendor/
│       │   ├── dropzone.min.js    # Dropzone 5.9.3 — vendored (CDN had wrong MIME)
│       │   └── dropzone.min.css   # Vendor-prefix warnings stripped
│       └── uncompress/
│           ├── uncompress.js      # Archive dispatcher — patched for JSZip 3.x + Promise fix
│           ├── jszip.js           # Bundled JSZip (overridden by CDN 3.10.1 at runtime)
│           ├── libunrar.js        # Emscripten asm.js RAR4 decoder
│           ├── libunrar.js.mem    # Memory init for libunrar
│           └── libuntar.js        # TAR reader
├── _headers                       # Cloudflare Pages HTTP security + cache headers
├── _redirects                     # SPA routing catch-all
├── wrangler.toml                  # Cloudflare Pages CLI config
├── package.json                   # Dev/deploy scripts
├── sbom.json                      # CycloneDX 1.5 Software Bill of Materials
├── SECURITY.md                    # Vulnerability policy + residual risk register
└── CHANGELOG.md                   # Full per-file change history
```

---

## Attribution

### Upstream
**[afzafri/Web-Comic-Reader](https://github.com/afzafri/Web-Comic-Reader)** (MIT) by Afif Zafri — project foundation, archive extraction via `uncompress.js`, original lightGallery integration.

### Reader engine
**[DHLKeyuser/Web-Comic-Reader](https://github.com/DHLKeyuser/Web-Comic-Reader)** — `cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26` branch.

The dual reading modes (paged + webtoon/scroll), webtoon dock, zoom controls, smart gap removal, IntersectionObserver lazy loading, scroll visibility tracking, keyboard navigation, and `naturalCompare()` were all ported from this branch. No hosted-library server code was included.

Source verified by diff against upstream: git pack file was truncated in the export (large binary deleted before zipping) but all working-tree source files were intact and diffed correctly.

### Third-party libraries

| Library | Version | Licence | Delivery |
|---------|---------|---------|----------|
| [uncompress.js](https://github.com/workhorsy/uncompress.js) | bundled | MIT | Local |
| [lightGallery](https://www.lightgalleryjs.com/) | 2.7.2 | GPL-3.0 | CDN (jsdelivr) |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | MIT | CDN (jsdelivr) |
| [Dropzone.js](https://www.dropzone.dev/) | 5.9.3 | MIT | Vendored local |
| libunrar.js | ~2015 Emscripten | LGPL | Local |

---

## License

MIT — see [LICENSE](./LICENSE)  
Original © 2017 Afif Zafri · Reader engine © DHLKeyuser · Modifications © 2025 contributors
