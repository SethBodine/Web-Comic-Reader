# Changelog

All notable changes to Web Comic Reader are documented here.
Each section maps directly to a Git commit with the suggested message shown.

---

## [2.0.0] — 2025

### Suggested Git commit message for this PR

```
feat: large-file support, security hardening, Cloudflare Pages deploy, dep upgrades
```

---

### `index.html`

**Commit:** `fix(deps): pin CDN versions, add CSP meta, migrate to lightgallery v2`

| # | Type | Change |
|---|------|--------|
| 1 | security | Replaced floating `unpkg.com/dropzone` import with `cdn.jsdelivr.net/npm/dropzone@6.0.0` (pinned exact version) |
| 2 | security | Replaced `lightgallery.js@1.4.0` (abandoned 2019) and all its plugins with `lightgallery@2.7.2` UMD bundle via jsdelivr |
| 3 | security | Added `<meta http-equiv="Content-Security-Policy">` as a defence-in-depth layer alongside server-level `_headers` |
| 4 | security | Added `crossorigin="anonymous"` to all CDN `<script>` and `<link>` tags (prerequisite for future SRI enforcement) |
| 5 | deps | Replaced bundled jszip 2.x `<script>` reference with `cdn.jsdelivr.net/npm/jszip@3.10.1` |
| 6 | feature | Added upload icon SVG, `.dz-main-text`, `.dz-sub-text` elements to dropzone for clearer drag-drop UX |
| 7 | feature | Added `#fileSizeWarning` banner element (shown by JS for files > 100 MB) |
| 8 | feature | Added `#chunkProgress` / `#chunkBar` / `#chunkLabel` elements for large-file streaming progress bar |
| 9 | a11y | Added `role="status"` and `aria-live="polite"` to loading overlay; `role="main"` and `aria-label` to `#output` |
| 10 | a11y | Added `rel="noopener noreferrer"` to GitHub footer link |
| 11 | meta | Added `<meta name="description">` and `<meta name="theme-color">` |

---

### `assets/js/script.js`

**Commit:** `fix(security): XSS, localStorage sanitisation, blob URL leaks, file validation`  
**Commit:** `feat: large-file chunked streaming, lazy image loading, lightgallery v2 API, natural sort`

| # | Type | Change |
|---|------|--------|
| 1 | **security — XSS** | All `innerHTML` assignments that interpolated user-supplied filenames replaced with `textContent` / explicit DOM API calls. Affected: `buildComicItem()`, `showLibraryMode()`, error display. |
| 2 | **security — localStorage** | New `safeReadHistory()` validates every field read from `localStorage`: thumbnail must be `data:image/jpeg;base64,...` only; `last_page` coerced to safe integer; `timestamp` coerced to number. Malformed entries are silently dropped. |
| 3 | **security — file validation** | New `validateFile()` enforces extension allowlist (`.cbr`, `.cbz`, `.cbt`) and 1 GB size cap _before_ any archive parsing begins. |
| 4 | **security — blob URLs** | Blob URLs now tracked in `activeBlobURLs` Set and revoked in `img.onload` / `img.onerror`. `revokeAllBlobs()` called as safety net on comic open. Eliminates progressive memory leak in long sessions. |
| 5 | **security — IDB version bump** | IndexedDB opened at version 2; `onupgradeneeded` drops and recreates the store to clear stale handles from v1 installs. |
| 6 | **large file** | `readFileChunked()` replaces single `FileReader.readAsArrayBuffer(file.slice())` call. Files ≤ 100 MB: single read (no overhead). Files > 100 MB: 64 MiB chunks assembled into one `ArrayBuffer`, with `onProgress` callback driving the progress bar. Handles files up to 1 GB reliably. |
| 7 | **large file** | `chunkProgressEl` progress bar driven by `updateChunkBar()` during multi-chunk reads. |
| 8 | **large file** | `fileSizeWarningEl` banner shown for files > 100 MB immediately on file selection. |
| 9 | **large file** | `readContents()` changed from `Promise.all()` to sequential `for` loop. Prevents simultaneous decompression of hundreds of pages (was causing OOM crashes on large archives). |
| 10 | **deps — lightgallery v2** | `lightGallery()` call migrated from v1 global function + options object to v2 API: `window.lightGallery(el, { plugins: [...] })`. Plugin references updated (`lgZoom`, `lgFullscreen`, `lgThumbnail`, `lgAutoplay`, `lgRotate`). |
| 11 | **deps — lightgallery v2** | `onAfterSlide` event renamed to `lgAfterSlide` (v2 event name). |
| 12 | **fix — sort** | `naturalSort()` using `String.localeCompare(..., { numeric: true })` replaces `a < b` comparator. Fixes page ordering for numeric filenames (page1, page2, … page10). |
| 13 | **fix — MIME** | `getMIME()` now recognises `.avif` (`image/avif`) and `.tif`/`.tiff` (`image/tiff`). |
| 14 | **feature — drag-drop** | Dropzone configured with `clickable: true` (already default but made explicit). `dragover` / `dragleave` / `drop` events add/remove `.dz-drag-hover` class for visual feedback. |
| 15 | **a11y** | Comic page `<img>` elements now have `alt="Page N"` and `loading="lazy"` attributes. |
| 16 | **refactor** | `showError()` helper replaces repeated inline `innerHTML` error patterns; uses `textContent` internally. |
| 17 | **refactor** | `buildComicItem()` extracted as a shared helper for both recent and all-comics lists. |
| 18 | **refactor** | Constants (`MAX_FILE_BYTES`, `LARGE_FILE_THRESHOLD`, `CHUNK_SIZE`, `ALLOWED_EXTENSIONS`, `LS_KEY`, `IDB_DB`, `IDB_VER`, `IDB_STORE`) extracted to module-top. |

