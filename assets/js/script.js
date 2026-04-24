/**
 * Web Comic Reader — script.js  v2.2.3
 *
 * CHANGELOG
 * ─────────────────────────────────────────────────────────────────────────
 * [FIX v2.2.3] Toolbar/dock redesigned to match DHLKeyuser live site
 *   (https://dhlkeyuser.github.io/Web-Comic-Reader/):
 *   • #webtoonDock is a FIXED bottom bar containing the full toolbar.
 *   • The dock handle shows ONLY the page counter + collapse chevron.
 *   • The toolbar (mode/nav/zoom/smart-gap) is in #webtoonDockContent
 *     which is EXPANDED by default — always visible when a comic is open.
 *   • Removed auto-hide-on-scroll — the dock no longer disappears when
 *     the user scrolls down. Users explicitly collapse/expand via chevron.
 *   • Paged mode: dock is shown with zoom/smart-gap disabled; mode buttons
 *     still accessible. Toolbar does NOT move out of the dock.
 *   • Scroll mode: same dock, zoom/smart-gap enabled.
 *   • No DOM movement of #readerToolbar between modes — it stays inside
 *     #webtoonDockContent at all times once a comic is open.
 *
 * [FIX v2.2.2] Document-level dragover/drop preventDefault in Dropzone
 * [FIX v2.2.1] archiveOpenFile ZIP Promise handled in uncompress.js
 * [FIX v2.2.1] Cache-buster ?v=2.2.3 on all local assets
 *
 * Reader engine features from DHLKeyuser cursor branch:
 *   Paged mode · Webtoon/Scroll mode · Scroll zoom · Smart gap removal ·
 *   IntersectionObserver lazy-load · Keyboard nav · naturalCompare
 *
 * Security / large-file (our additions):
 *   validateFile · readFileChunked · revokeAllBlobs · textContent-only XSS guard
 * ─────────────────────────────────────────────────────────────────────────
 */
'use strict';

/* ── Constants ─────────────────────────────────────────────────────────── */
const MAX_FILE_BYTES        = 1 * 1024 * 1024 * 1024;
const LARGE_FILE_THRESHOLD  = 100 * 1024 * 1024;
const CHUNK_SIZE            = 64 * 1024 * 1024;
const ALLOWED_EXT           = new Set(['.cbr', '.cbz', '.cbt']);
const READER_MODE_KEY       = 'readerMode';
const SCROLL_ZOOM_KEY       = 'scrollZoom';
const SMART_GAP_KEY         = 'scrollSmartGap';
const DOCK_COLLAPSED_KEY    = 'webtoonDockCollapsed';
const SCROLL_ZOOM_MIN       = 0.1;
const SCROLL_ZOOM_MAX       = 2.0;
const BASE_SCROLL_WIDTH_VW  = 90;

