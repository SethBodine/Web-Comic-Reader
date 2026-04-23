/**
 * Web Comic Reader — script.js  v2.2.0
 *
 * CHANGELOG
 * ─────────────────────────────────────────────────────────────────────────
 * Scope: drag-drop / click-to-open → read. No local library, no folder
 * picker, no IndexedDB, no series view, no settings panel, no localStorage
 * beyond remembering the last reading mode and zoom level.
 *
 * Reader engine features ported from:
 *   DHLKeyuser/Web-Comic-Reader @ cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26
 *
 * [DHL] Paged mode — single full-width image, Prev/Next, lightbox on click
 * [DHL] Webtoon/Scroll mode — continuous vertical strip
 * [DHL] Mode toggle persisted to localStorage (key: readerMode)
 * [DHL] Scroll zoom +/− (10–200%), persisted (key: scrollZoom)
 * [DHL] Smart gap removal — canvas pixel-sampling trims white page borders
 * [DHL] IntersectionObserver lazy-load (800px margin) in scroll mode
 * [DHL] IntersectionObserver visibility tracking → live page indicator
 * [DHL] Webtoon dock — fixed bottom bar, collapse/expand, auto-hide on
 *       scroll-down, tap centre of strip to show/hide
 * [DHL] Keyboard navigation ← →
 * [DHL] naturalCompare() — chunk-based numeric sort
 * [DHL] Restart button — jump back to page 1
 *
 * Security additions (our work, not in DHLKeyuser fork):
 * [SEC] validateFile() — extension allowlist + 1 GB size cap
 * [SEC] All filenames displayed via textContent only (no innerHTML with
 *       user-controlled strings)
 * [SEC] Blob URLs tracked and revoked immediately after image loads
 * [SEC] Dropzone.autoDiscover = false set unconditionally before init
 *
 * Large-file additions (our work):
 * [LRG] readFileChunked() — 64 MiB slices for files > 100 MB
 * [LRG] Byte-level progress bar driven by onProgress callback
 * [LRG] archiveOpenArrayBuffer Promise path handled for ZIP vs sync RAR/TAR
 *
 * Bug fixes (our work):
 * [FIX] lightGallery 2.x API — window.lightGallery(), plugins array,
 *       lgAfterSlide event name (was onAfterSlide in v1)
 * [FIX] float:center invalid CSS removed; output uses flexbox
 * [FIX] AVIF + TIFF added to MIME table
 * ─────────────────────────────────────────────────────────────────────────
 */
'use strict';

/* ── Constants ─────────────────────────────────────────────────────────── */
const MAX_FILE_BYTES        = 1 * 1024 * 1024 * 1024;  // 1 GB hard cap
const LARGE_FILE_THRESHOLD  = 100 * 1024 * 1024;        // 100 MB → chunked path
const CHUNK_SIZE            = 64 * 1024 * 1024;         // 64 MiB per chunk
const ALLOWED_EXT           = new Set(['.cbr', '.cbz', '.cbt']);
const READER_MODE_KEY       = 'readerMode';
const SCROLL_ZOOM_KEY       = 'scrollZoom';
const SMART_GAP_KEY         = 'scrollSmartGap';
const WEBTOON_DOCK_KEY      = 'webtoonDockCollapsed';
const SCROLL_ZOOM_MIN       = 0.1;
const SCROLL_ZOOM_MAX       = 2.0;
const BASE_SCROLL_WIDTH_VW  = 90;