---

### `assets/css/styles.css`

**Commit:** `feat(styles): drag-drop UX, large-file warning banner, chunk progress bar`

| # | Type | Change |
|---|------|--------|
| 1 | feature | `.dz-message` set to `display:flex; flex-direction:column` so new child elements stack correctly |
| 2 | feature | `.dz-upload-icon` — styles upload arrow icon; colour transitions to brand on hover |
| 3 | feature | `.dz-main-text` / `.dz-sub-text` — typography for the two-line drop zone label |
| 4 | feature | `.dz-click-link` — inline button styled as a hyperlink (no chrome) |
| 5 | feature | `.dz-drag-hover` — highlights dropzone border and background when a file is dragged over |
| 6 | feature | `.file-size-warning` — amber/dark-mode-aware banner for large file notice |
| 7 | feature | `.chunk-progress`, `.chunk-bar-wrap`, `.chunk-bar`, `.chunk-label` — streaming progress bar shown during large-file reads |
| 8 | fix | `.empty-message` utility class extracted (was repeated inline styles) |

---

### `_headers` *(new file)*

**Commit:** `feat(deploy): add Cloudflare Pages security headers`

| # | Type | Change |
|---|------|--------|
| 1 | security | `Content-Security-Policy` — restricts scripts, styles, fonts, images, and connections |
| 2 | security | `X-Frame-Options: DENY` — clickjacking protection |
| 3 | security | `X-Content-Type-Options: nosniff` — MIME sniffing protection |
| 4 | security | `X-XSS-Protection: 1; mode=block` — legacy XSS filter for older browsers |
| 5 | security | `Referrer-Policy: strict-origin-when-cross-origin` |
| 6 | security | `Permissions-Policy` — disables unused browser APIs |
| 7 | security | `Strict-Transport-Security` — HSTS with 1-year max-age |
| 8 | security | `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy` |

---

### `_redirects` *(new file)*

**Commit:** `feat(deploy): add Cloudflare Pages SPA redirect rule`

Ensures all paths resolve to `index.html` with a 200 status (SPA routing support).

---

### `wrangler.toml` *(new file)*

**Commit:** `feat(deploy): add wrangler.toml for Cloudflare Pages CLI deployment`

Configures project name, publish directory, and included file patterns for `wrangler pages deploy`.

---

### `package.json` *(new file)*

**Commit:** `chore: add package.json with dev server and deploy scripts`

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local HTTP dev server on port 8080 |
| `npm run dev:https` | Local HTTPS server (requires mkcert certs) |
| `npm run deploy` | Deploy to Cloudflare Pages via Wrangler |

---

### `sbom.json` *(new file)*

**Commit:** `docs: add CycloneDX SBOM for all runtime dependencies`

Documents all runtime dependencies with version, licence, CDN source, and upgrade rationale in CycloneDX 1.5 JSON format.

---

### `SECURITY.md` *(new file)*

**Commit:** `docs: add security policy, hardening notes, and residual risk register`

---

### `README.md`

**Commit:** `docs: update README for v2 — deployment, browser support, security, project structure`

---

## [1.x] — Historical

Original release by [@afzafri](https://github.com/afzafri).  
No formal changelog maintained.
