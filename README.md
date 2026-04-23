# Web Comic Reader

> **Original project:** [afzafri/Web-Comic-Reader](https://github.com/afzafri/Web-Comic-Reader) by Afif Zafri  
> **Reader engine fork:** [DHLKeyuser/Web-Comic-Reader](https://github.com/DHLKeyuser/Web-Comic-Reader) — `cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26`  
> **This PR** merges DHLKeyuser's reader engine with security hardening, large-file support, and Cloudflare Pages deployment.

---

## What's new in v2.2.0

### From [DHLKeyuser/Web-Comic-Reader](https://github.com/DHLKeyuser/Web-Comic-Reader) (cursor branch)

| Feature | Detail |
|---------|--------|
| **Webtoon / Scroll mode** | Continuous vertical strip — all pages load end-to-end for manga / webtoon reading |
| **Paged mode** | Single full-width image with Prev/Next buttons; toggle between modes any time |
| **Mode persistence** | Last-used mode saved in `localStorage` per-session; chapter progress stores which mode was active |
| **Per-chapter progress** | `pageIndex`, `scrollRatio`, `webtoonZoom`, `lastRead` saved per file in `comicChapterProgress` localStorage key |
| **Progress bars** | Visual fill bars on series chapters and recently-read items |
| **Scroll zoom** | +/− buttons scale webtoon strip width 10–200%; persisted |
| **Smart gap removal** | Canvas pixel-sampling detects white borders between pages and tightens margins automatically |
| **IntersectionObserver lazy load** | Scroll-mode images decode only when near viewport (800px margin) |
| **Webtoon dock** | Fixed bottom bar: page counter, chapter nav, collapse/expand; auto-hides on scroll-down, tap-to-toggle |
| **Keyboard navigation** | ← → Arrow keys to page through |
| **Chapter navigation** | Prev/Next chapter buttons when a comic is opened from the library; floating "Next Chapter →" at scroll end |
| **Auto-advance** | Optional: automatically opens next chapter after a pause at the end of a chapter |
| **Series grouping** | Comics grouped by parsed series name with collapsible accordion |
| **Settings panel** | Default reading mode, auto-advance toggle, reset-all-progress button |
| **Restart chapter** | One-click restart to page 1 |
| **naturalCompare()** | Chunk-based numeric sort (more robust than `localeCompare`) |

### Security & infrastructure (our additions)

| Area | Change |
|------|--------|
| **XSS** | All `innerHTML` using filenames/folder names replaced with `textContent` / DOM API |
| **localStorage** | `safeReadHistory()` validates thumbnails as `data:image/jpeg;base64,...` only |
| **File validation** | `validateFile()` checks extension + 1 GB cap before any archive parsing |
| **Blob URLs** | Tracked in `_activeBlobURLs` Set; revoked in `onload/onerror`; `clearBlobs()` also revokes on comic open |
| **IndexedDB** | Bumped to version 2; `onupgradeneeded` drops stale v1 store |
| **Dropzone** | Vendored locally (CDN was serving wrong MIME type); `autoDiscover = false` before `new Dropzone()` |
| **lightGallery** | Migrated to v2.7.2 UMD API (`window.lightGallery`, plugins array, `lgAfterSlide` event) |
| **JSZip** | 2.x → 3.10.1 via CDN; path-traversal entry-name validation |
| **CSP** | `frame-ancestors` removed from `<meta>` (browser-ignored); `unsafe-eval` removed |
| **Large files** | Up to 1 GB via 64 MiB `readFileChunked()` with byte-progress bar |
| **CSS** | `float: center` (invalid) removed; `#output` uses flexbox |

---

## Features overview

- **Library Mode** — select your comics folder once; browser remembers access (Chrome/Edge/Opera desktop)
- **Reading Progress** — page, scroll position and zoom saved per comic/chapter
- **Series Library** — comics grouped by series, collapsible per-chapter accordion with progress bars
- **Recently Read** — 5 most recent comics with progress and timestamp
- **Quick Read** — drag-drop or click-to-open; no setup required
- **Two Reading Modes** — Paged (manga-style) or Webtoon/Scroll (continuous strip)
- **Webtoon Dock** — fixed bottom UI: page indicator, chapter navigation, auto-hides during reading
- **Keyboard Navigation** — ← → arrows
- **Smart Gap Removal** — automatically tightens gaps between pages with white edges
- **Dark Mode** — automatic via `prefers-color-scheme`
- **Cloudflare Pages** — deploy with zero config; security headers via `_headers`

---

## Supported formats

| Extension | Format | Notes |
|-----------|--------|-------|
| `.cbz` | Comic Book ZIP | Full — JSZip 3.x |
| `.cbr` | Comic Book RAR | RAR4 only (libunrar.js); RAR5 not supported |
| `.cbt` | Comic Book TAR | Full — libuntar.js |

Files up to **1 GB** supported.

---

## Deployment

### Cloudflare Pages

1. Fork this repo on GitHub
2. Cloudflare dashboard → **Pages** → **Connect to Git** → select fork
3. Build command: *(empty)* · Output directory: `/`
4. **Save and Deploy** — `_headers` is applied automatically

```bash
# CLI deploy
npm install && npm run deploy
```

### Local

```bash
npm run dev          # http://localhost:8080 — Quick Read only
npm run dev:https    # https://localhost:8443 — Library Mode enabled
```

---

## Browser compatibility

| Browser | Library Mode | Quick Read |
|---------|-------------|------------|
| Chrome / Edge / Opera (desktop) | ✅ | ✅ |
| Firefox | ⚠️ flag only | ✅ |
| Safari / iOS | ❌ | ✅ |

---

## Attribution

### Upstream
**[afzafri/Web-Comic-Reader](https://github.com/afzafri/Web-Comic-Reader)** (MIT) by Afif Zafri — original foundation.

### Reader engine
**[DHLKeyuser/Web-Comic-Reader](https://github.com/DHLKeyuser/Web-Comic-Reader)** — `cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26` branch.  
The complete reader engine (dual reading modes, webtoon dock, chapter navigation, series grouping, smart gap, zoom, progress tracking) was ported from this branch. The `assets/js/script.js` and `assets/css/styles.css` use DHLKeyuser's code as the base with security patches applied on top.

**Intentionally omitted** from DHLKeyuser fork: `hosted-library.js`, `generate-library.sh`, `#hostedLibraryView` — these require a server-side manifest and are out of scope for this client-only fork.

### Third-party libraries

| Library | Version | Licence | Role |
|---------|---------|---------|------|
| [uncompress.js](https://github.com/workhorsy/uncompress.js) | bundled | MIT | CBR/CBZ/CBT extraction |
| [lightGallery](https://www.lightgalleryjs.com/) | 2.7.2 | GPL-3.0 | Image gallery / viewer |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | MIT | ZIP decompression |
| [Dropzone.js](https://www.dropzone.dev/) | 5.9.3 (vendored) | MIT | Drag-and-drop |
| [libunrar.js](https://github.com/workhorsy/uncompress.js) | bundled (~2015) | LGPL | RAR4 decompression |

---

## License

MIT — see [LICENSE](./LICENSE)  
Original © 2017 Afif Zafri · Reader engine © DHLKeyuser · Modifications © 2025 contributors
