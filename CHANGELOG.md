# Changelog

Fork of [afzafri/Web-Comic-Reader](https://github.com/afzafri/Web-Comic-Reader).

---

## Source verification

| Source | Ref | How confirmed |
|--------|-----|---------------|
| afzafri/Web-Comic-Reader | `master` | Uploaded zip — MD5 checksums confirmed |
| DHLKeyuser/Web-Comic-Reader | `cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26` | Uploaded zip — git pack truncated (large binary deleted before export); working-tree files intact; diff confirmed against upstream |

---

## [2.2.2] — Bug fixes: file drop, stale asset cache

### Commit 1 — `fix(drop): prevent browser intercepting file drops outside drop zone`

**File:** `assets/js/vendor/dropzone.min.js`  
**Error fixed:** *"The page doesn't allow files to be dropped"*

The browser natively intercepts drag-and-drop events at the document level. When a file is dragged anywhere over the page (even slightly outside the `#dropzone` element), the browser shows a "not allowed" cursor and the `drop` event never reaches the zone element.

Our minimal vendored Dropzone only attached `dragover`/`drop` listeners to the zone element itself — nothing prevented the browser from consuming the event first.

**Fix:** Added document-level listeners that call `e.preventDefault()` unconditionally:

```js
// BEFORE — browser intercepts drops outside the zone element
el.addEventListener('dragover', function(e) { e.preventDefault(); ... });

// AFTER — document-level prevention added
document.addEventListener('dragover', function(e) { e.preventDefault(); });
document.addEventListener('drop',     function(e) { e.preventDefault(); });
```

This is standard Dropzone behaviour that the original full Dropzone library always included. Our minimal re-implementation was missing it.

---

### Commit 2 — `fix(cache): bump asset version to ?v=2.2.2 to force stale file eviction`

**File:** `index.html`  
**Error fixed:** `Uncaught TypeError: can't access property "style", browserNoticeEl is null`

The server at `comic.insecure.co.nz` was serving a **cached previous version** of `assets/js/script.js` that still contained the full library UI code (`browserNoticeEl`, `selectFolderBtn`, `isLibraryMode`, `indexedDB` etc.). Our current `script.js` has zero references to any of those elements.

The `?v=2.2.1` cache-buster added in the previous release was not sufficient because the `index.html` file itself was also cached by the server/CDN, so browsers were still loading the old HTML pointing to old script URLs.

**Fix:** Version bumped to `?v=2.2.2` on all five local asset references:

```html
<script src="./assets/js/script.js?v=2.2.2">
<script src="./assets/js/vendor/dropzone.min.js?v=2.2.2">
<script src="./assets/js/uncompress/uncompress.js?v=2.2.2">
<link href="./assets/css/styles.css?v=2.2.2">
<link href="./assets/js/vendor/dropzone.min.css?v=2.2.2">
```

**Deploy instruction:** After uploading, also do a hard-clear of any server-side cache (Cloudflare → Caching → Purge Everything, or equivalent). The `_headers` file already sets `Cache-Control: no-cache, must-revalidate` for all assets on future requests.

---

### Commit 3 — `docs: changelog updated to include all bug fixes (this release)`

**File:** `CHANGELOG.md`  
Bug fixes in v2.2.1 and v2.2.2 were not previously reflected in the changelog. All fixes now documented with error text, root cause, before/after code, and deploy instructions.

---

## [2.2.1] — Bug fixes: ZIP archive, CSS cache, vendor prefix warnings

### Commit 4 — `fix(uncompress): archiveOpenFile passes Promise to callback for ZIP files`

**File:** `assets/js/uncompress/uncompress.js`  
**Symptom:** Comics did not load at all. No pages appeared, no error shown. Affected `.cbz` files on the fast path (files under 100 MB).

**Root cause:** JSZip 3.x made `_zipOpen()` async — it returns a Promise. `archiveOpenArrayBuffer()` correctly returns that Promise for ZIP files. But `archiveOpenFile()` passed that Promise directly to its callback:

```js
// BROKEN — `archive` is a Promise for .cbz files, not an archive object
var archive = archiveOpenArrayBuffer(file_name, array_buffer);
cb(archive, null);
```

`processArchive(archive)` then called `archive.entries` on a Promise — `undefined` — so `totalPages` was 0, nothing rendered, no error was thrown.

**Fix:**
```js
var result = archiveOpenArrayBuffer(file_name, array_buffer);
if (result && typeof result.then === 'function') {
    // ZIP — async path
    result.then(function(archive) { cb(archive, null); })
          .catch(function(e)      { cb(null, e);       });
} else {
    // RAR / TAR — synchronous path unchanged
    cb(result, null);
}
```

---

### Commit 5 — `fix(css): remove obsolete vendor prefixes from vendored Dropzone CSS`

**File:** `assets/js/vendor/dropzone.min.css`  
**Errors fixed:**
```
Unknown property '-moz-border-radius'. Declaration dropped.
```

The original vendored Dropzone CSS included `-moz-border-radius`, `-webkit-transition`, `-moz-transition` and `@-ms-keyframes` — all now unsupported by modern Firefox and logged as console errors on every page load. Stripped all obsolete vendor-prefixed declarations. No visual change; standard `border-radius`, `transition`, and `@keyframes` equivalents retained.

---

### Commit 6 — `fix(headers): add Cache-Control: no-cache for all assets`

**File:** `_headers`  
Added `Cache-Control: no-cache, must-revalidate` for `/assets/*`, `/*.js`, and `/*.css` paths on Cloudflare Pages. Prevents the server from silently serving stale versions of JavaScript and CSS files after a deploy.

---

### Commit 7 — `fix(csp): clarify gaoptout.js inline script CSP error is a browser extension`

**File:** `SECURITY.md` (note added to residual risks)  
**Error:** `Content-Security-Policy: blocked inline script … sha256-bssP8X0oAC6Tk4oEJzOvwLXvyXOdb35tWD5iPU8q3lI=`

This SHA-256 hash corresponds to an inline script injected by the **Google Analytics Opt-out browser extension** (`gaoptout.js`). It is not produced by any code in this repository. Our `index.html` contains zero inline `<script>` blocks — confirmed by grep. The CSP correctly blocks the extension's injection; this is expected behaviour and cannot be resolved without weakening the policy for all users.

**Not a bug in this codebase. Do not add `'unsafe-inline'` to `script-src` to suppress it.**

---

## [2.2.0] — Reader engine merge from DHLKeyuser fork

### Commit 8 — `feat(reader): paged mode — single-image view with lightbox`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch  
**Files:** `index.html`, `assets/js/script.js`, `assets/css/styles.css`

One full-width image at a time in `#pagedContainer`. `renderPagedImage(index)` updates `#pagedImage.src`. Click opens lightGallery at that page via hidden `#lightboxLinks` anchor pool. Prev/Next buttons + `←` / `→` keyboard shortcuts.

**New elements:** `#pagedContainer`, `#pagedImageLink`, `#pagedImage`, `#lightboxLinks`  
**New CSS:** `.paged-container`, `.paged-image-link`, `.paged-image`, `.lightbox-links`

---

### Commit 9 — `feat(reader): webtoon/scroll mode — continuous vertical strip with lazy loading`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch  
**Files:** `assets/js/script.js`, `assets/css/styles.css`

All pages rendered as a continuous vertical strip in `#scrollContainer`. Images use `data-src` for deferred decoding via `IntersectionObserver` (800px root margin). Second observer tracks page visibility to drive the live page indicator. `#output.scroll-mode` applies full-width layout, no card border.

**New element:** `#scrollContainer`  
**New CSS:** `.scroll-container`, `.scroll-page`, `#output.scroll-mode`

---

### Commit 10 — `feat(reader): webtoon dock — fixed bottom bar, auto-hide, tap-to-toggle`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch  
**Files:** `index.html`, `assets/js/script.js`, `assets/css/styles.css`

Fixed bottom bar active only in scroll mode. `activateWebtoonDock()` moves `#readerToolbar` into `#webtoonDockContent`. `updateDockPadding()` sets `paddingBottom` on `#scrollContainer` so content is never hidden behind the dock. Auto-hides on scroll-down (`|delta| >= 6px`), reappears on scroll-up. Tap centre 50% of strip to toggle.

**New elements:** `#webtoonDock`, `#webtoonDockContent`, `#dockToggleBtn`, `#dockPageIndicator`  
**New CSS:** `.webtoon-dock`, `.webtoon-dock.collapsed`, `.webtoon-dock.auto-hidden`, `.dock-toggle-btn`, `.dock-toggle-icon`

---

### Commit 11 — `feat(reader): scroll zoom — +/− controls, 10–200%, persisted`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch  
**Files:** `assets/js/script.js`

`adjustScrollZoom(delta)` clamps `scrollZoom` to `[0.1, 2.0]`. `applyScrollZoom()` sets CSS var `--scroll-image-width` on `#scrollContainer`. Zoom persisted to `localStorage` (`scrollZoom`). Zoom buttons disabled in paged mode.

---

### Commit 12 — `feat(reader): smart gap removal — canvas whitespace detection`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch  
**Files:** `assets/js/script.js`, `assets/css/styles.css`

On each scroll-mode image `load` event, `analyzeWhitespace()` samples a 20px strip at the top and bottom edge via canvas. If >92% of pixels have RGB > 240 (near-white), the edge is marked white. If both touching edges of adjacent pages are white, `.scroll-page--tight` is applied (tighter margin). `applySmartGapState()` re-evaluates all pages on toggle change.

**New CSS:** `.scroll-page--tight`

---

### Commit 13 — `feat(reader): mode toggle, page indicator, restart, keyboard nav`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch  
**Files:** `index.html`, `assets/js/script.js`, `assets/css/styles.css`

`setReadingMode(mode)` persists to `localStorage` (`readerMode`); mode restored on load. `updatePageIndicator()` syncs both `#pageIndicator` (toolbar) and `#dockPageIndicator` (dock). `restartComic()` resets indices to 0. `handleKeydown()` maps `←`/`→` to `goToRelativePage(±1)`.

**New HTML:** `#readerToolbar` with all controls  
**New CSS:** `.reader-toolbar`, `.mode-toggle`, `.mode-btn.active`, `.reader-btn`, `.page-indicator`

---

### Commit 14 — `feat(archive): naturalCompare — chunk-based numeric page sort`

**Source:** DHLKeyuser/Web-Comic-Reader cursor branch  
**Files:** `assets/js/script.js`

Splits filenames into numeric/non-numeric chunks; compares numerically where both chunks are digits. Fixes page ordering for archives where `page10` was sorted before `page2` by lexicographic comparison.

---

### Commit 15 — `feat(large-file): chunked FileReader, byte progress bar, 1 GB support`

**Files:** `assets/js/script.js`, `index.html`, `assets/css/styles.css`

`readFileChunked()` reads files > 100 MB in 64 MiB slices. `onProgress` callback drives `#chunkBar` width and `#chunkLabel` text. Files ≤ 100 MB use `archiveOpenFile()` single-read fast path. Hard cap at 1 GB enforced in `validateFile()`.

**New HTML:** `#chunkProgress`, `#chunkBar`, `#chunkLabel`, `#fileSizeWarning`  
**New CSS:** `.chunk-progress`, `.chunk-bar-wrap`, `.chunk-bar`, `.chunk-label`, `.file-size-warning`

---

### Commit 16 — `fix(security): XSS prevention, file validation, blob URL tracking`

**Files:** `assets/js/script.js`

All user-controlled strings (archive filenames, error messages) written via `textContent` only — never interpolated into `innerHTML`. `validateFile()` enforces extension allowlist and 1 GB cap before any archive parsing. `activeBlobURLs` Set tracks all `createObjectURL()` calls; `revokeAllBlobs()` called on every `openComic()`.

---

### Commit 17 — `fix(deps): vendor Dropzone, upgrade lightGallery to v2.7.2, JSZip to 3.10.1`

**Files:** `index.html`, `assets/js/vendor/dropzone.min.js`, `assets/js/vendor/dropzone.min.css`

Dropzone 6.x CDN served as `text/plain` (wrong MIME) — blocked by `X-Content-Type-Options: nosniff`. Vendored locally. `Dropzone.autoDiscover = false` set unconditionally before `new Dropzone()`.

lightGallery 1.4.0 (abandoned 2019) → 2.7.2 UMD CDN. Init API: `lightGallery(el, opts)` → `window.lightGallery(el, { plugins:[...] })`. Event: `onAfterSlide` → `lgAfterSlide`.

JSZip bundled 2.x → CDN 3.10.1. `uncompress.js` patched: `new JSZip(buf)` → `JSZip.loadAsync(buf)`; `.asArrayBuffer()` → `.async('arraybuffer')`.

---

### Commit 18 — `fix(css): float:center invalid value removed; output uses flexbox`

**Files:** `assets/css/styles.css`

`float: center` is not a valid CSS value. Firefox logged `"Error in parsing value for 'float'. Declaration dropped."` on every page load. Removed from `.imgUrl`; `#output` uses block/flex layout by mode.

---

### Commit 19 — `fix(csp): remove frame-ancestors and unsafe-eval from meta CSP tag`

**Files:** `index.html`

`frame-ancestors` is ignored by all browsers in `<meta>` CSP — only valid as an HTTP response header. `'unsafe-eval'` was no longer needed after JSZip 3.x removed the asm.js path. Both removed from the meta tag. `frame-ancestors 'none'` retained in `_headers` where it is correctly enforced.

---

### Commit 20 — `chore: Cloudflare Pages config, SBOM, SECURITY.md`

**Files:** `_headers`, `_redirects`, `wrangler.toml`, `package.json`, `sbom.json`, `SECURITY.md`

`_headers` — full HTTP security header set including CSP, HSTS, X-Frame-Options, Permissions-Policy, CORP/COOP/COEP. `_redirects` — SPA catch-all. CycloneDX 1.5 SBOM. Security policy with residual risks (libunrar.js asm.js, unsafe-inline for Dropzone inline styles).

---

## [1.x] — Original

Original release by [@afzafri](https://github.com/afzafri/Web-Comic-Reader). See upstream repo for history.