/* ── Boot ──────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

    /* DOM refs — reader */
    const outputEl          = document.getElementById('output');
    const readerToolbarEl   = document.getElementById('readerToolbar');
    const readerMetaEl      = document.getElementById('readerMeta');
    const pagedContainerEl  = document.getElementById('pagedContainer');
    const pagedImageLinkEl  = document.getElementById('pagedImageLink');
    const pagedImageEl      = document.getElementById('pagedImage');
    const lightboxLinksEl   = document.getElementById('lightboxLinks');
    const scrollContainerEl = document.getElementById('scrollContainer');
    const pageIndicatorEl   = document.getElementById('pageIndicator');
    const prevPageBtn       = document.getElementById('prevPageBtn');
    const nextPageBtn       = document.getElementById('nextPageBtn');
    const zoomOutBtn        = document.getElementById('zoomOutBtn');
    const zoomInBtn         = document.getElementById('zoomInBtn');
    const zoomLevelEl       = document.getElementById('zoomLevel');
    const smartGapToggleEl  = document.getElementById('smartGapToggle');
    const restartBtn        = document.getElementById('restartChapterBtn');
    const webtoonDockEl     = document.getElementById('webtoonDock');
    const dockToggleBtn     = document.getElementById('dockToggleBtn');
    const dockPageIndicator = document.getElementById('dockPageIndicator');
    const dockContentEl     = document.getElementById('webtoonDockContent');
    const modeButtons       = document.querySelectorAll('[data-reading-mode]');

    /* DOM refs — upload panel */
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

    /* Reader state */
    let readingMode     = localStorage.getItem(READER_MODE_KEY) || 'scroll';
    if (readingMode !== 'scroll' && readingMode !== 'paged') readingMode = 'scroll';

    let scrollZoom      = parseFloat(localStorage.getItem(SCROLL_ZOOM_KEY)) || 1;
    scrollZoom          = clamp(scrollZoom, SCROLL_ZOOM_MIN, SCROLL_ZOOM_MAX);

    let smartGapEnabled = localStorage.getItem(SMART_GAP_KEY) === 'true';
    let dockCollapsed   = localStorage.getItem(WEBTOON_DOCK_KEY) !== 'false'; // default collapsed

    /* Page data */
    let pageUrls          = [];
    let totalPages        = 0;
    let pagesLoaded       = 0;
    let currentPageIndex  = 0;
    let currentScrollIdx  = 0;
    let scrollPageEls     = [];
    let scrollEdgeData    = [];
    let scrollModeReady   = false;
    let visibilityRatios  = new Map();
    let lazyObserver      = null;
    let visObserver       = null;
    let lgInstance        = null;
    let currentFilename   = '';

    /* Blob URL tracking */
    const activeBlobURLs  = new Set();

    /* Dock auto-hide */
    let dockAutoHidden    = false;
    let lastScrollY       = window.scrollY;
    let scrollSaveTimer   = null;

    /* ── Year ─────────────────────────────────────────────────────────── */
    currYearEl.textContent = new Date().getFullYear();

    /* ── Archive decoders ─────────────────────────────────────────────── */
    loadArchiveFormats(['rar', 'zip', 'tar']);

    /* ── Dropzone ─────────────────────────────────────────────────────── */
    Dropzone.autoDiscover = false;  // [FIX] set unconditionally before new Dropzone()

    const dz = new Dropzone('#dropzone', {
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
                if (err) { showError(err); dz.removeAllFiles(); return; }
                fileSizeWarningEl.style.display = file.size > LARGE_FILE_THRESHOLD ? 'block' : 'none';
                openComic(file);
            });
        }
    });

    /* ── Collapse / expand upload panel ─────────────────────────────── */
    footerCollapsedEl.addEventListener('click', () => {
        wrapEl.classList.remove('collapsed');
    });
    collapseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        wrapEl.classList.add('collapsed');
    });

    /* ── Reader controls ──────────────────────────────────────────────── */
    modeButtons.forEach(btn =>
        btn.addEventListener('click', () => setReadingMode(btn.dataset.readingMode))
    );
    prevPageBtn?.addEventListener('click', () => goToRelativePage(-1));
    nextPageBtn?.addEventListener('click', () => goToRelativePage(1));
    zoomOutBtn?.addEventListener('click',  () => adjustScrollZoom(-0.1));
    zoomInBtn?.addEventListener('click',   () => adjustScrollZoom(0.1));
    smartGapToggleEl?.addEventListener('change', () => {
        smartGapEnabled = smartGapToggleEl.checked;
        localStorage.setItem(SMART_GAP_KEY, smartGapEnabled.toString());
        applySmartGapState();
    });
    restartBtn?.addEventListener('click', restartComic);
    dockToggleBtn?.addEventListener('click', () => setDockCollapsed(!dockCollapsed));
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    window.addEventListener('resize', () => updateDockPadding(), { passive: true });
    scrollContainerEl?.addEventListener('click', handleScrollTap);

    /* Initialise control states */
    if (smartGapToggleEl) smartGapToggleEl.checked = smartGapEnabled;
    updateModeButtons();
    applyScrollZoom();
    updateZoomControls();

    /* ══════════════════════════════════════════════════════════════════════
       OPEN COMIC
    ══════════════════════════════════════════════════════════════════════ */
    function openComic(file) {
        /* UI */
        outputEl.style.display  = 'none';
        wrapEl.classList.add('collapsed');
        collapseBtn.classList.add('show');
        currentFilename = file.name;
        progressTextEl.textContent = 'Reading 0/0 pages';
        sePreConEl.style.display   = 'block';
        if (readerToolbarEl) readerToolbarEl.style.display = 'none';

        /* Reset */
        if (lgInstance) { lgInstance.destroy(true); lgInstance = null; }
        revokeAllBlobs();
        resetReader();

        /* Chunk progress bar */
        chunkProgressEl.style.display = file.size > LARGE_FILE_THRESHOLD ? 'block' : 'none';

        if (file.size <= LARGE_FILE_THRESHOLD) {
            /* Fast path — archiveOpenFile (works for all formats, callback-based) */
            archiveOpenFile(file, (archive, err) => {
                chunkProgressEl.style.display = 'none';
                if (err || !archive) { showError(String(err || 'Could not open archive.')); return; }
                processArchive(archive);
            });
        } else {
            /* Large-file path — chunked ArrayBuffer read */
            readFileChunked(file,
                (arrayBuffer) => {
                    chunkProgressEl.style.display = 'none';
                    try {
                        const result = archiveOpenArrayBuffer(file.name, arrayBuffer);
                        /* ZIP returns a Promise; RAR/TAR returns synchronously */
                        if (result && typeof result.then === 'function') {
                            result.then(processArchive).catch(e => showError(e.message || String(e)));
                        } else {
                            processArchive(result);
                        }
                    } catch (e) {
                        showError(e.message || String(e));
                    }
                },
                (bytesRead, total) => {
                    const pct = total > 0 ? Math.round((bytesRead / total) * 100) : 0;
                    chunkBarEl.style.width = pct + '%';
                    chunkLabelEl.textContent = `Loading ${fmtBytes(bytesRead)} / ${fmtBytes(total)} (${pct}%)`;
                }
            );
        }
    }

    /* ── Chunked FileReader (large files > 100 MB) ────────────────────── */
    function readFileChunked(file, onComplete, onProgress) {
        const chunks = [];
        let offset = 0;
        function next() {
            const end    = Math.min(offset + CHUNK_SIZE, file.size);
            const reader = new FileReader();
            reader.onload = () => {
                chunks.push(reader.result);
                offset = end;
                onProgress(offset, file.size);
                if (offset < file.size) {
                    setTimeout(next, 0);  // yield between chunks
                } else {
                    const total    = chunks.reduce((a, c) => a + c.byteLength, 0);
                    const combined = new Uint8Array(total);
                    let pos = 0;
                    for (const c of chunks) { combined.set(new Uint8Array(c), pos); pos += c.byteLength; }
                    onComplete(combined.buffer);
                }
            };
            reader.onerror = () => showError('Failed to read file chunk.');
            reader.readAsArrayBuffer(file.slice(offset, end));
        }
        next();
    }

    /* ── Process opened archive ───────────────────────────────────────── */
    function processArchive(archive) {
        const entries = archive.entries
            .filter(e => e.is_file && getExt(e.name) !== '')
            .sort((a, b) => naturalCompare(a.name, b.name));

        totalPages = entries.length;
        if (totalPages === 0) { showError('No images found in this archive.'); return; }

        pageUrls   = new Array(totalPages);
        pagesLoaded = 0;

        const promises = entries.map((entry, i) => readEntryBlob(entry, i));
        Promise.all(promises).then(() => finaliseLoad(archive.file_name));
    }

    function readEntryBlob(entry, index) {
        return new Promise(resolve => {
            entry.readData((data, err) => {
                if (err || !data) { resolve(); return; }
                const blob = new Blob([data], { type: getMIME(entry.name) });
                const url  = URL.createObjectURL(blob);
                activeBlobURLs.add(url);
                pageUrls[index] = url;
                pagesLoaded++;
                progressTextEl.textContent = `Reading ${pagesLoaded}/${totalPages} pages`;
                resolve();
            });
        });
    }

    /* ── Finalise load ────────────────────────────────────────────────── */
    function finaliseLoad(archiveName) {
        progressTextEl.innerHTML = '<span style="color:#4ade80">Completed!</span>';
        sePreConEl.style.display = 'none';
        outputEl.style.display   = 'block';
        if (readerToolbarEl) readerToolbarEl.style.display = 'flex';

        /* Set archive name in meta bar — textContent only [SEC] */
        if (readerMetaEl) {
            readerMetaEl.textContent = archiveName
                ? `${archiveName} — click a page to open gallery`
                : 'Click a page to open gallery';
        }

        buildLightboxLinks();
        initGallery();

        currentPageIndex = 0;
        currentScrollIdx = 0;
        applyReadingMode(true);
        updatePageIndicator();
    }

    /* ══════════════════════════════════════════════════════════════════════
       READING MODES
    ══════════════════════════════════════════════════════════════════════ */
    function setReadingMode(mode) {
        if (mode !== 'paged' && mode !== 'scroll') return;
        if (readingMode === mode) return;
        readingMode = mode;
        localStorage.setItem(READER_MODE_KEY, mode);
        applyReadingMode(true);
    }

    function applyReadingMode(shouldJump) {
        updateModeButtons();
        if (readingMode === 'scroll') {
            outputEl.classList.add('scroll-mode');
            if (pagedContainerEl)  pagedContainerEl.style.display  = 'none';
            if (scrollContainerEl) scrollContainerEl.style.display = 'block';
            if (smartGapToggleEl)  smartGapToggleEl.disabled = false;
            lastScrollY = window.scrollY;
            activateWebtoonDock();
            renderScrollMode(shouldJump);
        } else {
            outputEl.classList.remove('scroll-mode');
            if (scrollContainerEl) scrollContainerEl.style.display = 'none';
            if (pagedContainerEl)  pagedContainerEl.style.display  = 'block';
            if (smartGapToggleEl)  smartGapToggleEl.disabled = true;
            deactivateWebtoonDock();
            clearScrollObservers();
            renderPagedImage(currentPageIndex);
        }
        updateZoomControls();
    }

    function updateModeButtons() {
        modeButtons.forEach(btn => {
            const active = btn.dataset.readingMode === readingMode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active.toString());
        });
    }

    /* ── Paged mode ───────────────────────────────────────────────────── */
    function renderPagedImage(index) {
        if (!pagedImageEl || totalPages === 0) return;
        const i = clamp(index, 0, totalPages - 1);
        currentPageIndex = i;
        currentScrollIdx = i;
        pagedImageEl.src = pageUrls[i];
        pagedImageEl.alt = `Page ${i + 1}`;
        if (pagedImageLinkEl) pagedImageLinkEl.href = pageUrls[i];
        updatePageIndicator();
    }

    /* ── Scroll / Webtoon mode ────────────────────────────────────────── */
    function renderScrollMode(shouldJump) {
        if (!scrollModeReady) buildScrollPages();
        applyScrollZoom();
        initLazyObserver();
        initScrollObserver();
        if (shouldJump) scrollToPageIndex(currentScrollIdx, false);
    }

    function buildScrollPages() {
        if (!scrollContainerEl) return;
        scrollContainerEl.innerHTML = '';
        scrollPageEls   = [];
        scrollEdgeData  = [];

        pageUrls.forEach((url, i) => {
            const wrapper = document.createElement('div');
            wrapper.className    = 'scroll-page';
            wrapper.dataset.index = String(i);

            const img       = document.createElement('img');
            img.loading     = 'lazy';
            img.decoding    = 'async';
            img.alt         = `Page ${i + 1}`;
            img.dataset.src = url;
            img.addEventListener('load', () => analyzeWhitespace(img, i));

            wrapper.appendChild(img);
            scrollContainerEl.appendChild(wrapper);
            scrollPageEls.push(wrapper);
        });

        scrollModeReady = true;
        applySmartGapState();
    }

    /* ── Lazy loading ─────────────────────────────────────────────────── */
    function initLazyObserver() {
        if (!scrollContainerEl) return;
        if (lazyObserver) lazyObserver.disconnect();

        const imgs = scrollContainerEl.querySelectorAll('img[data-src]');
        if (!('IntersectionObserver' in window)) {
            imgs.forEach(setImgSrc);
            return;
        }
        lazyObserver = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (!e.isIntersecting) return;
                setImgSrc(e.target);
                lazyObserver.unobserve(e.target);
            });
        }, { rootMargin: '800px 0px' });
        imgs.forEach(img => lazyObserver.observe(img));
    }

    function setImgSrc(img) {
        const src = img.getAttribute('data-src');
        if (!src) return;
        img.src = src;
        img.removeAttribute('data-src');
    }

    /* ── Visibility tracking → page indicator ─────────────────────────── */
    function initScrollObserver() {
        if (!scrollContainerEl || !scrollPageEls.length) return;
        if (visObserver) visObserver.disconnect();
        visibilityRatios = new Map();

        if (!('IntersectionObserver' in window)) return;
        visObserver = new IntersectionObserver(entries => {
            entries.forEach(e => {
                visibilityRatios.set(Number(e.target.dataset.index), e.intersectionRatio);
            });
            let bestIdx = currentScrollIdx, bestRatio = 0;
            visibilityRatios.forEach((ratio, idx) => {
                if (ratio > bestRatio) { bestRatio = ratio; bestIdx = idx; }
            });
            if (bestIdx !== currentScrollIdx) {
                currentScrollIdx = bestIdx;
                currentPageIndex = bestIdx;
                updatePageIndicator();
                scheduleSaveScroll(bestIdx);
            }
        }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
        scrollPageEls.forEach(p => visObserver.observe(p));
    }

    function clearScrollObservers() {
        if (lazyObserver) { lazyObserver.disconnect(); lazyObserver = null; }
        if (visObserver)  { visObserver.disconnect();  visObserver  = null; }
    }

    function scheduleSaveScroll(idx) {
        if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
        scrollSaveTimer = setTimeout(() => {
            localStorage.setItem('lastScrollPage_' + currentFilename, String(idx));
        }, 200);
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
        localStorage.setItem(SCROLL_ZOOM_KEY, scrollZoom.toString());
        updateZoomControls();
    }

    function updateZoomControls() {
        if (zoomLevelEl) zoomLevelEl.textContent = `${Math.round(scrollZoom * 100)}%`;
        const isScroll = readingMode === 'scroll';
        if (zoomOutBtn) zoomOutBtn.disabled = !isScroll;
        if (zoomInBtn)  zoomInBtn.disabled  = !isScroll;
    }

    /* ── Smart gap removal ────────────────────────────────────────────── */
    function analyzeWhitespace(img, index) {
        if (!img.naturalWidth || !img.naturalHeight) return;
        const stripH  = Math.min(20, img.naturalHeight);
        const sampleH = Math.min(10, stripH);
        const sampleW = Math.min(120, img.naturalWidth);
        const canvas  = document.createElement('canvas');
        canvas.width  = sampleW;
        canvas.height = sampleH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const topWhite    = isStripWhite(ctx, img, 0, stripH, sampleW, sampleH);
        const bottomWhite = isStripWhite(ctx, img, img.naturalHeight - stripH, stripH, sampleW, sampleH);
        scrollEdgeData[index] = { topWhite, bottomWhite };
        updateSmartGapAt(index);
    }

    function isStripWhite(ctx, img, startY, stripH, sampleW, sampleH) {
        ctx.clearRect(0, 0, sampleW, sampleH);
        ctx.drawImage(img, 0, startY, img.naturalWidth, stripH, 0, 0, sampleW, sampleH);
        const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
        const total = data.length / 4;
        let white = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 240 && data[i+1] > 240 && data[i+2] > 240) white++;
        }
        return white / total > 0.92;
    }

    function updateSmartGapAt(index) {
        if (!smartGapEnabled) return;
        const prev = index - 1;
        if (prev >= 0 && scrollEdgeData[prev] && scrollEdgeData[index]) {
            toggleTightGap(prev, scrollEdgeData[prev].bottomWhite && scrollEdgeData[index].topWhite);
        }
        const next = index + 1;
        if (next < totalPages && scrollEdgeData[index] && scrollEdgeData[next]) {
            toggleTightGap(index, scrollEdgeData[index].bottomWhite && scrollEdgeData[next].topWhite);
        }
    }

    function applySmartGapState() {
        if (!scrollPageEls.length) return;
        scrollPageEls.forEach((page, i) => {
            const curr = scrollEdgeData[i];
            const next = scrollEdgeData[i + 1];
            toggleTightGap(i, !!(smartGapEnabled && curr && next && curr.bottomWhite && next.topWhite));
        });
    }

    function toggleTightGap(index, tight) {
        scrollPageEls[index]?.classList.toggle('scroll-page--tight', tight);
    }

    /* ── Webtoon dock ─────────────────────────────────────────────────── */
    function activateWebtoonDock() {
        if (!webtoonDockEl || !dockContentEl || !readerToolbarEl) return;
        webtoonDockEl.style.display = 'flex';
        dockContentEl.appendChild(readerToolbarEl);
        readerToolbarEl.style.display = 'flex';
        updateDockState();
        setDockAutoHidden(false);
        requestAnimationFrame(updateDockPadding);
    }

    function deactivateWebtoonDock() {
        if (webtoonDockEl) {
            webtoonDockEl.style.display = 'none';
            webtoonDockEl.classList.remove('auto-hidden');
        }
        /* Return toolbar to #output */
        if (readerToolbarEl && outputEl) {
            outputEl.insertBefore(readerToolbarEl, outputEl.firstChild);
            readerToolbarEl.style.display = 'flex';
        }
        if (scrollContainerEl) scrollContainerEl.style.paddingBottom = '';
    }

    function setDockCollapsed(collapsed) {
        dockCollapsed = collapsed;
        localStorage.setItem(WEBTOON_DOCK_KEY, collapsed.toString());
        updateDockState();
        setDockAutoHidden(false);
        requestAnimationFrame(updateDockPadding);
    }

    function updateDockState() {
        if (!webtoonDockEl) return;
        webtoonDockEl.classList.toggle('collapsed', dockCollapsed);
        webtoonDockEl.classList.toggle('expanded',  !dockCollapsed);
        if (dockToggleBtn) {
            dockToggleBtn.setAttribute('aria-expanded', (!dockCollapsed).toString());
            dockToggleBtn.setAttribute('aria-label',
                dockCollapsed ? 'Expand dock' : 'Collapse dock');
        }
    }

    function updateDockPadding() {
        if (!scrollContainerEl || !webtoonDockEl || webtoonDockEl.style.display === 'none') {
            scrollContainerEl && (scrollContainerEl.style.paddingBottom = '');
            document.documentElement.style.removeProperty('--dock-safe-offset');
            return;
        }
        const h = Math.ceil(webtoonDockEl.getBoundingClientRect().height);
        scrollContainerEl.style.paddingBottom = `${h}px`;
        document.documentElement.style.setProperty('--dock-safe-offset', `${h}px`);
    }

    function setDockAutoHidden(hidden) {
        if (!webtoonDockEl) return;
        dockAutoHidden = hidden;
        webtoonDockEl.classList.toggle('auto-hidden', hidden);
    }

    /* ── Window scroll handler ────────────────────────────────────────── */
    function handleWindowScroll() {
        if (readingMode !== 'scroll') return;
        const delta = window.scrollY - lastScrollY;
        lastScrollY = window.scrollY;
        if (Math.abs(delta) >= 6) setDockAutoHidden(delta > 0);
    }

    /* ── Tap centre of scroll strip → toggle dock ─────────────────────── */
    function handleScrollTap(event) {
        if (readingMode !== 'scroll') return;
        if (event.target.closest('button, a, input, select, label')) return;
        const xRatio = event.clientX / window.innerWidth;
        if (xRatio > 0.25 && xRatio < 0.75) {
            if (dockAutoHidden) { setDockAutoHidden(false); return; }
            setDockCollapsed(!dockCollapsed);
        }
    }

    /* ── Keyboard navigation ──────────────────────────────────────────── */
    function handleKeydown(event) {
        if (outputEl.style.display !== 'block') return;
        const t = event.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
                  || t.tagName === 'SELECT' || t.isContentEditable)) return;
        if (document.body.classList.contains('lg-on')) return;
        if (event.key === 'ArrowLeft')  { event.preventDefault(); goToRelativePage(-1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); goToRelativePage(1); }
    }

    /* ── Page navigation ──────────────────────────────────────────────── */
    function goToRelativePage(delta) {
        if (totalPages === 0) return;
        if (readingMode === 'scroll') {
            scrollToPageIndex(currentScrollIdx + delta, true);
        } else {
            renderPagedImage(currentPageIndex + delta);
        }
    }

    function scrollToPageIndex(index, smooth) {
        const i = clamp(index, 0, totalPages - 1);
        currentScrollIdx = i;
        currentPageIndex = i;
        updatePageIndicator();
        scrollPageEls[i]?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    }

    function restartComic() {
        currentPageIndex = 0;
        currentScrollIdx = 0;
        if (readingMode === 'scroll') scrollToPageIndex(0, false);
        else renderPagedImage(0);
        updatePageIndicator();
    }

    function updatePageIndicator() {
        const idx   = readingMode === 'scroll' ? currentScrollIdx : currentPageIndex;
        const label = totalPages === 0 ? '0 / 0' : `${idx + 1} / ${totalPages}`;
        if (pageIndicatorEl)  pageIndicatorEl.textContent  = label;
        if (dockPageIndicator) dockPageIndicator.textContent = label;
    }

    /* ── lightGallery setup ───────────────────────────────────────────── */
    function buildLightboxLinks() {
        if (!lightboxLinksEl) return;
        lightboxLinksEl.innerHTML = '';
        pageUrls.forEach((url, i) => {
            const a = document.createElement('a');
            a.href  = url;
            a.setAttribute('aria-label', `Page ${i + 1}`);
            lightboxLinksEl.appendChild(a);
        });
    }

    function initGallery() {
        if (!lightboxLinksEl || typeof window.lightGallery !== 'function') return;
        if (lgInstance) { lgInstance.destroy(true); lgInstance = null; }

        /* [FIX] lightGallery v2 API — plugins array, correct event name */
        lgInstance = window.lightGallery(lightboxLinksEl, {
            selector: 'a',
            plugins: [window.lgZoom, window.lgFullscreen, window.lgThumbnail,
                      window.lgAutoplay, window.lgRotate],
            zoom: true, download: false, enableSwipe: true,
            thumbnail: true, animateThumb: true, showThumbByDefault: true,
            autoplay: false, rotate: true
        });

        /* [FIX] lgAfterSlide — v1 used onAfterSlide */
        lightboxLinksEl.removeEventListener('lgAfterSlide', onLgSlide);
        lightboxLinksEl.addEventListener('lgAfterSlide', onLgSlide);
    }

    function onLgSlide(e) {
        const i = e.detail.index;
        currentPageIndex = i;
        currentScrollIdx = i;
        updatePageIndicator();
    }

    /* ── Click paged image → open lightbox ────────────────────────────── */
    pagedImageLinkEl?.addEventListener('click', (event) => {
        if (!lightboxLinksEl?.children.length) return;
        event.preventDefault();
        lightboxLinksEl.children[currentPageIndex]?.click();
    });

    /* ══════════════════════════════════════════════════════════════════════
       RESET & CLEANUP
    ══════════════════════════════════════════════════════════════════════ */
    function resetReader() {
        pageUrls       = [];
        totalPages     = 0;
        pagesLoaded    = 0;
        currentPageIndex = 0;
        currentScrollIdx = 0;
        scrollPageEls  = [];
        scrollEdgeData = [];
        visibilityRatios = new Map();
        scrollModeReady  = false;
        dockAutoHidden   = false;
        if (scrollSaveTimer) { clearTimeout(scrollSaveTimer); scrollSaveTimer = null; }
        clearScrollObservers();
        if (lightboxLinksEl)   lightboxLinksEl.innerHTML  = '';
        if (scrollContainerEl) scrollContainerEl.innerHTML = '';
        if (pagedImageEl)      pagedImageEl.removeAttribute('src');
        if (pagedContainerEl)  pagedContainerEl.style.display = 'block';
        if (scrollContainerEl) {
            scrollContainerEl.style.display      = 'none';
            scrollContainerEl.style.paddingBottom = '';
        }
        if (webtoonDockEl) {
            webtoonDockEl.style.display = 'none';
            webtoonDockEl.classList.remove('auto-hidden');
        }
        outputEl.classList.remove('scroll-mode');
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
            readerMetaEl.textContent = '';  // clear first [SEC]
            const span = document.createElement('span');
            span.style.color = '#ef4444';
            span.textContent = msg;         // [SEC] textContent only
            readerMetaEl.appendChild(span);
        }
        if (readerToolbarEl) readerToolbarEl.style.display = 'none';
    }

    /* ══════════════════════════════════════════════════════════════════════
       VALIDATION & UTILITIES
    ══════════════════════════════════════════════════════════════════════ */
    function validateFile(file) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!ALLOWED_EXT.has(ext))
            return `Unsupported file type "${ext}". Please use .cbr, .cbz, or .cbt.`;
        if (file.size > MAX_FILE_BYTES)
            return `File too large (${fmtBytes(file.size)}). Maximum is 1 GB.`;
        return null;
    }

    function getExt(filename) {
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    function getMIME(filename) {
        const map = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
            gif: 'image/gif',  bmp: 'image/bmp',   webp: 'image/webp',
            avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff'
        };
        return map[getExt(filename)] || 'image/jpeg';
    }

    /* [DHL] naturalCompare — chunk-based numeric sort */
    function naturalCompare(a, b) {
        const ax = String(a).toLowerCase().match(/\d+|\D+/g) || [];
        const bx = String(b).toLowerCase().match(/\d+|\D+/g) || [];
        const len = Math.min(ax.length, bx.length);
        for (let i = 0; i < len; i++) {
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
