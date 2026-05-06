# Changelog

Fork of [afzafri/Web-Comic-Reader](https://github.com/afzafri/Web-Comic-Reader).

---

## Source verification

| Source | Ref | How confirmed |
|--------|-----|---------------|
| afzafri/Web-Comic-Reader | `master` | Uploaded zip — MD5 checksums confirmed |
| DHLKeyuser/Web-Comic-Reader | `cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26` | Uploaded zip — working-tree diff confirmed against upstream |

---

## [2.3.0] — Security hardening: SRI, libarchive-wasm, CSP tightening

### Change 1 — `fix(security): add SRI hashes to all CDN resources`

**File:** `index.html`

All eight CDN resources (lightGallery CSS, six lightGallery JS plugins) now carry
`integrity="sha384-…"` attributes. The browser will refuse to execute or apply any
CDN resource whose content does not match the pinned hash, protecting against CDN
compromise and supply-chain attacks.

CDN script URLs changed from `.umd.min.js` → `.umd.js` to match exact filenames in
the npm package (required for SRI hashes to match what the CDN actually serves).

---

### Change 2 — `fix(deps): replace libunrar.js with libarchive-wasm@1.2.0`

**Files:** `assets/js/uncompress/uncompress.js` (rewritten), `index.html`,
`assets/js/uncompress/libarchive.js` (new), `assets/js/uncompress/libarchive.wasm` (new),
`assets/js/uncompress/ArchiveReader.js` (new), `assets/js/uncompress/ArchiveReaderEntry.js` (new),
`assets/js/uncompress/libarchiveWasm.js` (new), `assets/js/uncompress/wrapLibarchiveWasm.js` (new)

**Removed:** `libunrar.js` (807 KB, ~2015 Emscripten build), `libunrar.js.mem` (62 KB),
`jszip.js` (287 KB CDN local copy — ZIP now handled by libarchive-wasm)

**Why:** The old `libunrar.js` was an unmaintained ~2015 Emscripten binary. It:
- Required `'unsafe-eval'` in the CSP (Emscripten asm.js eval path)
- Did not support RAR5 archives
- Had no upstream maintenance or security patches

**libarchive-wasm@1.2.0** (MIT licence, actively maintained):
- Supports ZIP, TAR, RAR v4, RAR v5, 7z — all formats in one WASM module
- Does **not** require `'unsafe-eval'`; only `'wasm-unsafe-eval'` (narrower)
- 599 KB WASM binary — smaller than libunrar.js (807 KB) + jszip.js (287 KB) combined
- Self-hosted alongside the app (CDNs return 403 for WASM files)

**Integration:** `uncompress.js` was rewritten as a thin adapter that exposes exactly
the same public API (`archiveOpenFile`, `archiveOpenArrayBuffer`, `archiveClose`,
`isRarFile`, `isZipFile`, `isTarFile`). `script.js` is **unchanged**.

Key implementation notes:
- `loadArchiveFormats()` is now a no-op kept for API compatibility
- Entry data is read **eagerly** during archive open — libarchive requires sequential
  access and cannot seek back once the iterator advances
- `reader.free()` is called in a `finally` block to always release WASM heap memory
- Path-traversal guard (`'..'` check) retained from v2.0.0
- `_scriptBase` captured via `document.currentScript` at load time to locate
  `libarchive.wasm` — eliminates the throw/catch stack-trace hack in the old code

**JSZip removal:** `assets/js/uncompress/jszip.js` (the local copy) is removed.
The CDN JSZip script tag in `index.html` is also removed. libarchive-wasm handles
ZIP natively.

---

### Change 3 — `fix(csp): remove unsafe-eval, add wasm-unsafe-eval and connect-src blob:`

**Files:** `index.html` (meta CSP), `_headers` (edge CSP)

- `'unsafe-eval'` removed from `script-src` — no longer required now that
  libunrar.js is gone
- `'wasm-unsafe-eval'` added to `script-src` — required for `WebAssembly.compile`
  and `WebAssembly.instantiate`; strictly narrower than `'unsafe-eval'`
- `blob:` added to `connect-src` — required for `WebAssembly.instantiateStreaming`
  which fetches the `.wasm` file as a streaming `Response`

---

### Change 4 — `fix(headers): add Cache-Control for index.html and 404.html`

**File:** `_headers`

`/index.html` and `/404.html` now have explicit `Cache-Control: no-cache,
must-revalidate` headers. Previously, only `/assets/*` and `/*.js`/`/*.css`
had cache headers; a stale cached `index.html` could cause old asset URLs
(without the current `?v=` cache-buster) to be loaded.

---

### Change 5 — `fix(headers): Permissions-Policy: add screen-wake-lock, clipboard`

**File:** `_headers`

`screen-wake-lock=*` added — permits the app to call `navigator.wakeLock.request()`
to keep the screen on while reading. The API requires explicit JS invocation; allowing
it in the policy costs nothing if unused and avoids a header change if the feature
is added later.

`clipboard-read=()` and `clipboard-write=()` added — explicitly deny clipboard
access (was previously unspecified, which defaults to allow in some contexts).

---

### Change 6 — `feat: add 404.html`

**File:** `404.html` (new)

Cloudflare Pages serves `/404.html` for requests that don't match any static asset
and aren't caught by `_redirects`. The page matches the app's visual style and links
back to the reader. Has its own minimal CSP (no external resources).

---

### Change 7 — `fix(security): sanitise localStorage key from raw filename`

**File:** `assets/js/script.js`

Page-progress was saved as `localStorage.setItem('lastPage_' + filename, ...)`.
A crafted filename such as `__proto__` could shadow `Object.prototype` properties
on affected engines, and an excessively long filename would waste quota.

**Fix:** `safeStorageKey(filename)` hashes the filename using djb2 (fast, synchronous,
no external dependencies) and prefixes it with `'wcr_page_'`. The key is always
exactly 18 characters regardless of filename length or content.

---

### Change 8 — `fix(security): sanitise error messages before display`

**File:** `assets/js/script.js`

Raw exception messages from libarchive / JSZip / the FileReader could contain
internal details (library version strings, Emscripten `Aborted()` messages,
WASM runtime errors, file-system paths). These were previously passed directly
to `showError()` and displayed to the user.

**Fix:** `sanitiseErrorMessage()` allows a small allowlist of known safe
application-level messages through unchanged, strips anything that looks like
a stack trace, internal path, or WASM runtime message, and replaces unknown
errors with a generic user-facing string.

---

### Change 9 — `fix(xss): replace innerHTML with DOM API in finaliseLoad()`

**File:** `assets/js/script.js`

`progressTextEl.innerHTML = '<span style="color:#4ade80">Completed!</span>'`
was inconsistent with the project's stated `textContent`-only policy. Although
the string is a hardcoded literal (not user-controlled), it sets a bad precedent.

**Fix:** Replaced with `createElement` / `textContent` / `appendChild` — the
same pattern used everywhere else in the codebase.

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
