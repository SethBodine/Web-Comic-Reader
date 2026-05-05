# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.3.x   | ✅ Yes    |
| 2.2.x   | ❌ No     |
| 1.x     | ❌ No     |

## Reporting a Vulnerability

Please open a **private** GitHub Security Advisory rather than a public issue.  
Response target: 48 hours for acknowledgement, 14 days for a fix or mitigation.

---

## Security Hardening History

### v2.3.0 — Current

#### 1. Subresource Integrity (SRI) — Added

All CDN-loaded resources now carry `integrity="sha384-…"` hashes. The browser
validates each resource's content against the pinned hash before execution.
A compromised CDN or MITM cannot inject code.

CDN URLs changed from `.umd.min.js` → `.umd.js` to match exact filenames in the
npm package (the `.umd.min.js` path was an ambiguous alias).

#### 2. libunrar.js replaced with libarchive-wasm — Fixed

**Previous risk:** `libunrar.js` was a ~2015 Emscripten asm.js build. It required
`'unsafe-eval'` in the CSP, had no upstream maintenance, and did not support RAR5.

**Fix:** Replaced with `libarchive-wasm@1.2.0` (MIT, actively maintained). The new
library is a clean WASM module that:
- Does not require `'unsafe-eval'`
- Supports RAR v4, RAR v5, ZIP, TAR, 7z
- Is 599 KB — smaller than libunrar.js (807 KB) + jszip.js (287 KB) combined
- Is self-hosted (CDNs return 403 for WASM files)

#### 3. CSP tightened — Fixed

- `'unsafe-eval'` removed from `script-src`
- `'wasm-unsafe-eval'` added — strictly narrower; permits WASM compilation only
- `blob:` added to `connect-src` — required for `WebAssembly.instantiateStreaming`
- Both layers (meta CSP + `_headers`) kept in sync

#### 4. localStorage key injection — Fixed

**Previous risk:** Page progress was saved as `'lastPage_' + filename`. A crafted
filename (`__proto__`, excessively long strings) could cause prototype shadowing
or quota exhaustion.

**Fix:** `safeStorageKey(filename)` applies a djb2 hash, producing an 18-character
fixed-length key (`wcr_page_xxxxxxxx`) regardless of filename content or length.

#### 5. Error message information disclosure — Fixed

**Previous risk:** Raw exception messages from archive libraries were displayed
directly to the user, potentially leaking library versions, internal paths, or
WASM runtime details.

**Fix:** `sanitiseErrorMessage()` passes a small allowlist of known safe
application-level messages through and replaces all others with a generic
user-facing string.

#### 6. innerHTML inconsistency — Fixed

`progressTextEl.innerHTML` in `finaliseLoad()` was a hardcoded literal (not
exploitable), but inconsistent with the project's `textContent`-only policy.
Replaced with `createElement` / `textContent` / `appendChild`.

#### 7. Cache-Control for index.html — Added

`/index.html` now has `Cache-Control: no-cache, must-revalidate`. Previously,
a stale cached `index.html` could load old asset URLs without the current
`?v=` cache-buster.

#### 8. Custom 404 page — Added

`/404.html` is now served for unmatched routes. Has its own minimal CSP.

#### 9. Permissions-Policy expanded — Updated

`screen-wake-lock=*` permits the app to call `navigator.wakeLock.request()`.
`clipboard-read=()` and `clipboard-write=()` explicitly deny clipboard access.

---

### v2.0.0

#### 1. Cross-Site Scripting (XSS) — Fixed

**Original risk:** `script.js` used `innerHTML` to render user-supplied filenames.

**Fix:** All user-controlled strings written via `textContent` or explicit DOM API.

#### 2. localStorage Injection — Fixed

**Original risk:** Reading history consumed without validation; `thumbnail` could
be a `javascript:` URI.

**Fix:** `safeReadHistory()` validates every field with strict patterns.

#### 3. Supply-Chain / Dependency Pinning — Fixed

All CDN URLs now include explicit `@x.y.z` version pins.

#### 4. Outdated Libraries — Fixed

| Library | Old | New |
|---------|-----|-----|
| lightgallery | 1.4.0 | 2.7.2 |
| jszip | 2.x | 3.10.1 (now removed; replaced by libarchive-wasm) |
| dropzone | floating | 6.0.0 pinned |

#### 5. File Validation — Added

`validateFile()` enforces extension allowlist (`.cbr`, `.cbz`, `.cbt`) and 1 GB cap.

#### 6. Content Security Policy — Added

Strict CSP at two layers: meta tag and `_headers`.

#### 7. Blob URL Leaks — Fixed

`activeBlobURLs` Set tracks all `createObjectURL()` calls; `revokeAllBlobs()`
on every `openComic()`.

---

## Residual / Known Risks

| Risk | Severity | Notes |
|------|----------|-------|
| `unsafe-inline` styles | Low | Required by Dropzone 6 injected inline styles. Mitigated by `style-src` restricting to `'self'` + trusted CDN. |
| No SRI on self-hosted scripts | Info | `uncompress.js`, `libarchive.js`, `script.js` are served from the same origin. SRI on same-origin scripts is not required by spec but could be added via a CI build step. |
| libarchive-wasm single maintainer | Info | Active, MIT-licensed, well-structured. Monitor for upstream updates. |
| localStorage page-progress quota | Info | Debounced at 300 ms. With many comics and many page turns, quota may grow. Consider adding a quota guard. |

---

## Recommended Future Improvements

1. **SRI on self-hosted scripts** — generate hashes in CI and inject into `index.html`.
2. **Service Worker** — cache the app shell for fully offline PWA experience.
3. **Screen Wake Lock** — call `navigator.wakeLock.request('screen')` when a comic
   opens (Permissions-Policy already allows it).
4. **localStorage quota guard** — prune oldest `wcr_page_*` entries when
   `localStorage.length` exceeds a threshold.
