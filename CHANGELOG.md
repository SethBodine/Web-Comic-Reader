# Changelog

Fork of [afzafri/Web-Comic-Reader](https://github.com/afzafri/Web-Comic-Reader).

---

## Source verification

| Source | Ref | How confirmed |
|--------|-----|---------------|
| afzafri/Web-Comic-Reader | `master` | Uploaded zip; MD5 confirmed |
| DHLKeyuser/Web-Comic-Reader | `cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26` | Uploaded zip; git pack truncated (large binary deleted before export) but all working-tree source files intact; diff confirmed against upstream |

---

## [2.2.0] — Reader engine merge + no-library rebuild

### Commit 1 — `feat(reader): paged mode — single-image view with lightbox`

**Source:** DHLKeyuser cursor branch  
**Files:** `index.html`, `assets/js/script.js`, `assets/css/styles.css`

Replaced the original thumbnail-grid output with a structured reader layout. Paged mode renders one full-width image at a time inside `#pagedContainer`.

- `renderPagedImage(index)` sets `#pagedImage.src`, updates `currentPageIndex`, calls `updatePageIndicator()`
- `#pagedImageLink` click opens lightGallery lightbox at the current page index via the hidden `#lightboxLinks` anchor pool
- Prev/Next buttons (`#prevPageBtn`, `#nextPageBtn`) call `goToRelativePage(±1)`
- `←` / `→` keyboard shortcuts via `handleKeydown()` — ignored when `document.body.classList.contains('lg-on')` (lightbox open) or focus is in a text field
- Mode button gets `.active` class + `aria-pressed="true"`
- `applyReadingMode()` shows `#pagedContainer`, hides `#scrollContainer`, removes `#output.scroll-mode`, deactivates webtoon dock

**New elements:** `#pagedContainer`, `#pagedImageLink`, `#pagedImage`, `#lightboxLinks`

**New CSS:** `.paged-container`, `.paged-image-link`, `.paged-image`, `.lightbox-links`

---

### Commit 2 — `feat(reader): webtoon/scroll mode — continuous vertical strip with lazy loading`

**Source:** DHLKeyuser cursor branch  
**Files:** `assets/js/script.js`, `assets/css/styles.css`

Scroll mode renders all pages as a continuous vertical strip in `#scrollContainer`.

**`buildScrollPages()`** — called once per comic; builds `div.scroll-page > img[data-src]` elements. Images use `data-src` rather than `src` to defer decoding until near-viewport.

**`initLazyObserver()`** — `IntersectionObserver` with 800px root margin. `setImgSrc(img)` moves `data-src` → `src` when page intersects. Falls back to eager-load if observer unavailable.

**`initScrollObserver()`** — second `IntersectionObserver` with thresholds `[0, 0.25, 0.5, 0.75, 1]` on each `.scroll-page`. Tracks `visibilityRatios` Map; `currentScrollIdx` updated to most-visible page index. Drives live page indicator and debounced `localStorage` save (`lastScrollPage_<filename>`).

`applyReadingMode('scroll')` adds `#output.scroll-mode` (full-width, no card border), shows `#scrollContainer`, hides `#pagedContainer`, activates webtoon dock.

**New element:** `#scrollContainer`

**New CSS:** `.scroll-container`, `.scroll-page`, `#output.scroll-mode` (full-width override)

---

### Commit 3 — `feat(reader): webtoon dock — fixed bottom bar, auto-hide, tap-to-toggle`

**Source:** DHLKeyuser cursor branch  
**Files:** `index.html`, `assets/js/script.js`, `assets/css/styles.css`

**`activateWebtoonDock()`** — moves `#readerToolbar` into `#webtoonDockContent`; shows `#webtoonDock`; calls `updateDockState()` and `updateDockPadding()`.

**`deactivateWebtoonDock()`** — returns `#readerToolbar` to `#output`; hides dock; clears `paddingBottom` on `#scrollContainer`.

**`setDockCollapsed(bool)`** — toggles `.collapsed`/`.expanded` classes; persists to `localStorage` (`webtoonDockCollapsed`); updates `aria-expanded` and `aria-label` on `#dockToggleBtn`.

**`updateDockPadding()`** — measures dock height via `getBoundingClientRect().height`; sets `paddingBottom` on `#scrollContainer` and CSS var `--dock-safe-offset` so content is never hidden behind the dock.

**Auto-hide on scroll-down** (`handleWindowScroll()`):
- Computes delta from previous `scrollY`
- If `|delta| >= 6`: scroll-down → adds `.auto-hidden` (`transform: translateY(100%); opacity: 0`); scroll-up → removes it
- Only active in scroll mode

**Tap-to-toggle** (`handleScrollTap(event)`):
- Listens on `#scrollContainer` click
- Ignores taps on interactive elements (`button`, `a`, `input`, `select`, `label`)
- If tap x-position is in the centre 50% of viewport: if dock is auto-hidden → show it; else toggle collapsed

**New elements:** `#webtoonDock`, `#webtoonDockContent`, `#webtoonDock-handle`, `#dockToggleBtn`, `#dockPageIndicator`

**New CSS:** `.webtoon-dock`, `.webtoon-dock.collapsed`, `.webtoon-dock.expanded`, `.webtoon-dock.auto-hidden`, `.webtoon-dock-handle`, `.webtoon-dock-content`, `.dock-page-indicator`, `.dock-toggle-btn`, `.dock-toggle-icon`

---

### Commit 4 — `feat(reader): scroll zoom — +/− controls, 10%–200%, persisted`

**Source:** DHLKeyuser cursor branch  
**Files:** `assets/js/script.js`

**`adjustScrollZoom(delta)`** — increments `scrollZoom` by `delta`, clamped to `[0.1, 2.0]`, calls `applyScrollZoom()`.

**`applyScrollZoom()`** — computes `w = min(90 * scrollZoom, 100) vw`; sets CSS var `--scroll-image-width` on `#scrollContainer`. `.scroll-page img` reads this via `width: var(--scroll-image-width, 90vw)`. Persists to `localStorage` (`scrollZoom`). Calls `updateZoomControls()`.

**`updateZoomControls()`** — updates `#zoomLevel` text label; disables zoom buttons in paged mode.

Zoom buttons (`#zoomOutBtn`, `#zoomInBtn`) are disabled with `.disabled` styling when `readingMode === 'paged'`.

---

### Commit 5 — `feat(reader): smart gap removal — canvas whitespace detection`

**Source:** DHLKeyuser cursor branch  
**Files:** `assets/js/script.js`, `assets/css/styles.css`

**`analyzeWhitespace(img, index)`** — called on each scroll-mode image's `load` event:
- Creates an offscreen canvas (120×10px)
- Samples a 20px strip from the top edge of the image → `topWhite`
- Samples a 20px strip from the bottom edge → `bottomWhite`
- `isStripWhite()` counts pixels with R, G, B all > 240; returns `true` if >92% are white
- Stores result in `scrollEdgeData[index] = { topWhite, bottomWhite }`
- Calls `updateSmartGapAt(index)` for the page and its neighbours

**`updateSmartGapAt(index)`** — if smart gap is enabled, checks if `scrollEdgeData[index].bottomWhite && scrollEdgeData[index+1].topWhite`; if so, adds `.scroll-page--tight` to page `index` (reduces `margin-bottom` to 6px in webtoon mode, 0 in full-strip mode).

**`applySmartGapState()`** — re-evaluates all pages when the toggle changes; called on `#smartGapToggle` change event.

**New CSS:** `.scroll-page--tight`, `#output.scroll-mode .scroll-page--tight`

---

### Commit 6 — `feat(reader): mode toggle, page indicator, restart, keyboard nav`

**Source:** DHLKeyuser cursor branch  
**Files:** `index.html`, `assets/js/script.js`, `assets/css/styles.css`

**`setReadingMode(mode)`** — guards against no-op; sets `readingMode`; persists to `localStorage` (`readerMode`); calls `applyReadingMode(true)`.

**Mode is restored** from `localStorage` on page load. Clamped to `'scroll' | 'paged'`.

**`updateModeButtons()`** — toggles `.active` class and `aria-pressed` on `.mode-btn[data-reading-mode]` elements.

**`updatePageIndicator()`** — writes `"N / total"` to `#pageIndicator` (toolbar) and `#dockPageIndicator` (dock).

**`restartComic()`** — resets `currentPageIndex` and `currentScrollIdx` to 0; scrolls to top or renders page 0.

**Keyboard nav (`handleKeydown`)** bound to `document` `keydown`:
- Guards: `outputEl` must be visible; focus not in text input; lightbox not open
- `ArrowLeft` → `goToRelativePage(-1)`
- `ArrowRight` → `goToRelativePage(1)`
- `event.preventDefault()` called to suppress browser scroll on arrow keys

**New HTML:** `#readerToolbar` with `.mode-toggle`, `.mode-btn`, `#prevPageBtn`, `#nextPageBtn`, `#pageIndicator`, `#zoomOutBtn`, `#zoomInBtn`, `#zoomLevel`, `#smartGapToggle`, `#restartChapterBtn`

**New CSS:** `.reader-toolbar`, `.reader-toolbar-group`, `.toolbar-label`, `.mode-toggle`, `.mode-btn`, `.mode-btn.active`, `.reader-btn`, `.page-indicator`, `.zoom-level`, `.smart-gap-toggle`

---

### Commit 7 — `feat(archive): port naturalCompare for correct numeric page ordering`

**Source:** DHLKeyuser cursor branch  
**Files:** `assets/js/script.js`

Replaced `String.localeCompare()` sort with DHLKeyuser's `naturalCompare(a, b)`:

```js
// Splits each name into numeric and non-numeric chunks, compares numerically
// where both chunks are digits — so "page10" sorts after "page9".
const ax = String(a).toLowerCase().match(/\d+|\D+/g) || [];
const bx = String(b).toLowerCase().match(/\d+|\D+/g) || [];
```

This handles edge cases that `localeCompare({ numeric: true })` can miss on some locale configurations (e.g. filenames mixing scripts).

---

### Commit 8 — `feat(large-file): chunked FileReader, 64 MiB slices, byte progress bar`

**Files:** `assets/js/script.js`, `index.html`, `assets/css/styles.css`

**`readFileChunked(file, onComplete, onProgress)`:**
- Files ≤ 100 MB: `archiveOpenFile()` single-read fast path (callback API, works for all formats)
- Files > 100 MB: reads in 64 MiB slices via `file.slice(offset, end)` + `FileReader.readAsArrayBuffer`
- `setTimeout(next, 0)` between chunks to keep UI responsive
- Assembles all chunks into one `Uint8Array` before passing to `archiveOpenArrayBuffer()`
- `archiveOpenArrayBuffer()` returns a Promise for ZIP (JSZip 3.x), plain object for RAR/TAR — both handled

**`onProgress(bytesRead, total)` callback:**
- Updates `#chunkBar` width (`width: pct%`)
- Updates `#chunkLabel` text (`Loading X MB / Y MB (Z%)`)

**`#chunkProgress`** shown only for files > 100 MB. `#fileSizeWarning` amber banner shown immediately on file selection before reading begins.

**New HTML:** `#chunkProgress`, `#chunkBar`, `#chunkLabel`, `#fileSizeWarning`

**New CSS:** `.chunk-progress`, `.chunk-bar-wrap`, `.chunk-bar`, `.chunk-label`, `.file-size-warning`

---

### Commit 9 — `fix(security): XSS, file validation, blob URL tracking`

**Files:** `assets/js/script.js`

**XSS — no innerHTML with user-controlled data:**
- Archive filename written via `readerMetaEl.textContent` only
- Error messages written via `span.textContent` only — no template literals with user input
- `[SEC]` comments mark every location

**`validateFile(file)`:**
- Extension must be in `ALLOWED_EXT` Set (`.cbr`, `.cbz`, `.cbt`)
- File size must be ≤ `MAX_FILE_BYTES` (1 GB)
- Called in Dropzone `addedfile` handler before `openComic()` is called

**Blob URL tracking:**
- `activeBlobURLs` Set tracks every URL created by `URL.createObjectURL()`
- `revokeAllBlobs()` iterates the Set and revokes all; called at the start of every `openComic()` call
- Prevents blob URL accumulation across multiple comic opens in the same session

---

### Commit 10 — `fix(deps): vendor Dropzone, upgrade lightGallery and JSZip`

**Files:** `index.html`, `assets/js/vendor/dropzone.min.js` *(new)*, `assets/js/vendor/dropzone.min.css` *(new)*

**Dropzone — vendored locally:**
Dropzone 6.x changed its dist layout to ESM-first; both `unpkg.com` and `jsdelivr.net` served the file as `Content-Type: text/plain`. With `X-Content-Type-Options: nosniff` active the browser blocked it, producing:
```
MIME type mismatch — resource blocked
Cross-Origin Request Blocked
Uncaught ReferenceError: Dropzone is not defined
```
Vendored locally as `assets/js/vendor/dropzone.min.js` — served from same origin, correct MIME guaranteed, zero CDN dependency.

`Dropzone.autoDiscover = false` now set **unconditionally** before `new Dropzone()`. The previous `if (window.Dropzone)` guard sometimes ran before the script was evaluated.

**lightGallery 1.4.0 → 2.7.2 (CDN):**
- v1 abandoned 2019; known XSS in plugin callback APIs
- v2 UMD bundle from `cdn.jsdelivr.net/npm/lightgallery@2.7.2/` — correct MIME, active maintenance
- Init API changed: `lightGallery(el, opts)` → `window.lightGallery(el, { plugins: [...], ... })`
- Event name changed: `onAfterSlide` → `lgAfterSlide`

**JSZip bundled 2.x → CDN 3.10.1:**
- 2.x had no path-traversal protection on ZIP entry names
- 3.x uses async Promise API throughout
- `uncompress.js` patched: `new JSZip(buf)` → `JSZip.loadAsync(buf)`, `.asArrayBuffer()` → `.async('arraybuffer')`

---

### Commit 11 — `fix(css): remove float:center, fix output layout; fix CSP meta`

**Files:** `assets/css/styles.css`, `index.html`

**CSS — `float: center` removed:**  
`float: center` is not a valid CSS value. Firefox logged:
```
Error in parsing value for 'float'. Declaration dropped.
```
on every page load. Removed from `.imgUrl`; `#output` now uses standard block/flex layout appropriate to the mode.

**CSP meta — `frame-ancestors` removed:**  
`frame-ancestors` is a fetch directive that browsers have never honoured in `<meta>` CSP elements. It was generating a console warning on every page load. Moved to the HTTP `_headers` file only, where it is correctly enforced by Cloudflare Pages.

**`'unsafe-eval'` removed from `script-src`:**  
Was previously included for the old asm.js JSZip 2.x path. JSZip 3.x does not use `eval()`, so the directive is no longer required.

---

### Commit 12 — `chore: Cloudflare Pages config, SBOM, security docs`

**Files:** `_headers` *(new)*, `_redirects` *(new)*, `wrangler.toml` *(new)*, `package.json` *(new)*, `sbom.json` *(new)*, `SECURITY.md` *(new)*

**`_headers`** — HTTP security headers at Cloudflare edge:
- `Content-Security-Policy`: scripts `'self'` + `cdn.jsdelivr.net`; styles same + `'unsafe-inline'`; `frame-ancestors 'none'` (HTTP header only)
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — disables unused APIs
- `Strict-Transport-Security` — 1-year max-age + preload
- `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy`

**`_redirects`** — `/* /index.html 200` SPA catch-all

**`wrangler.toml`** — project name `web-comic-reader`, publish `.`

**`package.json`** — `npm run dev` (HTTP), `npm run dev:https` (mkcert HTTPS), `npm run deploy` (Wrangler)

**`sbom.json`** — CycloneDX 1.5 SBOM listing all runtime dependencies with version, licence, CDN source, and upgrade rationale

**`SECURITY.md`** — disclosure policy, all applied fixes with before/after examples, residual risk register (libunrar.js age, `unsafe-inline` requirement, localStorage limits)

---

## [2.0.0 / 2.1.0] — Incorporated into 2.2.0

The dependency upgrades, JSZip 3.x `uncompress.js` patch, CSP infrastructure, and initial security work from v2.0.0 and v2.1.0 are all present in the v2.2.0 commits above.

---

## [1.x] — Original

Original release by [@afzafri](https://github.com/afzafri). See upstream repo for history.
