# Changelog

Fork of [afzafri/Web-Comic-Reader](https://github.com/afzafri/Web-Comic-Reader).

---

## Source verification

| Source | Ref | How confirmed |
|--------|-----|---------------|
| afzafri/Web-Comic-Reader | `master` | Uploaded zip — MD5 checksums confirmed |
| DHLKeyuser/Web-Comic-Reader | `cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26` | Uploaded zip — working-tree diff confirmed against upstream |

---

## [2.2.3] — Toolbar/dock always visible; matches DHLKeyuser live site

### Commit 1 — `fix(dock): toolbar always visible as fixed bottom bar`

**Files:** `index.html`, `assets/js/script.js`, `assets/css/styles.css`

**Problem:** The toolbar was hidden inside a collapsible dock content area that
started collapsed. Once the user scrolled, the dock auto-hid entirely, and
switching between paged/scroll modes lost the toolbar because the code was
moving `#readerToolbar` in and out of the DOM between `#output` and
`#webtoonDockContent`.

**Reference:** https://dhlkeyuser.github.io/Web-Comic-Reader/ — the live site
always shows a fixed bottom bar with the full toolbar visible by default.

**Fix — HTML structure:**
```
#webtoonDock  (position:fixed, bottom:0)
  .webtoon-dock-handle
    #dockPageIndicator   ← always visible: "1 / 78"
    #dockToggleBtn       ← chevron: UP = expanded, DOWN = collapsed
  #webtoonDockContent    ← expanded by default
    #readerToolbar       ← stays here permanently, never moved
      [mode toggle] [prev/next] [restart] [zoom] [smart-gap]
```

**Fix — JavaScript:**
- `#readerToolbar` is declared directly inside `#webtoonDockContent` in the HTML
  and **never moves**. Eliminated `activateWebtoonDock()` / `deactivateWebtoonDock()`
  DOM-movement functions entirely.
- `setDockCollapsed(bool, persist)` toggles `.collapsed` class and
  `dockContentEl.style.display` — no DOM movement.
- `dockCollapsed` defaults to `false` (expanded) via `localStorage`
  (`webtoonDockCollapsed`). First visit shows full toolbar.
- Removed all auto-hide-on-scroll logic. The dock only hides on
  explicit chevron click.
- `updateDockPadding()` reads `webtoonDockEl.getBoundingClientRect().height`
  and sets `--dock-height` CSS var + `paddingBottom` on both
  `#pagedContainer` and `#scrollContainer` so content is never obscured.

**Fix — CSS:**
- `.webtoon-dock` is `position:fixed; bottom:0; display:flex` when visible.
  No `.auto-hidden` class, no `transform: translateY(100%)` transition.
- `.webtoon-dock.collapsed .webtoon-dock-content { display:none }` —
  only the toolbar content hides, the handle strip always shows.
- `.dock-toggle-icon` rotates 180° when collapsed (chevron points down).
- `body` and `#output` use `calc(var(--dock-height) + Npx)` for bottom
  padding so the dock never covers readable content.

---

### Commit 2 — `fix(cache): bump to ?v=2.2.3 to evict stale assets`

**File:** `index.html`

All five local asset references updated to `?v=2.2.3`. Required because the
server at `comic.insecure.co.nz` was caching previous versions of
`script.js` and `styles.css`, causing old code to run despite new deploys.

**After deploying:** manually purge server/CDN cache
(Cloudflare → Caching → Purge Everything).

---

## [2.2.2] — Bug fixes: file drop, stale asset cache

### Commit 3 — `fix(drop): document-level dragover/drop preventDefault`

**File:** `assets/js/vendor/dropzone.min.js`
**Error fixed:** *"The page doesn't allow files to be dropped"*

The browser intercepts drag events at the document level before they reach
the zone element. Our minimal Dropzone only attached listeners to the zone
element itself. Added:

```js
document.addEventListener('dragover', function(e) { e.preventDefault(); });
document.addEventListener('drop',     function(e) { e.preventDefault(); });
```

---

### Commit 4 — `fix(cache): ?v=2.2.2 cache-buster + Cache-Control headers`

**Files:** `index.html`, `_headers`

Added `Cache-Control: no-cache, must-revalidate` for all `/assets/*` paths
in `_headers`. Bumped query-string version on all local asset references.

---

## [2.2.1] — Bug fixes: ZIP loading, CSS vendor warnings

### Commit 5 — `fix(uncompress): archiveOpenFile ZIP Promise passed to callback`

**File:** `assets/js/uncompress/uncompress.js`
**Symptom:** `.cbz` files silently produced no pages.

`archiveOpenArrayBuffer()` returns a `Promise` for ZIP (JSZip 3.x async).
`archiveOpenFile()` was passing that Promise directly to `cb(archive, null)`.
`processArchive()` then called `.entries` on a Promise object → `undefined`
→ `totalPages = 0` → nothing rendered, no error thrown.

```js
// BROKEN
var archive = archiveOpenArrayBuffer(file_name, array_buffer);
cb(archive, null);   // archive is a Promise for .cbz files

// FIXED
var result = archiveOpenArrayBuffer(file_name, array_buffer);
if (result && typeof result.then === 'function') {
    result.then(function(a) { cb(a, null); }).catch(function(e) { cb(null, e); });
} else {
    cb(result, null);
}
```

---

### Commit 6 — `fix(css): remove obsolete vendor prefixes from dropzone.min.css`

**File:** `assets/js/vendor/dropzone.min.css`
**Errors fixed:**
```
Unknown property '-moz-border-radius'. Declaration dropped.
```
Stripped `-moz-border-radius`, `-webkit-transition`, `-moz-transition`,
`@-ms-keyframes`. No visual change; standard equivalents retained.

---

## [2.2.0] — Reader engine merge from DHLKeyuser fork

### Commit 7 — `feat(reader): paged + webtoon/scroll dual reading modes`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch
**Files:** `index.html`, `assets/js/script.js`, `assets/css/styles.css`

- **Paged mode:** `renderPagedImage(index)` — one full-width image in
  `#pagedContainer`. Click opens lightGallery.
- **Scroll mode:** `buildScrollPages()` — continuous vertical strip in
  `#scrollContainer`. `IntersectionObserver` lazy-loads images (800px margin).
  Second observer tracks visibility → live page indicator.
- `setReadingMode(mode)` persists to `localStorage` (`readerMode`).
- `←` / `→` keyboard navigation via `handleKeydown()`.

---

### Commit 8 — `feat(reader): scroll zoom, smart gap, naturalCompare`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch

- **Zoom:** `adjustScrollZoom(±0.1)` — clamps `[0.1, 2.0]`, sets
  `--scroll-image-width` CSS var. Persisted to `localStorage`.
- **Smart gap:** `analyzeWhitespace()` canvas-samples 20px strips at
  page edges. If both touching edges are >92% white pixels, adds
  `.scroll-page--tight` (tighter margin between pages).
- **`naturalCompare(a, b)`** — chunk-based numeric sort so `page10`
  sorts after `page9`.

---

### Commit 9 — `feat(large-file): chunked read up to 1 GB, byte progress bar`

**Files:** `assets/js/script.js`, `index.html`, `assets/css/styles.css`

`readFileChunked()` reads files > 100 MB in 64 MiB slices, yielding to
the browser between chunks. `onProgress` drives `#chunkBar`. Hard cap at
1 GB enforced in `validateFile()` before any parsing begins.

---

### Commit 10 — `fix(security): XSS, file validation, blob URL tracking`

- All user-supplied strings written via `textContent` only.
- `validateFile()` checks extension allowlist + 1 GB cap.
- `activeBlobURLs` Set tracks all `createObjectURL()` calls;
  `revokeAllBlobs()` on every `openComic()`.

---

### Commit 11 — `fix(deps): vendor Dropzone, lightGallery 2.7.2, JSZip 3.10.1`

- Dropzone 6.x CDN served wrong MIME type → vendored locally.
- `Dropzone.autoDiscover = false` set unconditionally before `new Dropzone()`.
- lightGallery 1.4 → 2.7.2: `window.lightGallery()`, plugins array,
  `lgAfterSlide` event name.
- JSZip 2.x → 3.10.1: `_zipOpen` async, entry `.async('arraybuffer')`.

---

### Commit 12 — `fix(csp): remove frame-ancestors + unsafe-eval from meta CSP`

`frame-ancestors` ignored in `<meta>` tags — moved to `_headers` only.
`'unsafe-eval'` not needed with JSZip 3.x; removed.

---

### Commit 13 — `chore: Cloudflare Pages config, SBOM, SECURITY.md`

`_headers` (CSP + HSTS + security headers), `_redirects` (SPA routing),
`wrangler.toml`, `package.json`, `sbom.json` (CycloneDX 1.5), `SECURITY.md`.

---

## [1.x] — Original

Original release by [@afzafri](https://github.com/afzafri/Web-Comic-Reader).
