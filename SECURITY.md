# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x     | ✅ Yes    |
| 1.x     | ❌ No     |

## Reporting a Vulnerability

Please open a **private** GitHub Security Advisory rather than a public issue.  
Response target: 48 hours for acknowledgement, 14 days for a fix or mitigation.

---

## Security Hardening Applied in v2.0.0

### 1. Cross-Site Scripting (XSS) — Fixed

**Original risk:** `script.js` used `innerHTML` to render user-supplied filenames
into the DOM in multiple places, e.g.:

```js
// BEFORE (vulnerable)
item.innerHTML = `<div class="recent-comic-name">${filename}</div>`;
```

A maliciously crafted filename such as `<img src=x onerror=alert(1)>.cbz`
stored in localStorage could execute arbitrary JavaScript on next load.

**Fix:** All user-controlled strings are now written via `textContent` or
explicit DOM API calls.  No user data is ever interpolated into HTML strings.

---

### 2. localStorage Injection — Fixed

**Original risk:** The reading history object from `localStorage` was consumed
without validation.  A rogue origin or XSS payload could poison `thumbnail`
with a `javascript:` URI or an oversized data blob.

**Fix:** `safeReadHistory()` validates every field:
- `thumbnail` must match `/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/`
- `last_page` is coerced to a safe non-negative integer
- `timestamp` is coerced to a number
- Any entry that fails validation is silently dropped

---

### 3. Supply-Chain / Dependency Pinning — Fixed

**Original risk:** CDN imports used floating or unversioned URLs:
```html
<script src="https://unpkg.com/dropzone/dist/dropzone-min.js"></script>
<link href="https://unpkg.com/dropzone/dist/dropzone.css">
<script src="https://cdn.jsdelivr.net/npm/lightgallery.js@1.4.0/..."></script>
```
`unpkg.com/dropzone` with no version resolves to "latest", meaning a future
breaking or malicious release would silently affect all users.

**Fix:**
- All CDN URLs now include explicit `@x.y.z` version pins
- `crossorigin="anonymous"` added to all CDN resources (prerequisite for SRI)
- A `_headers` file adds `Content-Security-Policy` at the Cloudflare edge

---

### 4. Outdated Libraries — Fixed

| Library | Old version | New version | Reason |
|---------|------------|-------------|--------|
| lightgallery | 1.4.0 (2019, no patches) | 2.7.2 | Actively maintained; v1 had several reported XSS vectors in plugin callbacks |
| jszip | 2.x (bundled) | 3.10.1 CDN | v3 validates ZIP entry names to prevent path-traversal |
| dropzone | floating latest | 6.0.0 pinned | Eliminates floating-version supply-chain risk |

---

### 5. File Validation — Added

**Original risk:** Any file dropped on the zone was passed directly to
`archiveOpenFile()` with no extension or size check.

**Fix:** `validateFile()` enforces:
- Extension must be one of `.cbr`, `.cbz`, `.cbt`
- File size must be ≤ 1 GB
- Files are checked _before_ any archive parsing begins

---

### 6. Content Security Policy — Added

A strict CSP is applied at two layers:
1. `<meta http-equiv="Content-Security-Policy">` in `index.html`
2. `_headers` file served by Cloudflare Pages (takes precedence)

The policy:
- Restricts scripts to `'self'` and `cdn.jsdelivr.net`
- Blocks `frame-ancestors` (clickjacking protection)
- Restricts `base-uri` and `form-action` to `'self'`

---

### 7. Blob URL Leaks — Fixed

**Original risk:** `URL.createObjectURL()` was called for every page image but
`URL.revokeObjectURL()` was only called via `clearBlobs()` on the _next_ comic
open.  For a 200-page comic this held ~200 live blob URLs in memory indefinitely.

**Fix:** Each image's blob URL is tracked in `activeBlobURLs` (a `Set`) and
revoked in the image's `onload`/`onerror` handler, immediately freeing memory.
`revokeAllBlobs()` is called as a safety net when opening a new comic.

---

## Residual / Known Risks

| Risk | Severity | Notes |
|------|----------|-------|
| `libunrar.js` is an old Emscripten build (~2015) | Medium | No known CVEs but not updated. RAR5 not supported. Evaluate `libarchive.wasm` as a replacement. |
| `unsafe-eval` in CSP | Low | Required by Emscripten-compiled `libunrar.js`. Removing it would break RAR support. Replacing with a modern WASM build should allow `unsafe-eval` to be removed. |
| `unsafe-inline` styles | Low | Required by Dropzone 6 which injects inline styles. |
| localStorage size limits | Info | Thumbnails are stored as base64 JPEG. With many comics these can grow large. A quota guard is recommended. |
| No integrity on local scripts | Info | `uncompress.js`, `libunrar.js`, `script.js` are served from the same origin, so SRI is not required but could be added as extra hardening via a build step. |

---

## Recommended Future Improvements

1. **Replace `libunrar.js`** with a maintained WASM port (e.g. `libarchive.wasm`) to
   eliminate `unsafe-eval` from the CSP and gain RAR5 support.
2. **Add SRI hashes** to local scripts via a CI build step (`scripts/generate-sri.js`).
3. **Throttle localStorage writes** — currently every page-turn triggers a write.
   Debounce with a 500ms delay to reduce I/O.
4. **Service Worker** — cache the app shell for fully offline PWA experience.