/* ── Boot ──────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

    /* ── DOM refs ─────────────────────────────────────────────────────── */
    const outputEl          = document.getElementById('output');
    const readerMetaEl      = document.getElementById('readerMeta');
    const pagedContainerEl  = document.getElementById('pagedContainer');
    const pagedImageLinkEl  = document.getElementById('pagedImageLink');
    const pagedImageEl      = document.getElementById('pagedImage');
    const lightboxLinksEl   = document.getElementById('lightboxLinks');
    const scrollContainerEl = document.getElementById('scrollContainer');
    const webtoonDockEl     = document.getElementById('webtoonDock');
    const dockContentEl     = document.getElementById('webtoonDockContent');
    const dockToggleBtn     = document.getElementById('dockToggleBtn');
    const dockPageIndicator = document.getElementById('dockPageIndicator');
    const readerToolbarEl   = document.getElementById('readerToolbar');
    const pageIndicatorEl   = document.getElementById('pageIndicator');
    const prevPageBtn       = document.getElementById('prevPageBtn');
    const nextPageBtn       = document.getElementById('nextPageBtn');
    const zoomOutBtn        = document.getElementById('zoomOutBtn');
    const zoomInBtn         = document.getElementById('zoomInBtn');
    const zoomLevelEl       = document.getElementById('zoomLevel');
    const smartGapToggleEl  = document.getElementById('smartGapToggle');
    const restartBtn        = document.getElementById('restartChapterBtn');
    const modeButtons       = document.querySelectorAll('[data-reading-mode]');

    const wrapEl            = document.querySelector('.wrap');
    const collapseBtn       = document.getElementById('collapseBtn');
    const progressTextEl    = document.querySelector('.progress-text');
    const sePreConEl        = document.querySelector('.se-pre-con');
    const chunkProgressEl   = document.getElementById('chunkProgress');
    const chunkBarEl        = document.getElementById('chunkBar');
    const chunkLabelEl      = document.getElementById('chunkLabel');
    const fileSizeWarningEl = document.getElementById('fileSizeWarning');
    const footerCollapsedEl = document.getElementById('footerCollapsedText');
    const currYearEl        = document.getElementById('currYear');

    /* ── State ────────────────────────────────────────────────────────── */
    let readingMode     = localStorage.getItem(READER_MODE_KEY) || 'scroll';
    if (readingMode !== 'scroll' && readingMode !== 'paged') readingMode = 'scroll';

    let scrollZoom      = parseFloat(localStorage.getItem(SCROLL_ZOOM_KEY)) || 1;
    scrollZoom          = Math.min(SCROLL_ZOOM_MAX, Math.max(SCROLL_ZOOM_MIN, scrollZoom));

    let smartGapEnabled = localStorage.getItem(SMART_GAP_KEY) === 'true';
    let dockCollapsed   = localStorage.getItem(DOCK_COLLAPSED_KEY) === 'true'; // expanded by default

    let pageUrls        = [];
    let totalPages      = 0;
    let pagesLoaded     = 0;
    let currentPageIdx  = 0;
    let currentScrollIdx= 0;
    let scrollPageEls   = [];
    let scrollEdgeData  = [];
    let scrollModeReady = false;
    let visibilityMap   = new Map();
    let lazyObserver    = null;
    let visObserver     = null;
    let lgInstance      = null;
    let currentFilename = '';
    let scrollSaveTimer = null;
    const activeBlobURLs= new Set();

    /* ── Init ─────────────────────────────────────────────────────────── */
    currYearEl.textContent = new Date().getFullYear();
    loadArchiveFormats(['rar', 'zip', 'tar']);

    if (smartGapToggleEl) smartGapToggleEl.checked = smartGapEnabled;
    updateModeButtons();
    applyScrollZoom();
    updateZoomControls();
    setDockCollapsed(dockCollapsed, false); // false = don't save to localStorage again on init

    /* ── Dropzone ─────────────────────────────────────────────────────── */
    Dropzone.autoDiscover = false;

    new Dropzone('#dropzone', {
        url: '#',
        acceptedFiles: '.cbr,.cbz,.cbt',
        createImageThumbnails: false,
        autoProcessQueue: false,
        previewsContainer: false,
        maxFiles: 1,
        maxFilesize: 1024,
        clickable: true,
        init() {
            this.on('maxfilesexceeded', function (f) { this.removeAllFiles(); this.addFile(f); });
            this.on('addedfile', (file) => {
                const err = validateFile(file);
                if (err) { showError(err); return; }
                if (fileSizeWarningEl)
                    fileSizeWarningEl.style.display = file.size > LARGE_FILE_THRESHOLD ? 'block' : 'none';
                openComic(file);
            });
        }
    });

    /* ── Upload panel collapse ────────────────────────────────────────── */
    footerCollapsedEl.addEventListener('click', () => wrapEl.classList.remove('collapsed'));
    collapseBtn.addEventListener('click', (e) => { e.preventDefault(); wrapEl.classList.add('collapsed'); });

    /* ── Reader control events ────────────────────────────────────────── */
    modeButtons.forEach(btn =>
        btn.addEventListener('click', () => setReadingMode(btn.dataset.readingMode))
    );
    prevPageBtn?.addEventListener('click', () => goToRelativePage(-1));
    nextPageBtn?.addEventListener('click', () => goToRelativePage(1));
    zoomOutBtn?.addEventListener('click',  () => adjustScrollZoom(-0.1));
    zoomInBtn?.addEventListener('click',   () => adjustScrollZoom(0.1));
    smartGapToggleEl?.addEventListener('change', () => {
        smartGapEnabled = smartGapToggleEl.checked;
        localStorage.setItem(SMART_GAP_KEY, String(smartGapEnabled));
        applySmartGapState();
    });
    restartBtn?.addEventListener('click', restartComic);
    dockToggleBtn?.addEventListener('click', () => setDockCollapsed(!dockCollapsed));
    pagedImageLinkEl?.addEventListener('click', (e) => {
        if (!lightboxLinksEl?.children.length) return;
        e.preventDefault();
        lightboxLinksEl.children[currentPageIdx]?.click();
    });

    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', updateDockPadding, { passive: true });

    /* ══════════════════════════════════════════════════════════════════════
       OPEN COMIC
    ══════════════════════════════════════════════════════════════════════ */
    function openComic(file) {
        outputEl.style.display  = 'none';
        wrapEl.classList.add('collapsed');
        collapseBtn.classList.add('show');
        currentFilename = file.name;

        progressTextEl.textContent = 'Reading 0/0 pages';
        sePreConEl.style.display   = 'block';

        if (lgInstance) { lgInstance.destroy(true); lgInstance = null; }
        revokeAllBlobs();
        resetReader();

        chunkProgressEl.style.display = file.size > LARGE_FILE_THRESHOLD ? 'block' : 'none';

        const onArchive = (archive, err) => {
            chunkProgressEl.style.display = 'none';
            if (err || !archive) { showError(String(err || 'Could not open archive.')); return; }
            processArchive(archive);
        };

        if (file.size <= LARGE_FILE_THRESHOLD) {
            archiveOpenFile(file, onArchive);
        } else {
            readFileChunked(file,
                (buf) => {
                    chunkProgressEl.style.display = 'none';
                    try {
                        const r = archiveOpenArrayBuffer(file.name, buf);
                        (r && typeof r.then === 'function')
                            ? r.then(a => onArchive(a, null)).catch(e => onArchive(null, e))
                            : onArchive(r, null);
                    } catch (e) { onArchive(null, e); }
                },
                (done, total) => {
                    const pct = total ? Math.round(done / total * 100) : 0;
                    chunkBarEl.style.width = pct + '%';
                    chunkLabelEl.textContent = `Loading ${fmtBytes(done)} / ${fmtBytes(total)} (${pct}%)`;
                }
            );
        }
    }

    function readFileChunked(file, onComplete, onProgress) {
        const chunks = []; let offset = 0;
        function next() {
            const end = Math.min(offset + CHUNK_SIZE, file.size);
            const reader = new FileReader();
            reader.onload = () => {
                chunks.push(reader.result);
                offset = end;
                onProgress(offset, file.size);
                if (offset < file.size) { setTimeout(next, 0); return; }
                const total = chunks.reduce((a, c) => a + c.byteLength, 0);
                const out = new Uint8Array(total);
                let pos = 0;
                for (const c of chunks) { out.set(new Uint8Array(c), pos); pos += c.byteLength; }
                onComplete(out.buffer);
            };
            reader.onerror = () => showError('Failed to read file chunk.');
            reader.readAsArrayBuffer(file.slice(offset, end));
        }
        next();
    }

    function processArchive(archive) {
        const entries = archive.entries
            .filter(e => e.is_file && getExt(e.name) !== '')
            .sort((a, b) => naturalCompare(a.name, b.name));

        totalPages  = entries.length;
        if (!totalPages) { showError('No images found in this archive.'); return; }

        pageUrls    = new Array(totalPages);
        pagesLoaded = 0;

        Promise.all(entries.map((entry, i) => new Promise(resolve => {
            entry.readData((data, err) => {
                if (!err && data) {
                    const url = URL.createObjectURL(new Blob([data], { type: getMIME(entry.name) }));
                    activeBlobURLs.add(url);
                    pageUrls[i] = url;
                }
                pagesLoaded++;
                progressTextEl.textContent = `Reading ${pagesLoaded}/${totalPages} pages`;
                resolve();
            });
        }))).then(() => finaliseLoad(archive.file_name));
    }

    function finaliseLoad(archiveName) {
        progressTextEl.innerHTML = '<span style="color:#4ade80">Completed!</span>';
        sePreConEl.style.display = 'none';
        outputEl.style.display   = 'block';

        if (readerMetaEl) {
            readerMetaEl.textContent = archiveName
                ? archiveName + ' — click a page to open gallery'
                : 'Click a page to open gallery';
        }

        buildLightboxLinks();
        initGallery();

        currentPageIdx  = 0;
        currentScrollIdx = 0;

        /* Show the dock now that a comic is loaded */
        webtoonDockEl.style.display = 'flex';
        setDockCollapsed(dockCollapsed, false);
        requestAnimationFrame(updateDockPadding);

        applyReadingMode(true);
        updatePageIndicator();
    }

    /* ══════════════════════════════════════════════════════════════════════
       READING MODES
       [FIX v2.2.3] Toolbar stays inside dock at all times — no DOM movement.
       Mode switch only toggles which containers are visible and enables/
       disables zoom + smart-gap controls.
    ══════════════════════════════════════════════════════════════════════ */
    function setReadingMode(mode) {
        if (mode !== 'paged' && mode !== 'scroll') return;
        readingMode = mode;
        localStorage.setItem(READER_MODE_KEY, mode);
        applyReadingMode(true);
    }

    function applyReadingMode(jump) {
        updateModeButtons();
        updateZoomControls();

        if (readingMode === 'scroll') {
            outputEl.classList.add('scroll-mode');
            pagedContainerEl.style.display  = 'none';
            scrollContainerEl.style.display = 'block';
            if (smartGapToggleEl) smartGapToggleEl.disabled = false;
            renderScrollMode(jump);
        } else {
            outputEl.classList.remove('scroll-mode');
            scrollContainerEl.style.display = 'none';
            pagedContainerEl.style.display  = 'block';
            if (smartGapToggleEl) smartGapToggleEl.disabled = true;
            clearScrollObservers();
            renderPagedImage(currentPageIdx);
        }
    }

    function updateModeButtons() {
        modeButtons.forEach(btn => {
            const active = btn.dataset.readingMode === readingMode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }

    /* ── Paged mode ───────────────────────────────────────────────────── */
    function renderPagedImage(index) {
        if (!totalPages) return;
        const i = clamp(index, 0, totalPages - 1);
        currentPageIdx  = i;
        currentScrollIdx = i;
        pagedImageEl.src = pageUrls[i] || '';
        pagedImageEl.alt = `Page ${i + 1}`;
        if (pagedImageLinkEl) pagedImageLinkEl.href = pageUrls[i] || '#';
        updatePageIndicator();
    }

    /* ── Scroll / Webtoon mode ────────────────────────────────────────── */
    function renderScrollMode(jump) {
        if (!scrollModeReady) buildScrollPages();
        applyScrollZoom();
        initLazyObserver();
        initScrollObserver();
        if (jump) scrollToPage(currentScrollIdx, false);
    }

    function buildScrollPages() {
        scrollContainerEl.innerHTML = '';
        scrollPageEls   = [];
        scrollEdgeData  = [];

        pageUrls.forEach((url, i) => {
            const wrap = document.createElement('div');
            wrap.className      = 'scroll-page';
            wrap.dataset.index  = String(i);

            const img       = document.createElement('img');
            img.dataset.src = url;
            img.alt         = `Page ${i + 1}`;
            img.loading     = 'lazy';
            img.decoding    = 'async';
            img.addEventListener('load', () => analyzeWhitespace(img, i));

            wrap.appendChild(img);
            scrollContainerEl.appendChild(wrap);
            scrollPageEls.push(wrap);
        });

        scrollModeReady = true;
        applySmartGapState();
    }

    /* ── Lazy loading ─────────────────────────────────────────────────── */
    function initLazyObserver() {
        if (lazyObserver) lazyObserver.disconnect();
        const imgs = scrollContainerEl.querySelectorAll('img[data-src]');
        if (!('IntersectionObserver' in window)) { imgs.forEach(setImgSrc); return; }
        lazyObserver = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) { setImgSrc(e.target); lazyObserver.unobserve(e.target); } });
        }, { rootMargin: '800px 0px' });
        imgs.forEach(img => lazyObserver.observe(img));
    }

    function setImgSrc(img) {
        const src = img.getAttribute('data-src');
        if (src) { img.src = src; img.removeAttribute('data-src'); }
    }

    /* ── Visibility tracking → page indicator ─────────────────────────── */
    function initScrollObserver() {
        if (visObserver) visObserver.disconnect();
        visibilityMap = new Map();
        if (!('IntersectionObserver' in window)) return;
        visObserver = new IntersectionObserver(entries => {
            entries.forEach(e => visibilityMap.set(Number(e.target.dataset.index), e.intersectionRatio));
            let best = currentScrollIdx, bestR = 0;
            visibilityMap.forEach((r, idx) => { if (r > bestR) { bestR = r; best = idx; } });
            if (best !== currentScrollIdx) {
                currentScrollIdx = best;
                currentPageIdx   = best;
                updatePageIndicator();
                if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
                scrollSaveTimer = setTimeout(() => {
                    localStorage.setItem('lastPage_' + currentFilename, String(best));
                }, 300);
            }
        }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
        scrollPageEls.forEach(p => visObserver.observe(p));
    }

    function clearScrollObservers() {
        if (lazyObserver) { lazyObserver.disconnect(); lazyObserver = null; }
        if (visObserver)  { visObserver.disconnect();  visObserver  = null; }
    }

    /* ── Zoom ─────────────────────────────────────────────────────────── */
    function adjustScrollZoom(delta) {
        scrollZoom = clamp(scrollZoom + delta, SCROLL_ZOOM_MIN, SCROLL_ZOOM_MAX);
        applyScrollZoom();
    }

    function applyScrollZoom() {
        if (!scrollContainerEl) return;
        const w = Math.min(BASE_SCROLL_WIDTH_VW * scrollZoom, 100);
        scrollContainerEl.style.setProperty('--scroll-image-width', `${w}vw`);
        localStorage.setItem(SCROLL_ZOOM_KEY, String(scrollZoom));
        if (zoomLevelEl) zoomLevelEl.textContent = `${Math.round(scrollZoom * 100)}%`;
    }

    function updateZoomControls() {
        const isScroll = readingMode === 'scroll';
        if (zoomLevelEl) zoomLevelEl.textContent = `${Math.round(scrollZoom * 100)}%`;
        if (zoomOutBtn) zoomOutBtn.disabled = !isScroll;
        if (zoomInBtn)  zoomInBtn.disabled  = !isScroll;
    }

    /* ── Smart gap removal ────────────────────────────────────────────── */
    function analyzeWhitespace(img, index) {
        if (!img.naturalWidth || !img.naturalHeight) return;
        const sW = Math.min(120, img.naturalWidth);
        const sH = 10;
        const stripH = Math.min(20, img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = sW; canvas.height = sH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        scrollEdgeData[index] = {
            topWhite:    sampleWhite(ctx, img, 0,                         stripH, sW, sH),
            bottomWhite: sampleWhite(ctx, img, img.naturalHeight - stripH, stripH, sW, sH)
        };
        updateSmartGapAt(index);
    }

    function sampleWhite(ctx, img, sy, sh, sw, sampleH) {
        ctx.clearRect(0, 0, sw, sampleH);
        ctx.drawImage(img, 0, sy, img.naturalWidth, sh, 0, 0, sw, sampleH);
        const d = ctx.getImageData(0, 0, sw, sampleH).data;
        let white = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i+1] > 240 && d[i+2] > 240) white++;
        return white / (d.length / 4) > 0.92;
    }

    function updateSmartGapAt(i) {
        if (!smartGapEnabled) return;
        const curr = scrollEdgeData[i], prev = scrollEdgeData[i - 1], next = scrollEdgeData[i + 1];
        if (prev && curr)  toggleTight(i - 1, prev.bottomWhite && curr.topWhite);
        if (curr && next)  toggleTight(i,     curr.bottomWhite && next.topWhite);
    }

    function applySmartGapState() {
        scrollPageEls.forEach((_, i) => {
            const curr = scrollEdgeData[i], next = scrollEdgeData[i + 1];
            toggleTight(i, !!(smartGapEnabled && curr && next && curr.bottomWhite && next.topWhite));
        });
    }

    function toggleTight(i, tight) {
        scrollPageEls[i]?.classList.toggle('scroll-page--tight', tight);
    }

    /* ── Dock: always-visible fixed bottom bar ────────────────────────── */
    function setDockCollapsed(collapsed, persist = true) {
        dockCollapsed = collapsed;
        if (persist) localStorage.setItem(DOCK_COLLAPSED_KEY, String(collapsed));

        if (!webtoonDockEl || !dockContentEl || !dockToggleBtn) return;
        webtoonDockEl.classList.toggle('collapsed', collapsed);
        webtoonDockEl.classList.toggle('expanded',  !collapsed);
        dockContentEl.style.display = collapsed ? 'none' : 'block';
        dockToggleBtn.setAttribute('aria-expanded', String(!collapsed));
        dockToggleBtn.setAttribute('aria-label',    collapsed ? 'Expand toolbar' : 'Collapse toolbar');

        // Rotate chevron: points UP when expanded (content visible), DOWN when collapsed
        const icon = dockToggleBtn.querySelector('.dock-toggle-icon');
        if (icon) icon.style.transform = collapsed ? 'rotate(180deg)' : '';

        requestAnimationFrame(updateDockPadding);
    }

    function updateDockPadding() {
        if (!scrollContainerEl || !pagedContainerEl) return;
        const h = webtoonDockEl?.style.display !== 'none'
            ? Math.ceil(webtoonDockEl.getBoundingClientRect().height)
            : 0;
        const pad = h + 12 + 'px';
        scrollContainerEl.style.paddingBottom = pad;
        pagedContainerEl.style.paddingBottom  = pad;
        document.documentElement.style.setProperty('--dock-height', h + 'px');
    }

    /* ── Page navigation ──────────────────────────────────────────────── */
    function goToRelativePage(delta) {
        if (!totalPages) return;
        if (readingMode === 'scroll') scrollToPage(currentScrollIdx + delta, true);
        else renderPagedImage(currentPageIdx + delta);
    }

    function scrollToPage(index, smooth) {
        const i = clamp(index, 0, totalPages - 1);
        currentScrollIdx = i;
        currentPageIdx   = i;
        updatePageIndicator();
        scrollPageEls[i]?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    }

    function restartComic() {
        currentPageIdx   = 0;
        currentScrollIdx = 0;
        if (readingMode === 'scroll') scrollToPage(0, false);
        else renderPagedImage(0);
        updatePageIndicator();
    }

    function updatePageIndicator() {
        const idx   = readingMode === 'scroll' ? currentScrollIdx : currentPageIdx;
        const label = totalPages ? `${idx + 1} / ${totalPages}` : '0 / 0';
        if (pageIndicatorEl)  pageIndicatorEl.textContent  = label;
        if (dockPageIndicator) dockPageIndicator.textContent = label;
    }

    /* ── Keyboard ─────────────────────────────────────────────────────── */
    function handleKeydown(e) {
        if (!outputEl || outputEl.style.display !== 'block') return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
                  || t.tagName === 'SELECT' || t.isContentEditable)) return;
        if (document.body.classList.contains('lg-on')) return;
        if (e.key === 'ArrowLeft')  { e.preventDefault(); goToRelativePage(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); goToRelativePage(1); }
    }

    /* ── lightGallery ─────────────────────────────────────────────────── */
    function buildLightboxLinks() {
        if (!lightboxLinksEl) return;
        lightboxLinksEl.innerHTML = '';
        pageUrls.forEach((url, i) => {
            const a = document.createElement('a');
            a.href = url;
            a.setAttribute('aria-label', `Page ${i + 1}`);
            lightboxLinksEl.appendChild(a);
        });
    }

    function initGallery() {
        if (!lightboxLinksEl || typeof window.lightGallery !== 'function') return;
        if (lgInstance) { lgInstance.destroy(true); lgInstance = null; }
        lgInstance = window.lightGallery(lightboxLinksEl, {
            selector: 'a',
            plugins: [window.lgZoom, window.lgFullscreen, window.lgThumbnail,
                      window.lgAutoplay, window.lgRotate],
            zoom: true, download: false, enableSwipe: true,
            thumbnail: true, animateThumb: true, showThumbByDefault: true,
            autoplay: false, rotate: true
        });
        lightboxLinksEl.addEventListener('lgAfterSlide', (e) => {
            currentPageIdx   = e.detail.index;
            currentScrollIdx = e.detail.index;
            updatePageIndicator();
        });
    }

    /* ── Reset / cleanup ──────────────────────────────────────────────── */
    function resetReader() {
        pageUrls         = [];
        totalPages       = 0;
        pagesLoaded      = 0;
        currentPageIdx   = 0;
        currentScrollIdx = 0;
        scrollPageEls    = [];
        scrollEdgeData   = [];
        visibilityMap    = new Map();
        scrollModeReady  = false;
        if (scrollSaveTimer) { clearTimeout(scrollSaveTimer); scrollSaveTimer = null; }
        clearScrollObservers();
        if (lightboxLinksEl)   lightboxLinksEl.innerHTML   = '';
        if (scrollContainerEl) scrollContainerEl.innerHTML = '';
        if (pagedImageEl)      pagedImageEl.removeAttribute('src');
        outputEl.classList.remove('scroll-mode');
        pagedContainerEl.style.display  = 'block';
        scrollContainerEl.style.display = 'none';
        webtoonDockEl.style.display     = 'none';
        if (readerMetaEl) readerMetaEl.textContent = '';
        updatePageIndicator();
    }

    function revokeAllBlobs() {
        for (const url of activeBlobURLs) { try { URL.revokeObjectURL(url); } catch (_) {} }
        activeBlobURLs.clear();
    }

    /* ── Error display ────────────────────────────────────────────────── */
    function showError(msg) {
        sePreConEl.style.display = 'none';
        outputEl.style.display   = 'block';
        if (readerMetaEl) {
            readerMetaEl.textContent = '';
            const s = document.createElement('span');
            s.style.color = '#ef4444';
            s.textContent = msg;          // textContent only — no XSS
            readerMetaEl.appendChild(s);
        }
    }

    /* ── Utilities ────────────────────────────────────────────────────── */
    function validateFile(file) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!ALLOWED_EXT.has(ext)) return `Unsupported file "${ext}". Use .cbr, .cbz, or .cbt.`;
        if (file.size > MAX_FILE_BYTES) return `File too large (${fmtBytes(file.size)}). Max 1 GB.`;
        return null;
    }

    function getExt(fn) { const p = fn.split('.'); return p.length > 1 ? p.pop().toLowerCase() : ''; }

    function getMIME(fn) {
        return { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif',
                 bmp:'image/bmp',  webp:'image/webp', avif:'image/avif',
                 tif:'image/tiff', tiff:'image/tiff' }[getExt(fn)] || 'image/jpeg';
    }

    function naturalCompare(a, b) {
        const ax = String(a).toLowerCase().match(/\d+|\D+/g) || [];
        const bx = String(b).toLowerCase().match(/\d+|\D+/g) || [];
        for (let i = 0; i < Math.min(ax.length, bx.length); i++) {
            const an = Number(ax[i]), bn = Number(bx[i]);
            const both = !isNaN(an) && !isNaN(bn);
            if (both && an !== bn) return an - bn;
            if (!both && ax[i] !== bx[i]) return ax[i].localeCompare(bx[i]);
        }
        return ax.length - bx.length;
    }

    function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

    function fmtBytes(b) {
        if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
        if (b >= 1048576)    return (b / 1048576).toFixed(1) + ' MB';
        return (b / 1024).toFixed(0) + ' KB';
    }
});
