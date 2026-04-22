# Web Comic Reader v2.0.0

Modern web-based comic book reader for CBR, CBZ, and CBT files — runs entirely in your browser, no server required.

## What's New in v2.0.0

See [CHANGELOG.md](./CHANGELOG.md) for the full per-file commit log.

- **Large file support** — CBR/CBZ/CBT files up to **1 GB** now load reliably via chunked streaming with a visible byte-level progress bar
- **Drag & drop improved** — enhanced visual feedback on dragover; clear "drag here or click to browse" copy; large-file warning banner
- **Security hardened** — XSS fixes, localStorage sanitisation, all CDN dependencies pinned with version locks; Content Security Policy added
- **Dependencies updated** — lightgallery 1.4 → 2.7.2, jszip 2 → 3.10.1, dropzone pinned to 6.0.0
- **Cloudflare Pages ready** — `_headers`, `_redirects`, and `wrangler.toml` included; strict security headers served at the edge
- **Natural page sort** — pages now sort as 1, 2, … 10 instead of 1, 10, 2
- **AVIF/TIFF** image formats now recognised
- **SBOM** (Software Bill of Materials) in CycloneDX JSON format at `sbom.json`

---

## Features

- **Library Mode** — select your comics folder once; browser remembers access
- **Reading Progress** — last-read page saved and highlighted on reopen
- **Thumbnail Previews** — auto-generated cover thumbnails
- **Recently Read** — quick access to your 5 most recent comics
- **Quick Read Mode** — drag-drop or click-to-open, no setup needed
- **Client-Side Only** — all decompression happens in your browser; nothing is uploaded
- **Offline Capable** — works without network after first load
- **Dark Mode** — automatic via `prefers-color-scheme`

---

## Supported Formats

| Extension | Format |
|-----------|--------|
| `.cbz` | Comic Book ZIP |
| `.cbr` | Comic Book RAR (RAR4; RAR5 not yet supported) |
| `.cbt` | Comic Book TAR |

---

## Deployment

### Cloudflare Pages (recommended)

1. Fork this repository
2. In the Cloudflare dashboard → **Pages** → **Connect to Git**
3. Select your fork; set:
   - **Build command:** *(leave blank — static site)*
   - **Build output directory:** `/`
4. Click **Save and Deploy**

The `_headers` file is automatically applied, serving all security headers. HTTPS is provided automatically by Cloudflare Pages, which enables Library Mode in supported browsers.

#### CLI deploy (Wrangler)

```bash
npm install
npm run deploy
```

---

### Local Development

```bash
# Quick start (HTTP — Quick Read only)
npm run dev           # http://localhost:8080

# HTTPS (enables Library Mode)
mkcert -install && mkcert localhost 127.0.0.1
npm run dev:https     # https://localhost:8443
```

---

## Browser Compatibility

| Browser | Library Mode | Quick Read |
|---------|-------------|------------|
| Chrome / Edge / Opera (desktop) | ✅ | ✅ |
| Firefox | ⚠️ flag only | ✅ |
| Safari / iOS | ❌ | ✅ |

---

## Project Structure

```
├── index.html              # Entry point — CDN deps pinned, CSP meta tag
├── assets/
│   ├── css/styles.css      # All styles + dark mode + v2 additions
│   └── js/
│       ├── script.js       # Main application (rewritten v2)
│       └── uncompress/     # Vendored archive libraries
├── _headers                # Cloudflare Pages security headers
├── _redirects              # Cloudflare Pages SPA routing
├── wrangler.toml           # Cloudflare deploy config
├── package.json            # Dev scripts
├── sbom.json               # CycloneDX Software Bill of Materials
├── SECURITY.md             # Disclosure policy + hardening notes
└── CHANGELOG.md            # Per-file commit changelog
```

---

## Security

See [SECURITY.md](./SECURITY.md) for the full policy, applied fixes, and residual risks.  
To report a vulnerability, open a **private** GitHub Security Advisory.

---

## Credits

- [uncompress.js](https://github.com/workhorsy/uncompress.js) — archive extraction
- [lightGallery v2](https://www.lightgalleryjs.com/) — image gallery
- [Dropzone.js](https://www.dropzone.dev/) — drag-and-drop
- [JSZip](https://stuk.github.io/jszip/) — ZIP decompression

## License

MIT — see [LICENSE](./LICENSE)
