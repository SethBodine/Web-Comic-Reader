# Changelog

All changes to this fork of [afzafri/Web-Comic-Reader](https://github.com/afzafri/Web-Comic-Reader).

---

## Attribution & source verification

| Source | Branch / ref | Verified via |
|--------|-------------|-------------|
| [afzafri/Web-Comic-Reader](https://github.com/afzafri/Web-Comic-Reader) | `master` | Uploaded zip — MD5 checksums confirmed |
| [DHLKeyuser/Web-Comic-Reader](https://github.com/DHLKeyuser/Web-Comic-Reader) | `cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26` | Uploaded zip — git pack file (truncated due to deleted 1 GB file); working tree intact; diff confirmed against upstream |

The DHLKeyuser fork was cloned from the correct branch. The git pack file was corrupt (large binary deleted before zip), but all working-tree source files were intact and diffed cleanly against upstream.

---

## [2.2.0] — Reader engine merge from DHLKeyuser fork

### Commit 1 — `feat(reader): dual reading mode — Paged and Webtoon/Scroll`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch  
**Files:** `assets/js/script.js`, `assets/css/styles.css`, `index.html`

Replaced the original single-mode thumbnail grid with a full dual-mode reader engine:

**Paged mode** (`readingMode === 'paged'`):
- Renders one full-width image at a time in `#pagedContainer > img#pagedImage`
- Prev/Next page buttons (`#prevPageBtn`, `#nextPageBtn`) and keyboard `← →`
- Image click opens lightGallery lightbox for zoom/fullscreen
- `renderPagedImage(index)` updates `src`, `alt`, and `currentPageIndex`

**Webtoon / Scroll mode** (`readingMode === 'scroll'`):
- `buildScrollPages()` renders all pages as vertical strip in `#scrollContainer`
- Each `<div class="scroll-page">` holds a lazy-loaded `<img data-src="...">` decoded with `IntersectionObserver` (800px root margin)
- `#output` gets class `scroll-mode` which sets full-width layout and removes card padding
- `applySmartGapState()` tightens `margin-bottom` between pages whose edges are white

**Mode switching:**
- `setReadingMode(mode)` persists to `localStorage` (key `readerMode`) and calls `applyReadingMode()`
- Toolbar mode buttons get `.active` class and `aria-pressed`
- Mode is restored from `localStorage` on next open; per-chapter `chapterProgress.mode` takes priority

**New HTML elements (index.html):**
- `#readerToolbar` — flexbox toolbar with mode toggle, nav, chapter, zoom, smart-gap
- `#pagedContainer` / `#pagedImageLink` / `#pagedImage`
- `#scrollContainer`
- `#lightboxLinks` — hidden anchor pool for lightGallery
- `#webtoonDock`, `#webtoonDockContent`, `#dockToggleBtn`, `#dockPageIndicator`
- `#dockPrevChapterBtn`, `#dockNextChapterBtn`
- `#nextChapterFloat`

**New CSS classes (styles.css):**
- `.reader-toolbar`, `.reader-toolbar-group`, `.toolbar-label`
- `.mode-toggle`, `.mode-btn`, `.mode-btn.active`
- `.reader-btn`, `.reader-btn:disabled`
- `.page-indicator`, `.zoom-level`, `.smart-gap-toggle`
- `.reader-meta`
- `.paged-container`, `.paged-image-link`, `.paged-image`
- `.lightbox-links`
- `.scroll-container`, `.scroll-page`, `.scroll-page--tight`
- `#output.scroll-mode` (full-width layout override)

---

### Commit 2 — `feat(reader): webtoon dock — fixed bottom bar with auto-hide`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch  
**Files:** `assets/js/script.js`, `assets/css/styles.css`

**Webtoon dock** — a fixed bottom panel that appears only in scroll mode:
- `activateWebtoonDock()` moves `#readerToolbar` into `#webtoonDockContent` and shows the dock
- `deactivateWebtoonDock()` returns toolbar to its original position in `#output`
- `setDockCollapsed(bool)` persists collapsed state to `localStorage` (key `webtoonDockCollapsed`)
- `updateDockState()` toggles `.collapsed`/`.expanded` and updates `aria-expanded`
- **Auto-hide on scroll-down:** `handleDockAutoHide(delta)` adds `.auto-hidden` (CSS `transform: translateY(100%)`) when user scrolls down > 6px; removed on scroll-up. Prevents dock from obscuring content while reading.
- **Tap-to-toggle:** `handleScrollContainerTap()` listens for clicks on the centre 50% of `#scrollContainer`; taps toggle dock collapse. Taps on interactive elements are ignored.
- `updateDockPadding()` sets `--dock-safe-offset` CSS var and `paddingBottom` on `#scrollContainer` so content never hides behind the dock.

**New CSS:** `.webtoon-dock`, `.webtoon-dock.collapsed`, `.webtoon-dock.expanded`, `.webtoon-dock.auto-hidden`, `.webtoon-dock-handle`, `.webtoon-dock-content`, `.dock-page-indicator`, `.dock-chapter-btn`, `.dock-toggle-btn`, `.dock-toggle-icon`, `.next-chapter-float`

---

### Commit 3 — `feat(reader): scroll zoom, smart gap removal, lazy loading`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch  
**Files:** `assets/js/script.js`, `assets/css/styles.css`

**Scroll zoom:**
- `adjustScrollZoom(delta)` increments `scrollZoom` (clamped 0.1–2.0) and calls `applyScrollZoom()`
- `applyScrollZoom()` sets CSS var `--scroll-image-width` on `#scrollContainer` which `.scroll-page img` reads via `width: var(--scroll-image-width, 90vw)`
- Zoom persisted to `localStorage` (key `scrollZoom`); restored on chapter open
- Zoom controls disabled in paged mode; `updateZoomControls()` reflects 100% label

**Smart gap removal:**
- `analyzeImageWhitespace(img, index)` called on each image `onload`
- Canvas-samples a 120×10px strip at top and bottom of the image
- If > 92% of sampled pixels have RGB > 240 (near-white), marks edge as white
- `updateSmartGapForIndex(index)` compares adjacent page edges; if both touching edges are white, adds `scroll-page--tight` class (reduces `margin-bottom` to 6px)
- `applySmartGapState()` re-applies all tight classes when toggle changes
- Toggle state persisted to `localStorage` (key `scrollSmartGap`)

**Lazy loading:**
- `initLazyObserver()` uses `IntersectionObserver` with 800px root margin
- Images stored with `data-src`; `setImageSource(img)` moves to `src` when intersecting
- Falls back to eager load if `IntersectionObserver` unavailable

**Scroll position tracking:**
- `initScrollObserver()` uses `IntersectionObserver` with thresholds [0, 0.25, 0.5, 0.75, 1]
- `visibilityRatios` Map tracks each page's visibility; `currentScrollIndex` updated to most-visible page
- `scheduleSaveProgress(index)` debounces 200ms before saving to `localStorage`
- `scheduleScrollProgressSave()` debounces 300ms to save `scrollRatio` (precise position within chapter)

---

### Commit 4 — `feat(reader): chapter navigation, auto-advance, keyboard nav`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch  
**Files:** `assets/js/script.js`, `index.html`

**Chapter navigation:**
- `openComic(file, { fromLibrary: true })` sets `currentChapterFromLibrary = true`
- `updateChapterContext(filename, fromLibrary)` finds the comic's index in `libraryComicList`
- `updateChapterButtons()` shows/enables prev/next chapter buttons based on index
- `openAdjacentChapter(offset)` saves current progress then opens `libraryComicList[currentChapterIndex + offset]`
- Chapter group hidden when not in library mode

**Auto-advance:**
- `isNearBottomOfChapter()` checks if last page's bottom is within 400px of viewport bottom
- `scheduleAutoAdvanceAfterIdle()` waits 250ms of scroll-idle then queues a 1000ms timer to call `goToNextChapter()`
- Cancels if user scrolls back up, or if `autoAdvanceEnabled` is false
- `#nextChapterFloat` button shown when near chapter end; click advances immediately
- Setting persisted via `readerSettings.autoAdvance`

**Keyboard navigation:**
- `handleReaderKeydown(event)` bound to `document` `keydown`
- `ArrowLeft` → `goToRelativePage(-1)`, `ArrowRight` → `goToRelativePage(1)`
- Ignored when focus is in `INPUT`, `TEXTAREA`, `SELECT`, or `contentEditable`
- Ignored when lightGallery is open (`document.body.classList.contains('lg-on')`)

**Scroll ratio persistence:**
- `getScrollRatio()` computes `(window.scrollY - containerTop) / maxScroll` → 0–1
- `scrollToScrollRatio(ratio)` restores exact position
- `restoreScrollRatio(ratio)` uses `requestAnimationFrame` + 250ms fallback for reliable restore after async page render

**Restart chapter:**
- `restartChapter()` clears chapter progress, resets indices to 0, scrolls to top or renders page 0

---

### Commit 5 — `feat(library): series grouping, progress bars, settings panel`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch  
**Files:** `assets/js/script.js`, `assets/css/styles.css`, `index.html`

**Series grouping:**
- `buildSeriesGroups(comics)` groups filenames by `parseSeriesKey(filename)`
- `parseSeriesKey()` strips volume/chapter numbers, years, scan tags, and special chars to produce a stable group key
- `formatSeriesTitle()` produces a display title using similar heuristics
- `renderSeriesLibrary(seriesList)` builds collapsible `.series-item` accordion elements
- Each chapter row shows filename, `formatProgressLabel()`, and a `<div class="progress-bar">` fill

**Per-chapter progress store** (separate from `comic_reader_userpref`):
- Key: `comicChapterProgress` in `localStorage`
- Schema: `{ [filename]: { mode, pageIndex, scrollRatio, webtoonZoom, pagedZoom, lastRead, pageCount } }`
- `saveChapterProgress(filename, overrides)` merges with existing entry
- `getProgressPercent(progress)` returns 0–100 from `scrollRatio` or `pageIndex/pageCount`
- `formatProgressLabel(progress)` returns "42% read" (webtoon) or "Page 7" (paged) or "Not started"
- `getLatestSeriesProgress(chapters, store)` finds most-recently-read chapter in a series

**Settings panel** (`#settingsPanel`):
- Default reading mode select (`scroll` / `paged`) — persisted to `comicReaderSettings`
- Auto-advance toggle — persisted to `comicReaderSettings`
- Reset all progress button — clears `comicChapterProgress`, refreshes lists
- Panel toggled by `#settingsToggleBtn` in library header

**New CSS:** `.settings-panel`, `.settings-row`, `.settings-toggle`, `.settings-select`, `.link-btn.danger`, `.series-list`, `.series-item`, `.series-item.expanded`, `.series-header`, `.series-title`, `.series-meta`, `.series-toggle`, `.series-chapters`, `.series-chapter`, `.series-chapter-title`, `.series-chapter-meta`, `.progress-bar`, `.progress-bar-fill`

---

### Commit 6 — `fix(deps): vendor Dropzone, upgrade lightGallery and JSZip`

**Files:** `index.html`, `assets/js/vendor/dropzone.min.js` *(new)*, `assets/js/vendor/dropzone.min.css` *(new)*

**Problem:** Dropzone was loaded from a floating CDN URL (`unpkg.com/dropzone` — no version pin). Dropzone 6.0.0 changed its dist layout to ESM-first; the UMD bundle moved and both CDNs served it as `Content-Type: text/plain`. With `X-Content-Type-Options: nosniff` active this caused:
```
MIME type mismatch — resource blocked
Cross-Origin Request Blocked
Uncaught ReferenceError: Dropzone is not defined
```

**Fix:** Dropzone vendored locally at `assets/js/vendor/dropzone.min.js` — same origin, correct MIME guaranteed.

**lightGallery 1.4.0 → 2.7.2:**
- v1 abandoned since 2019; multiple XSS vectors in plugin callback APIs
- v2 UMD bundle served from `cdn.jsdelivr.net/npm/lightgallery@2.7.2/` with correct MIME and CORS
- All plugin scripts updated to v2 UMD paths (`lg-zoom.umd.min.js` etc.)

**JSZip bundled 2.x → CDN 3.10.1:**
- 2.x had no path-traversal protection on ZIP entry names
- 3.x validates entry names and uses Promise API throughout
- `uncompress.js` patched: `new JSZip(buf)` → `JSZip.loadAsync(buf)`, `entry.asArrayBuffer()` → `entry.async('arraybuffer')`

---

### Commit 7 — `fix(security): XSS, localStorage sanitisation, file validation, blob leaks`

**Files:** `assets/js/script.js`

**XSS — innerHTML with user-controlled data (High):**
- `showLibraryMode()`: folder name now built via `document.createElementNS` + `textContent`, not `` innerHTML = `...${handle.name}` ``
- All filename display uses `textContent` assignment only
- Static SVG icons that contain no user data may still use `innerHTML` for the SVG markup itself

**localStorage injection (Medium):**
- `saveLastPageRead()` continues to write; reads validated by `safeReadHistory()` in our security layer
- Note: DHLKeyuser's `saveChapterProgress()` writes to `comicChapterProgress` key — this is a structured object with numeric/string values only, lower risk. No sanitisation added there to preserve exact fork behaviour.

**File validation (Medium):**
- `validateFile(file)` called in Dropzone `addedfile` handler before `openComic()`
- Extension must be in `ALLOWED_EXT` Set (`.cbr`, `.cbz`, `.cbt`)
- File size must be ≤ 1 GB (`MAX_FILE_BYTES`)

**Blob URL leaks (Low):**
- `_activeBlobURLs` Set tracks all created URLs
- `clearBlobs()` now revokes both the Set and the `pageUrls` array
- Individual revoke on `img.onload`/`img.onerror` added for scroll-mode images

**IndexedDB version bump:**
- `openDB()` uses version 2; `onupgradeneeded` drops and recreates `directories` store to clear stale v1 handles

---

### Commit 8 — `fix: lightGallery v2 API — init, event name`

**Files:** `assets/js/script.js`

DHLKeyuser's fork called `lightGallery(el, opts)` (v1 global) and listened to `onAfterSlide`. With the v2 CDN bundle:

```js
// BEFORE — v1 API (silent failure with v2 bundle)
lightGallery(lightboxLinksEl, { zoom: true, fullScreen: true, ... });
lightboxLinksEl.addEventListener('onAfterSlide', handleLightboxSlide);

// AFTER — v2 API
window.lightGallery(lightboxLinksEl, {
    plugins: [window.lgZoom, window.lgFullscreen, window.lgThumbnail, window.lgAutoplay, window.lgRotate],
    zoom: true, download: false, ...
});
lightboxLinksEl.addEventListener('lgAfterSlide', handleLightboxSlide);  // v2 event name
```

---

### Commit 9 — `fix(dropzone): set autoDiscover=false unconditionally before init`

**Files:** `assets/js/script.js`

DHLKeyuser's fork used `if (window.Dropzone) Dropzone.autoDiscover = false` — this guard ran during script parse, sometimes before the vendored `dropzone.min.js` was evaluated, leaving auto-discovery enabled and causing a second (failed) init attempt.

**Fix:** `Dropzone.autoDiscover = false` set unconditionally at the top of the Dropzone init block, after all scripts are guaranteed to have loaded (inside `DOMContentLoaded`).

---

### Commit 10 — `fix(css): remove invalid float:center, fix output layout`

**Files:** `assets/css/styles.css`

The original upstream CSS used `float: center` on `.imgUrl` — an invalid value Firefox reported as:
```
Error in parsing value for 'float'. Declaration dropped.
```
DHLKeyuser's restructured `#output` already removed this pattern, but an explicit reset guard is appended to prevent regression:
```css
.imgUrl { float: none; }
```

---

### Commit 11 — `feat: large file support up to 1 GB with chunked streaming`

**Files:** `assets/js/script.js`, `index.html`, `assets/css/styles.css`

**`readFileChunked(file, onComplete, onProgress)`:**
- Files ≤ 100 MB: `archiveOpenFile()` single-read fast path
- Files > 100 MB: reads in 64 MiB slices via `file.slice(offset, end)`, assembles into single `Uint8Array`, yields between chunks via `setTimeout(next, 0)`
- `onProgress(bytesRead, total)` drives `#chunkBar` width and `#chunkLabel` text
- File size capped at 1 GB; rejected before any archive processing

**New HTML elements:** `#chunkProgress`, `#chunkBar`, `#chunkLabel`, `#fileSizeWarning`

**New CSS:** `.chunk-progress`, `.chunk-bar-wrap`, `.chunk-bar`, `.chunk-label`, `.file-size-warning`

---

### Commit 12 — `feat(ux): drag-drop enhancements, large-file warning banner`

**Files:** `index.html`, `assets/css/styles.css`

- Dropzone form updated with upload arrow icon (SVG), `.dz-main-text`, `.dz-sub-text`, `.hint`
- `#fileSizeWarning` amber banner shown for files > 100 MB before reading begins
- `dz-drag-hover` class toggled by Dropzone events — highlights border and background
- `<noscript>` fallback message
- `rel="noopener noreferrer"` on GitHub footer link
- `aria-label` and `role` on interactive elements

**New CSS:** `.dz-upload-icon`, `.dz-main-text`, `.dz-sub-text`, `.file-size-warning`

---

### Commit 13 — `chore: Cloudflare Pages deployment config`

**Files:** `_headers` *(new)*, `_redirects` *(new)*, `wrangler.toml` *(new)*, `package.json` *(new)*

**`_headers`** — HTTP security headers applied at Cloudflare edge:
- `Content-Security-Policy` — scripts from `'self'` + `cdn.jsdelivr.net` only; `frame-ancestors 'none'` (**HTTP header only** — removed from `<meta>` where browsers ignore it)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — disables unused APIs
- `Strict-Transport-Security` — 1-year max-age
- `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy`

**`_redirects`** — `/* /index.html 200` for SPA routing

**`wrangler.toml`** — project name `web-comic-reader`, publish `.`

**`package.json`** — `npm run dev`, `npm run dev:https`, `npm run deploy`

---

### Commit 14 — `docs: SBOM, SECURITY.md, README, CHANGELOG`

**Files:** `sbom.json`, `SECURITY.md`, `README.md`, `CHANGELOG.md`

**`sbom.json`** — CycloneDX 1.5 Software Bill of Materials:
- All runtime dependencies with version, licence, CDN source, upgrade rationale
- Documents DHLKeyuser fork as a source reference

**`SECURITY.md`** — vulnerability disclosure policy, all applied fixes with before/after examples, residual risk register

**`README.md`** — feature table, DHLKeyuser attribution table, deployment guide, browser compatibility

---

## [2.1.0] — Console error fixes

**Commits from this version merged into 2.2.0 above.**

Key fixes introduced in 2.1.0:
- Dropzone CDN → vendored local
- `float: center` → `float: none`
- lightGallery v1 → v2 API
- `frame-ancestors` removed from `<meta>` CSP
- `Dropzone.autoDiscover = false` unconditional
- Gallery selector `'a'` → `'a[id="comicImg"]'` (now superseded by DHLKeyuser's `#lightboxLinks` pool)

---

## [2.0.0] — Security hardening and infrastructure

**Commits from this version merged into 2.2.0 above.**

Key changes introduced in 2.0.0:
- lightGallery 1.4 → 2.7.2
- JSZip 2.x → 3.10.1
- `uncompress.js` patched for JSZip 3.x async API
- XSS fixes (innerHTML → textContent)
- `safeReadHistory()` localStorage sanitisation
- Cloudflare Pages `_headers`/`_redirects`/`wrangler.toml`
- `sbom.json` CycloneDX SBOM

---

## [1.x] — Original

Original release by [@afzafri](https://github.com/afzafri). See upstream repo for history.
