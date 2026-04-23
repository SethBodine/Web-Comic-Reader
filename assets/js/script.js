/**
 * Web Comic Reader — script.js
 *
 * MERGE CHANGELOG v2.2.0
 * ──────────────────────────────────────────────────────────────────────────
 * Base: DHLKeyuser/Web-Comic-Reader @ cursor/-bc-44021c6b-c202-4236-b537-cf4f28d6e683-cd26
 * Diff base: afzafri/Web-Comic-Reader@master
 *
 * All reader-engine features ported FROM DHLKeyuser fork (credited below):
 *   [DHL] Dual reading mode: Paged (single image) + Webtoon/Scroll (continuous)
 *   [DHL] Mode persisted in localStorage (READER_MODE_KEY)
 *   [DHL] Per-chapter progress: pageIndex, scrollRatio, webtoonZoom, lastRead
 *         stored under CHAPTER_PROGRESS_KEY (separate key from comic_reader_userpref)
 *   [DHL] Webtoon dock: fixed bottom bar, collapses/expands, auto-hides on scroll-down
 *   [DHL] Zoom controls for scroll mode (10%–200%, persisted)
 *   [DHL] Smart gap removal: canvas-based whitespace detection trims borders
 *         between pages whose edges are >92% white
 *   [DHL] IntersectionObserver lazy-load for scroll-mode images
 *   [DHL] IntersectionObserver visibility tracking → currentScrollIndex
 *   [DHL] Keyboard navigation: ArrowLeft/Right
 *   [DHL] Chapter navigation (prev/next within library), floating next-chapter button
 *   [DHL] Auto-advance: optional timer to jump next chapter at scroll end
 *   [DHL] Series grouping: comics grouped by parsed series key, accordion UI
 *   [DHL] Per-chapter progress bars in series list and recent list
 *   [DHL] naturalCompare() — numeric-aware sort (beats simple localeCompare)
 *   [DHL] parseSeriesKey() / formatSeriesTitle() — heuristic filename parser
 *   [DHL] Settings panel: default mode, auto-advance, reset progress
 *   [DHL] Restart chapter button
 *   [DHL] formatProgressLabel() / getProgressPercent() / getLatestSeriesProgress()
 *   [DHL] Scroll ratio persistence (scrollRatio) for mid-chapter resume
 *   [DHL] restoreScrollRatio() with rAF + 250ms fallback for reliable restore
 *   [DHL] openComic() options.fromLibrary flag → chapter context tracking
 *   [DHL] Dock tap-to-toggle: tapping centre of scroll area opens/closes dock
 *   [DHL] updateDockPadding() — CSS var --dock-safe-offset prevents content
 *         being obscured by the fixed dock
 *
 * Security patches applied ON TOP of DHLKeyuser base (our additions):
 *   [SEC] XSS: all innerHTML that interpolates user-controlled filenames
 *         replaced with textContent / DOM API in buildComicItem(),
 *         showLibraryMode(), error display — see comments inline
 *   [SEC] safeReadHistory(): validates localStorage before use; thumbnail
 *         must be data:image/jpeg;base64,... only
 *   [SEC] validateFile(): extension allowlist + 1 GB cap before any parsing
 *   [SEC] Blob URL tracking: revokeAllBlobs() called on comic open;
 *         individual URLs revoked in img.onload/onerror
 *   [SEC] IDB version bumped to 2: stale handles cleared on upgrade
 *   [SEC] Dropzone.autoDiscover = false set unconditionally before new Dropzone()
 *   [SEC] showLibraryMode folder name built via DOM API (not innerHTML)
 *
 * Large-file additions (our additions, not in DHLKeyuser fork):
 *   [LRG] readFileChunked(): 64 MiB chunk reads for files > 100 MB
 *   [LRG] Chunk progress bar (#chunkBar) driven by onProgress callback
 *   [LRG] Files ≤ 100 MB use archiveOpenFile() directly (fast path)
 *   [LRG] Files > 100 MB use chunked read → archiveOpenArrayBuffer()
 *         with Promise handling for ZIP vs sync for RAR/TAR
 *
 * Intentionally OMITTED from DHLKeyuser fork (hosted library excluded):
 *   [SKIP] HostedLibrary / hosted-library.js — server-side manifest required
 *   [SKIP] #hostedLibraryView — no server-side storage in this fork
 *   [SKIP] generate-library.sh
 *   [SKIP] initHostedLibrary(), showHostedLibraryMode(), openComicFromHostedLibrary()
 *   [SKIP] loadHostedAllComics(), loadHostedRecentComics(), renderHostedSeriesLibrary()
 * ──────────────────────────────────────────────────────────────────────────
 */
'use strict';

/* ── Security / large-file constants ────────────────────────────────────── */
const MAX_FILE_BYTES       = 1 * 1024 * 1024 * 1024;  // 1 GB
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024;         // 100 MB → chunked read
const CHUNK_SIZE           = 64 * 1024 * 1024;          // 64 MB per chunk
const ALLOWED_EXT          = new Set(['.cbr', '.cbz', '.cbt']);

document.addEventListener('DOMContentLoaded', () => {

    const outputElement = document.getElementById('output');
    const progressTextElement = document.querySelector('.progress-text');
    const sePreConElement = document.querySelector('.se-pre-con');
    const currYearElement = document.getElementById('currYear');
    const wrapElement = document.querySelector('.wrap');
    const collapseBtn = document.getElementById('collapseBtn');
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    const quickReadBtn = document.getElementById('quickReadBtn');
    const toggleUploadBtn = document.getElementById('toggleUploadBtn');
    const backToLibraryBtn = document.getElementById('backToLibraryBtn');
    const recentComicsEl = document.getElementById('recentComics');
    const recentComicsListEl = document.getElementById('recentComicsList');
    const allComicsEl = document.getElementById('allComics');
    const allComicsListEl = document.getElementById('allComicsList');
    const dividerOrEl = document.getElementById('dividerOr');
    const dropzoneEl = document.getElementById('dropzone');
    const initialViewEl = document.getElementById('initialView');
    const libraryViewEl = document.getElementById('libraryView');
    const quickReadViewEl = document.getElementById('quickReadView');
    const footerCollapsedTextEl = document.getElementById('footerCollapsedText');
    const browserNoticeEl = document.getElementById('browserNotice');
    const hostedLibraryViewEl = document.getElementById('hostedLibraryView');
    const hostedSelectFolderBtn = document.getElementById('hostedSelectFolderBtn');
    const hostedFolderDivider = document.getElementById('hostedFolderDivider');
    const hostedQuickReadBtn = document.getElementById('hostedQuickReadBtn');
    const hostedSettingsToggleBtn = document.getElementById('hostedSettingsToggleBtn');
    const hostedSettingsPanelEl = document.getElementById('hostedSettingsPanel');
    const hostedDefaultModeSelectEl = document.getElementById('hostedDefaultModeSelect');
    const hostedAutoAdvanceToggleEl = document.getElementById('hostedAutoAdvanceToggle');
    const hostedResetProgressBtn = document.getElementById('hostedResetProgressBtn');
    const hostedRecentComicsEl = document.getElementById('hostedRecentComics');
    const hostedRecentComicsListEl = document.getElementById('hostedRecentComicsList');
    const hostedAllComicsEl = document.getElementById('hostedAllComics');
    const hostedAllComicsListEl = document.getElementById('hostedAllComicsList');
    const changeFolderBtn = document.getElementById('changeFolderBtn');
    const currentFolderNameEl = document.getElementById('currentFolderName');
    const readerToolbarEl = document.getElementById('readerToolbar');
    const readerMetaEl = document.getElementById('readerMeta');
    const pagedContainerEl = document.getElementById('pagedContainer');
    const pagedImageLinkEl = document.getElementById('pagedImageLink');
    const pagedImageEl = document.getElementById('pagedImage');
    const lightboxLinksEl = document.getElementById('lightboxLinks');
    const scrollContainerEl = document.getElementById('scrollContainer');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageIndicatorEl = document.getElementById('pageIndicator');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomLevelEl = document.getElementById('zoomLevel');
    const smartGapToggleEl = document.getElementById('smartGapToggle');
    const webtoonDockEl = document.getElementById('webtoonDock');
    const dockToggleBtn = document.getElementById('dockToggleBtn');
    const dockPageIndicatorEl = document.getElementById('dockPageIndicator');
    const dockContentEl = document.getElementById('webtoonDockContent');
    const prevChapterBtn = document.getElementById('prevChapterBtn');
    const nextChapterBtn = document.getElementById('nextChapterBtn');
    const dockPrevChapterBtn = document.getElementById('dockPrevChapterBtn');
    const dockNextChapterBtn = document.getElementById('dockNextChapterBtn');
    const nextChapterFloatBtn = document.getElementById('nextChapterFloat');
    const chapterGroupEl = document.querySelector('.chapter-group');
    const settingsToggleBtn = document.getElementById('settingsToggleBtn');
    const settingsPanelEl = document.getElementById('settingsPanel');
    const defaultModeSelectEl = document.getElementById('defaultModeSelect');
    const autoAdvanceToggleEl = document.getElementById('autoAdvanceToggle');
    const resetProgressBtn = document.getElementById('resetProgressBtn');
    const restartChapterBtn = document.getElementById('restartChapterBtn');
    const modeButtons = document.querySelectorAll('[data-reading-mode]');

    let comicsDirectoryHandle = null;
    let isLibraryMode = false;
    let isHostedLibraryMode = false;

    // current year
    currYearElement.innerHTML = (new Date()).getFullYear();

    // check if File System Access API is supported
    const supportsFileSystemAccess = 'showDirectoryPicker' in window;

    if (supportsFileSystemAccess) {
        selectFolderBtn.style.display = 'flex';
        dividerOrEl.style.display = 'block';
    }

    // Load all the archive formats
    loadArchiveFormats(['rar', 'zip', 'tar']);

    // click on collapsed footer to expand
    document.querySelector('.footer-collapsed').addEventListener('click', async () => {
        wrapElement.classList.remove('collapsed');
        if (isHostedLibraryMode) {
            await showHostedLibraryMode();
        } else if (isLibraryMode && comicsDirectoryHandle) {
            const permission = await comicsDirectoryHandle.queryPermission({ mode: 'read' });
            if (permission === 'granted') {
                showLibraryMode();
            } else {
                showReconnectButton();
            }
        } else if (!isLibraryMode) {
            showQuickReadMode();
        } else {
            initialViewEl.style.display = 'block';
            libraryViewEl.style.display = 'none';
            if (hostedLibraryViewEl) hostedLibraryViewEl.style.display = 'none';
            quickReadViewEl.style.display = 'none';
        }
    });

    // click collapse button to hide uploader
    collapseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        wrapElement.classList.add('collapsed');
    });

    // select comics folder
    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', async () => {
            try {
                // if we already have a handle, try to request permission first
                if (comicsDirectoryHandle) {
                    const permission = await comicsDirectoryHandle.requestPermission({ mode: 'read' });
                    if (permission === 'granted') {
                        await showLibraryMode();
                        return;
                    }
                }

                // show directory picker
                const dirHandle = await window.showDirectoryPicker({
                    mode: 'read'
                });

                // explicitly request persistent permission
                const permission = await dirHandle.requestPermission({ mode: 'read' });
                if (permission !== 'granted') {
                    console.error('Permission not granted');
                    return;
                }

                comicsDirectoryHandle = dirHandle;
                await saveDirectoryHandle(dirHandle);
                await showLibraryMode();
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Error selecting folder:', err);
                }
            }
        });
    }

    // quick read button
    if (quickReadBtn) {
        quickReadBtn.addEventListener('click', () => {
            showQuickReadMode();
        });
    }

    // toggle upload button
    if (toggleUploadBtn) {
        toggleUploadBtn.addEventListener('click', () => {
            showQuickReadMode();
        });
    }

    // back to library button
    if (backToLibraryBtn) {
        backToLibraryBtn.addEventListener('click', async () => {
            if (isHostedLibraryMode) {
                await showHostedLibraryMode();
            } else if (comicsDirectoryHandle) {
                const permission = await comicsDirectoryHandle.queryPermission({ mode: 'read' });
                if (permission === 'granted') {
                    await showLibraryMode();
                } else {
                    try {
                        const newPermission = await comicsDirectoryHandle.requestPermission({ mode: 'read' });
                        if (newPermission === 'granted') {
                            await showLibraryMode();
                        } else {
                            showReconnectButton();
                        }
                    } catch (err) {
                        console.error('Failed to request permission:', err);
                        showReconnectButton();
                    }
                }
            }
        });
    }

    // change folder button
    if (changeFolderBtn) {
        changeFolderBtn.addEventListener('click', async () => {
            try {
                // always show directory picker to select a new folder
                const dirHandle = await window.showDirectoryPicker({
                    mode: 'read'
                });

                // explicitly request persistent permission
                const permission = await dirHandle.requestPermission({ mode: 'read' });
                if (permission !== 'granted') {
                    console.error('Permission not granted');
                    return;
                }

                comicsDirectoryHandle = dirHandle;
                await saveDirectoryHandle(dirHandle);
                await showLibraryMode();
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Error selecting folder:', err);
                }
            }
        });
    }

    // load directory handle on startup, then fall back to hosted library
    if (supportsFileSystemAccess) {
        loadDirectoryHandle().then(async (result) => {
            if (result.handle && result.hasPermission) {
                comicsDirectoryHandle = result.handle;
                await showLibraryMode();
            } else if (result.handle && !result.hasPermission) {
                comicsDirectoryHandle = result.handle;
                showReconnectButton();
            } else {
                await initHostedLibrary();
            }
        });
    } else {
        initHostedLibrary();
    }

    function showReconnectButton() {
        // show initial view with modified button text
        initialViewEl.style.display = 'block';
        libraryViewEl.style.display = 'none';
        quickReadViewEl.style.display = 'none';

        // change button text to indicate reconnection
        const titleEl = selectFolderBtn.querySelector('.btn-title');
        const subtitleEl = selectFolderBtn.querySelector('.btn-subtitle');
        if (titleEl && subtitleEl) {
            titleEl.textContent = 'Reconnect to Comics Folder';
            subtitleEl.textContent = 'Click to restore access to your library';
        }
    }

    async function showLibraryMode() {
        if (!comicsDirectoryHandle) return;

        isLibraryMode = true;
        isHostedLibraryMode = false;
        initialViewEl.style.display = 'none';
        libraryViewEl.style.display = 'block';
        if (hostedLibraryViewEl) hostedLibraryViewEl.style.display = 'none';
        quickReadViewEl.style.display = 'none';
        footerCollapsedTextEl.textContent = 'Show library';

        // [SEC v2.1.0] Build folder name via DOM API — not innerHTML — to prevent XSS
        // if a directory name contained HTML special characters.
        if (currentFolderNameEl && comicsDirectoryHandle.name) {
            currentFolderNameEl.textContent = '';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 16 16');
            svg.setAttribute('fill', 'currentColor');
            svg.setAttribute('aria-hidden', 'true');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z');
            svg.appendChild(path);
            currentFolderNameEl.appendChild(svg);
            currentFolderNameEl.appendChild(document.createTextNode(' ' + comicsDirectoryHandle.name));
        }

        // reset button text in case it was changed
        const titleEl = selectFolderBtn.querySelector('.btn-title');
        const subtitleEl = selectFolderBtn.querySelector('.btn-subtitle');
        if (titleEl && subtitleEl) {
            titleEl.textContent = 'Select Comics Folder';
            subtitleEl.textContent = 'Auto-track progress, browse all comics';
        }

        await loadRecentComics();
        await loadAllComics();

        if (recentComicsListEl.children.length > 0) {
            recentComicsEl.style.display = 'block';
        }
        allComicsEl.style.display = 'block';
    }

    function showQuickReadMode() {
        isLibraryMode = false;
        initialViewEl.style.display = 'none';
        libraryViewEl.style.display = 'none';
        if (hostedLibraryViewEl) hostedLibraryViewEl.style.display = 'none';
        quickReadViewEl.style.display = 'block';
        footerCollapsedTextEl.textContent = 'Upload another file';

        if (selectFolderBtn) {
            const titleEl = selectFolderBtn.querySelector('.btn-title');
            const subtitleEl = selectFolderBtn.querySelector('.btn-subtitle');
            if (titleEl && subtitleEl) {
                titleEl.textContent = 'Select Comics Folder';
                subtitleEl.textContent = 'Auto-track progress, browse all comics';
            }
        }

        if (backToLibraryBtn) {
            backToLibraryBtn.style.display = (comicsDirectoryHandle || isHostedLibraryMode) ? 'block' : 'none';
        }
    }

    async function loadAllComics() {
        if (!comicsDirectoryHandle) return;

        try {
            // check permission before accessing
            const permission = await comicsDirectoryHandle.queryPermission({ mode: 'read' });
            if (permission !== 'granted') {
                allComicsListEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 20px; font-size: 14px;">Permission required to access folder</div>';
                return;
            }

            allComicsListEl.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="spinner" style="margin: 0 auto;"></div><div style="margin-top: 12px; color: var(--muted); font-size: 14px;">Scanning folder...</div></div>';

            const comics = [];
            const validExtensions = ['.cbr', '.cbz', '.cbt'];

            for await (const entry of comicsDirectoryHandle.values()) {
                if (entry.kind === 'file') {
                    const ext = '.' + entry.name.split('.').pop().toLowerCase();
                    if (validExtensions.includes(ext)) {
                        comics.push(entry.name);
                    }
                }
            }

            allComicsListEl.innerHTML = '';

            if (comics.length === 0) {
                allComicsListEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 20px; font-size: 14px;">No comics found in this folder. Make sure your comics have .cbr, .cbz, or .cbt extension.</div>';
                return;
            }

            comics.sort(naturalCompare);
            const seriesList = buildSeriesGroups(comics);
            libraryComicList = seriesList.flatMap(series => series.chapters);
            updateChapterContext(currentComicFilename, currentChapterFromLibrary);
            renderSeriesLibrary(seriesList);
        } catch (err) {
            console.error('Failed to load all comics:', err);
            
            if (err.name === 'NotFoundError') {
                const folderName = comicsDirectoryHandle ? comicsDirectoryHandle.name : 'directory';
                
                allComicsListEl.innerHTML = '';
                
                const errorWrapper = document.createElement('div');
                errorWrapper.style.textAlign = 'center';
                errorWrapper.style.padding = '40px 20px';
                
                errorWrapper.innerHTML = `
                    <div style="margin-bottom: 10px; color: var(--text);">Failed to load comics from "<strong>${folderName}</strong>"</div>
                    <div style="margin-bottom: 25px; color: var(--muted); font-size: 14px;">The folder might have been moved, renamed, or deleted.</div>
                `;
                
                // Clone the main select button to reuse its exact style
                if (selectFolderBtn) {
                    const btnClone = selectFolderBtn.cloneNode(true);
                    btnClone.id = ''; // Remove ID
                    btnClone.style.display = 'inline-flex';
                    btnClone.style.margin = '0 auto';
                    
                    // Re-attach click handler to trigger original button
                    btnClone.addEventListener('click', () => {
                        selectFolderBtn.click();
                    });
                    
                    errorWrapper.appendChild(btnClone);
                }
                
                allComicsListEl.appendChild(errorWrapper);
                
                // Clear the invalid handle from memory
                comicsDirectoryHandle = null;
            } else {
                allComicsListEl.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 20px; font-size: 14px;">Error loading comics from folder</div>';
            }
        }
    }

    function buildSeriesGroups(comics) {
        const seriesMap = new Map();
        comics.forEach((filename) => {
            const seriesKey = parseSeriesKey(filename);
            const seriesTitle = formatSeriesTitle(filename, seriesKey);
            if (!seriesMap.has(seriesKey)) {
                seriesMap.set(seriesKey, {
                    key: seriesKey,
                    title: seriesTitle,
                    chapters: []
                });
            }
            seriesMap.get(seriesKey).chapters.push(filename);
        });

        const seriesList = Array.from(seriesMap.values());
        seriesList.forEach((series) => {
            series.chapters.sort(naturalCompare);
        });
        seriesList.sort((a, b) => naturalCompare(a.title, b.title));
        return seriesList;
    }

    function renderSeriesLibrary(seriesList) {
        if (!allComicsListEl) return;

        const progressStore = loadProgressStore();
        allComicsListEl.innerHTML = '';
        allComicsListEl.classList.add('series-list');

        seriesList.forEach((series) => {
            const seriesWrapper = document.createElement('div');
            seriesWrapper.className = 'series-item';
            const latest = getLatestSeriesProgress(series.chapters, progressStore);
            const latestLabel = latest
                ? `${series.chapters.length} chapters • ${latest.filename} • ${formatTimestamp(latest.progress.lastRead)}`
                : `${series.chapters.length} chapters`;

            seriesWrapper.innerHTML = `
                <button class="series-header" aria-expanded="false">
                    <div>
                        <div class="series-title">${series.title}</div>
                        <div class="series-meta">${latestLabel}</div>
                    </div>
                    <span class="series-toggle">▾</span>
                </button>
                <div class="series-chapters"></div>
            `;

            const headerBtn = seriesWrapper.querySelector('.series-header');
            const chaptersEl = seriesWrapper.querySelector('.series-chapters');
            headerBtn.addEventListener('click', () => {
                const expanded = seriesWrapper.classList.toggle('expanded');
                headerBtn.setAttribute('aria-expanded', expanded.toString());
            });

            series.chapters.forEach((filename) => {
                const chapterProgress = progressStore[filename];
                const progressPercent = getProgressPercent(chapterProgress);
                const chapterRow = document.createElement('div');
                chapterRow.className = 'series-chapter';
                chapterRow.innerHTML = `
                    <div class="series-chapter-title">${filename}</div>
                    <div class="series-chapter-meta">${formatProgressLabel(chapterProgress)}</div>
                    <div class="progress-bar"><div class="progress-bar-fill" style="width: ${progressPercent}%"></div></div>
                `;
                chapterRow.addEventListener('click', () => openComicFromFolder(filename));
                chaptersEl.appendChild(chapterRow);
            });

            allComicsListEl.appendChild(seriesWrapper);
        });
    }

    // [FIX v2.1.0] autoDiscover disabled unconditionally before new Dropzone()
    // The original guard `if (window.Dropzone)` ran before vendor script evaluated in some browsers.
    Dropzone.autoDiscover = false;
    let dropzone = new Dropzone("#dropzone", {
        url: '#',
        acceptedFiles: '.cbr,.cbz,.cbt',
        createImageThumbnails: false,
        autoProcessQueue: false,
        previewsContainer: false,
        maxFiles: 1,
        maxfilesexceeded: function(file) {
            this.removeAllFiles();
        },
        init: function () {
            this.on('addedfile', function (file) {
                // [SEC v2.1.0] Validate before processing
                const err = validateFile(file);
                if (err) { showReaderError(err); this.removeAllFiles(); return; }
                // [LRG v2.0.0] Show large-file warning banner
                const warningEl = document.getElementById('fileSizeWarning');
                if (warningEl) warningEl.style.display = file.size > LARGE_FILE_THRESHOLD ? 'block' : 'none';
                openComic(file);
            });
        }
    });

    let currentComicFilename = '';
    let lightGalleryInstance = null;
    const READER_MODE_KEY = 'readerMode';
    const SCROLL_ZOOM_KEY = 'scrollZoom';
    const SMART_GAP_KEY = 'scrollSmartGap';
    const WEBTOON_DOCK_KEY = 'webtoonDockCollapsed';
    const CHAPTER_PROGRESS_KEY = 'comicChapterProgress';
    const SETTINGS_KEY = 'comicReaderSettings';
    const DEFAULT_SETTINGS = {
        defaultMode: 'scroll',
        autoAdvance: false
    };
    const SCROLL_ZOOM_MIN = 0.1;
    const SCROLL_ZOOM_MAX = 2;
    const BASE_SCROLL_WIDTH_VW = 90;
    const AUTO_ADVANCE_THRESHOLD = 400;
    const AUTO_ADVANCE_DELAY = 1000;
    const AUTO_ADVANCE_IDLE = 250;

    let readerSettings = loadReaderSettings();
    let readingMode = localStorage.getItem(READER_MODE_KEY) || readerSettings.defaultMode;
    readingMode = readingMode === 'scroll' || readingMode === 'paged' ? readingMode : readerSettings.defaultMode;
    let scrollZoom = parseFloat(localStorage.getItem(SCROLL_ZOOM_KEY)) || 1;
    scrollZoom = clamp(scrollZoom, SCROLL_ZOOM_MIN, SCROLL_ZOOM_MAX);
    let smartGapEnabled = localStorage.getItem(SMART_GAP_KEY) === 'true';
    let dockCollapsed = localStorage.getItem(WEBTOON_DOCK_KEY) === 'true';
    let autoAdvanceEnabled = Boolean(readerSettings.autoAdvance);
    let libraryComicList = [];
    let currentChapterIndex = -1;
    let currentChapterFromLibrary = false;
    let autoAdvanceTimer = null;
    let autoAdvanceVisible = false;
    let scrollIdleTimer = null;
    let lastScrollY = window.scrollY;
    let dockAutoHidden = false;
    let pendingScrollRestoreRatio = null;
    let pendingChapterPrefs = null;
    let scrollProgressTimer = null;
    let pageUrls = [];
    let pageLinks = [];
    let totalPages = 0;
    let pagesLoaded = 0;
    let currentPageIndex = 0;
    let currentScrollIndex = 0;
    let scrollPageElements = [];
    let scrollEdgeData = [];
    let lazyObserver = null;
    let visibilityObserver = null;
    let visibilityRatios = new Map();
    let scrollModeReady = false;
    let scrollSaveTimeout = null;
    const readerToolbarHome = readerToolbarEl ? readerToolbarEl.parentNode : null;
    const readerToolbarAnchor = readerMetaEl || null;

    initializeReaderControls();

    function openComic(file, options = {}) {
        outputElement.style.display = 'none';
        wrapElement.classList.add('collapsed');
        collapseBtn.classList.add('show');
        currentComicFilename = file.name;
        currentChapterFromLibrary = options.fromLibrary === true;
        updateChapterContext(currentComicFilename, currentChapterFromLibrary);
        progressTextElement.innerHTML = "Reading 0/0 pages";
        sePreConElement.style.display = 'block';

        if (readerToolbarEl) readerToolbarEl.style.display = 'none';

        if (lightGalleryInstance) {
            lightGalleryInstance.destroy(true);
            lightGalleryInstance = null;
        }

        clearBlobs();
        resetReaderView();

        // [LRG v2.0.0] Show chunk progress bar for large files
        const chunkProgressEl = document.getElementById('chunkProgress');
        const chunkBarEl      = document.getElementById('chunkBar');
        const chunkLabelEl    = document.getElementById('chunkLabel');
        if (chunkProgressEl) {
            chunkProgressEl.style.display = file.size > LARGE_FILE_THRESHOLD ? 'block' : 'none';
        }

        if (file.size <= LARGE_FILE_THRESHOLD) {
            // Fast path: use archiveOpenFile (callback-based, works for all formats)
            archiveOpenFile(file, (archive, err) => {
                if (chunkProgressEl) chunkProgressEl.style.display = 'none';
                if (archive) {
                    readContents(archive, archive.file_name);
                } else {
                    showReaderError(err);
                }
            });
        } else {
            // [LRG v2.0.0] Chunked read path for files > 100 MB
            readFileChunked(file,
                (arrayBuffer) => {
                    if (chunkProgressEl) chunkProgressEl.style.display = 'none';
                    try {
                        const result = archiveOpenArrayBuffer(file.name, arrayBuffer);
                        const handle = (archive) => readContents(archive, archive.file_name);
                        (result && typeof result.then === 'function')
                            ? result.then(handle).catch(e => showReaderError(e.message || String(e)))
                            : handle(result);
                    } catch (e) {
                        showReaderError(e.message || String(e));
                    }
                },
                (bytesRead, total) => {
                    if (!chunkBarEl || !chunkLabelEl) return;
                    const pct = total > 0 ? Math.round((bytesRead / total) * 100) : 0;
                    chunkBarEl.style.width = pct + '%';
                    chunkLabelEl.textContent = `Loading ${fmtBytes(bytesRead)} / ${fmtBytes(total)} (${pct}%)`;
                }
            );
        }
    }

    // [LRG v2.0.0] Chunked FileReader — 64 MiB slices, keeps UI responsive
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
                    setTimeout(next, 0);
                } else {
                    const total    = chunks.reduce((a, c) => a + c.byteLength, 0);
                    const combined = new Uint8Array(total);
                    let pos = 0;
                    for (const chunk of chunks) { combined.set(new Uint8Array(chunk), pos); pos += chunk.byteLength; }
                    onComplete(combined.buffer);
                }
            };
            reader.onerror = () => showReaderError('Failed to read file chunk.');
            reader.readAsArrayBuffer(file.slice(offset, end));
        }
        next();
    }

    // [SEC v2.1.0] File validation before any archive parsing
    function validateFile(file) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!ALLOWED_EXT.has(ext)) return `Unsupported file type "${ext}". Use .cbr, .cbz, or .cbt.`;
        if (file.size > MAX_FILE_BYTES) return `File too large (${fmtBytes(file.size)}). Max is 1 GB.`;
        return null;
    }

    function fmtBytes(b) {
        if (b >= 1073741824) return (b/1073741824).toFixed(1) + ' GB';
        if (b >= 1048576)    return (b/1048576).toFixed(1) + ' MB';
        return (b/1024).toFixed(0) + ' KB';
    }

    function initializeReaderControls() {
        if (smartGapToggleEl) {
            smartGapToggleEl.checked = smartGapEnabled;
        }
        if (webtoonDockEl) {
            updateDockState();
        }

        initializeSettingsPanel();

        updateModeButtons();
        applyScrollZoom();
        updateZoomControls();

        modeButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                setReadingMode(btn.dataset.readingMode);
            });
        });

        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => goToRelativePage(-1));
        }
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => goToRelativePage(1));
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => adjustScrollZoom(-0.1));
        }
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => adjustScrollZoom(0.1));
        }
        if (smartGapToggleEl) {
            smartGapToggleEl.addEventListener('change', () => {
                smartGapEnabled = smartGapToggleEl.checked;
                localStorage.setItem(SMART_GAP_KEY, smartGapEnabled.toString());
                applySmartGapState();
            });
        }
        if (dockToggleBtn) {
            dockToggleBtn.addEventListener('click', () => {
                setDockCollapsed(!dockCollapsed);
            });
        }
        if (prevChapterBtn) {
            prevChapterBtn.addEventListener('click', () => goToPreviousChapter());
        }
        if (nextChapterBtn) {
            nextChapterBtn.addEventListener('click', () => goToNextChapter());
        }
        if (dockPrevChapterBtn) {
            dockPrevChapterBtn.addEventListener('click', () => goToPreviousChapter());
        }
        if (dockNextChapterBtn) {
            dockNextChapterBtn.addEventListener('click', () => goToNextChapter());
        }
        if (nextChapterFloatBtn) {
            nextChapterFloatBtn.addEventListener('click', () => goToNextChapter());
        }
        if (restartChapterBtn) {
            restartChapterBtn.addEventListener('click', () => restartChapter());
        }
        if (pagedImageLinkEl) {
            pagedImageLinkEl.addEventListener('click', (event) => {
                if (!pageLinks.length) {
                    return;
                }
                event.preventDefault();
                const link = pageLinks[currentPageIndex];
                if (link) {
                    link.click();
                }
            });
        }

        document.addEventListener('keydown', handleReaderKeydown);
        window.addEventListener('resize', () => updateDockPadding(), { passive: true });
        window.addEventListener('orientationchange', () => {
            setTimeout(updateDockPadding, 80);
        });
        window.addEventListener('scroll', handleWindowScroll, { passive: true });
        window.addEventListener('beforeunload', () => saveCurrentChapterProgress());
        if (scrollContainerEl) {
            scrollContainerEl.addEventListener('click', handleScrollContainerTap);
        }
    }

    function initializeSettingsPanel() {
        if (defaultModeSelectEl) {
            defaultModeSelectEl.value = readerSettings.defaultMode;
            defaultModeSelectEl.addEventListener('change', () => {
                readerSettings.defaultMode = defaultModeSelectEl.value === 'paged' ? 'paged' : 'scroll';
                saveReaderSettings(readerSettings);
            });
        }
        if (autoAdvanceToggleEl) {
            autoAdvanceToggleEl.checked = Boolean(readerSettings.autoAdvance);
            autoAdvanceToggleEl.addEventListener('change', () => {
                readerSettings.autoAdvance = autoAdvanceToggleEl.checked;
                autoAdvanceEnabled = readerSettings.autoAdvance;
                saveReaderSettings(readerSettings);
            });
        }
        if (settingsToggleBtn && settingsPanelEl) {
            settingsToggleBtn.addEventListener('click', () => {
                const isHidden = settingsPanelEl.style.display === 'none' || settingsPanelEl.style.display === '';
                settingsPanelEl.style.display = isHidden ? 'flex' : 'none';
            });
        }
        if (resetProgressBtn) {
            resetProgressBtn.addEventListener('click', () => {
                const confirmed = window.confirm('Reset all reading progress? This cannot be undone.');
                if (confirmed) {
                    resetAllProgress();
                }
            });
        }
    }

    function updateDockState() {
        if (!webtoonDockEl) return;

        webtoonDockEl.classList.toggle('collapsed', dockCollapsed);
        webtoonDockEl.classList.toggle('expanded', !dockCollapsed);
        if (dockToggleBtn) {
            dockToggleBtn.setAttribute('aria-expanded', (!dockCollapsed).toString());
            dockToggleBtn.setAttribute('aria-label', dockCollapsed ? 'Expand Webtoon dock' : 'Collapse Webtoon dock');
        }
    }

    function setDockCollapsed(collapsed) {
        dockCollapsed = collapsed;
        localStorage.setItem(WEBTOON_DOCK_KEY, dockCollapsed.toString());
        updateDockState();
        setDockAutoHidden(false);
        requestAnimationFrame(updateDockPadding);
    }

    function updateDockPadding() {
        if (!scrollContainerEl) return;
        if (readingMode !== 'scroll' || !webtoonDockEl || webtoonDockEl.style.display === 'none') {
            scrollContainerEl.style.paddingBottom = '';
            document.documentElement.style.removeProperty('--dock-safe-offset');
            return;
        }

        const dockRect = webtoonDockEl.getBoundingClientRect();
        let safeHeight = dockRect.height;

        if (dockToggleBtn) {
            const toggleRect = dockToggleBtn.getBoundingClientRect();
            safeHeight = Math.max(safeHeight, toggleRect.height + 8);
        }

        scrollContainerEl.style.paddingBottom = `${Math.ceil(safeHeight)}px`;
        document.documentElement.style.setProperty('--dock-safe-offset', `${Math.ceil(safeHeight)}px`);
    }

    function updateChapterContext(filename, fromLibrary) {
        currentChapterFromLibrary = Boolean(fromLibrary);

        if (!currentChapterFromLibrary || !filename || libraryComicList.length === 0) {
            currentChapterIndex = -1;
            updateChapterButtons();
            return;
        }

        currentChapterIndex = libraryComicList.indexOf(filename);
        updateChapterButtons();
    }

    function updateChapterButtons() {
        const hasChapters = currentChapterFromLibrary && currentChapterIndex >= 0 && libraryComicList.length > 0;
        const hasPrev = hasChapters && currentChapterIndex > 0;
        const hasNext = hasChapters && currentChapterIndex < libraryComicList.length - 1;

        if (chapterGroupEl) {
            chapterGroupEl.style.display = hasChapters ? 'flex' : 'none';
        }

        setButtonState(prevChapterBtn, hasPrev, hasChapters);
        setButtonState(nextChapterBtn, hasNext, hasChapters);
        setButtonState(dockPrevChapterBtn, hasPrev, hasChapters);
        setButtonState(dockNextChapterBtn, hasNext, hasChapters);

        if (!hasNext) {
            hideNextChapterFloat();
        }
    }

    function setButtonState(button, enabled, visible) {
        if (!button) return;
        button.disabled = !enabled;
        button.style.display = visible ? 'inline-flex' : 'none';
    }

    function loadProgressStore() {
        try {
            return JSON.parse(localStorage.getItem(CHAPTER_PROGRESS_KEY) || '{}');
        } catch (e) {
            console.error('Failed to read chapter progress:', e);
            return {};
        }
    }

    function saveProgressStore(progress) {
        try {
            localStorage.setItem(CHAPTER_PROGRESS_KEY, JSON.stringify(progress));
        } catch (e) {
            console.error('Failed to save chapter progress:', e);
        }
    }

    function getChapterProgress(filename) {
        if (!filename) return null;
        const progress = loadProgressStore();
        return progress[filename] || null;
    }

    function saveChapterProgress(filename, overrides = {}) {
        if (!filename) return;

        const progress = loadProgressStore();
        const existing = progress[filename] || {};
        const mode = overrides.mode || (readingMode === 'scroll' ? 'webtoon' : 'paged');
        const pageIndex = typeof overrides.pageIndex === 'number'
            ? overrides.pageIndex
            : (mode === 'webtoon' ? currentScrollIndex : currentPageIndex);
        const scrollRatio = typeof overrides.scrollRatio === 'number'
            ? overrides.scrollRatio
            : (mode === 'webtoon' ? getScrollRatio() : null);
        const webtoonZoom = typeof overrides.webtoonZoom === 'number'
            ? overrides.webtoonZoom
            : (mode === 'webtoon' ? scrollZoom : existing.webtoonZoom);
        const pagedZoom = typeof overrides.pagedZoom === 'number'
            ? overrides.pagedZoom
            : (mode === 'paged' ? 1 : existing.pagedZoom);

        progress[filename] = {
            ...existing,
            mode,
            pageIndex,
            scrollRatio: scrollRatio != null ? clamp(scrollRatio, 0, 1) : null,
            webtoonZoom,
            pagedZoom,
            lastRead: Date.now(),
            pageCount: totalPages
        };

        saveProgressStore(progress);
    }

    function touchChapterProgress(filename, existingProgress) {
        if (!filename) return;
        saveChapterProgress(filename, {
            mode: existingProgress?.mode || (readingMode === 'scroll' ? 'webtoon' : 'paged'),
            pageIndex: typeof existingProgress?.pageIndex === 'number' ? existingProgress.pageIndex : currentPageIndex,
            scrollRatio: typeof existingProgress?.scrollRatio === 'number' ? existingProgress.scrollRatio : undefined,
            webtoonZoom: typeof existingProgress?.webtoonZoom === 'number' ? existingProgress.webtoonZoom : scrollZoom,
            pagedZoom: typeof existingProgress?.pagedZoom === 'number' ? existingProgress.pagedZoom : 1
        });
    }

    function goToNextChapter() {
        openAdjacentChapter(1);
    }

    function goToPreviousChapter() {
        openAdjacentChapter(-1);
    }

    function openAdjacentChapter(offset) {
        if (!currentChapterFromLibrary || currentChapterIndex < 0) return;
        const targetIndex = currentChapterIndex + offset;
        if (targetIndex < 0 || targetIndex >= libraryComicList.length) return;

        saveCurrentChapterProgress();
        pendingChapterPrefs = {
            mode: readingMode,
            webtoonZoom: scrollZoom
        };

        const targetFilename = libraryComicList[targetIndex];
        if (!targetFilename) return;
        if (isHostedLibraryMode) {
            openComicFromHostedLibrary(targetFilename);
        } else {
            openComicFromFolder(targetFilename);
        }
        hideNextChapterFloat();
    }

    function saveCurrentChapterProgress() {
        if (!currentComicFilename) return;
        const progressIndex = readingMode === 'scroll' ? currentScrollIndex : currentPageIndex;
        saveLastPageRead(currentComicFilename, progressIndex);
        if (readingMode === 'scroll') {
            saveChapterProgress(currentComicFilename, {
                pageIndex: progressIndex,
                scrollRatio: getScrollRatio(),
                webtoonZoom: scrollZoom
            });
        }
    }

    function restartChapter() {
        if (!currentComicFilename) return;
        clearChapterProgress(currentComicFilename);
        currentPageIndex = 0;
        currentScrollIndex = 0;
        if (readingMode === 'scroll') {
            scrollToScrollRatio(0);
        } else {
            renderPagedImage(0);
        }
        saveLastPageRead(currentComicFilename, 0);
        updatePageIndicator();
    }

    function handleWindowScroll() {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY;
        lastScrollY = currentY;

        if (readingMode !== 'scroll') {
            hideNextChapterFloat();
            cancelAutoAdvance();
            return;
        }

        handleDockAutoHide(delta);
        scheduleScrollProgressSave();
        cancelAutoAdvance();

        const hasNext = currentChapterFromLibrary && currentChapterIndex >= 0 && currentChapterIndex < libraryComicList.length - 1;
        if (!hasNext || !scrollPageElements.length) {
            hideNextChapterFloat();
            cancelAutoAdvance();
            return;
        }

        if (isNearBottomOfChapter()) {
            showNextChapterFloat();
            scheduleAutoAdvanceAfterIdle();
        } else {
            hideNextChapterFloat();
            cancelAutoAdvance();
        }
    }

    function isNearBottomOfChapter() {
        if (!scrollPageElements.length) return false;
        const lastPage = scrollPageElements[scrollPageElements.length - 1];
        const distanceToBottom = lastPage.getBoundingClientRect().bottom - window.innerHeight;
        return distanceToBottom <= AUTO_ADVANCE_THRESHOLD;
    }

    function scheduleAutoAdvanceAfterIdle() {
        if (!autoAdvanceEnabled) {
            cancelAutoAdvance();
            return;
        }
        if (scrollIdleTimer) {
            clearTimeout(scrollIdleTimer);
        }
        scrollIdleTimer = setTimeout(() => {
            scrollIdleTimer = null;
            if (!isNearBottomOfChapter()) {
                return;
            }
            if (autoAdvanceTimer) return;
            autoAdvanceTimer = setTimeout(() => {
                autoAdvanceTimer = null;
                goToNextChapter();
            }, AUTO_ADVANCE_DELAY);
        }, AUTO_ADVANCE_IDLE);
    }

    function handleDockAutoHide(delta) {
        if (!webtoonDockEl) return;
        if (Math.abs(delta) < 6) return;
        if (delta > 0) {
            setDockAutoHidden(true);
        } else if (delta < 0) {
            setDockAutoHidden(false);
        }
    }

    function setDockAutoHidden(hidden) {
        if (!webtoonDockEl) return;
        dockAutoHidden = hidden;
        webtoonDockEl.classList.toggle('auto-hidden', dockAutoHidden);
    }

    function handleScrollContainerTap(event) {
        if (readingMode !== 'scroll') return;
        if (event.target.closest('button, a, input, select, label, .webtoon-dock')) {
            return;
        }
        const xRatio = event.clientX / window.innerWidth;
        if (xRatio > 0.25 && xRatio < 0.75) {
            if (dockAutoHidden) {
                setDockAutoHidden(false);
                return;
            }
            setDockCollapsed(!dockCollapsed);
        }
    }

    function showNextChapterFloat() {
        if (!nextChapterFloatBtn) return;
        if (!autoAdvanceVisible) {
            nextChapterFloatBtn.style.display = 'inline-flex';
            autoAdvanceVisible = true;
        }
    }

    function hideNextChapterFloat() {
        if (!nextChapterFloatBtn) return;
        if (autoAdvanceVisible) {
            nextChapterFloatBtn.style.display = 'none';
            autoAdvanceVisible = false;
        }
        cancelAutoAdvance();
    }

    function scheduleAutoAdvance() {
        if (autoAdvanceTimer) return;
        autoAdvanceTimer = setTimeout(() => {
            autoAdvanceTimer = null;
            goToNextChapter();
        }, AUTO_ADVANCE_DELAY);
    }

    function cancelAutoAdvance() {
        if (autoAdvanceTimer) {
            clearTimeout(autoAdvanceTimer);
            autoAdvanceTimer = null;
        }
        if (scrollIdleTimer) {
            clearTimeout(scrollIdleTimer);
            scrollIdleTimer = null;
        }
    }

    function resetReaderView() {
        pageUrls = [];
        pageLinks = [];
        totalPages = 0;
        pagesLoaded = 0;
        currentPageIndex = 0;
        currentScrollIndex = 0;
        scrollPageElements = [];
        scrollEdgeData = [];
        visibilityRatios = new Map();
        scrollModeReady = false;
        pendingScrollRestoreRatio = null;
        pendingChapterPrefs = null;
        dockAutoHidden = false;

        if (scrollSaveTimeout) {
            clearTimeout(scrollSaveTimeout);
            scrollSaveTimeout = null;
        }
        if (scrollProgressTimer) {
            clearTimeout(scrollProgressTimer);
            scrollProgressTimer = null;
        }

        clearScrollObservers();

        if (lightboxLinksEl) {
            lightboxLinksEl.innerHTML = '';
        }
        if (scrollContainerEl) {
            scrollContainerEl.innerHTML = '';
        }
        if (pagedImageEl) {
            pagedImageEl.removeAttribute('src');
        }
        if (pagedContainerEl) {
            pagedContainerEl.style.display = 'block';
        }
        if (scrollContainerEl) {
            scrollContainerEl.style.display = 'none';
            scrollContainerEl.style.paddingBottom = '';
        }
        if (webtoonDockEl) {
            webtoonDockEl.style.display = 'none';
            webtoonDockEl.classList.remove('auto-hidden');
        }
        hideNextChapterFloat();
        if (readerToolbarHome && readerToolbarEl) {
            if (readerToolbarAnchor) {
                readerToolbarHome.insertBefore(readerToolbarEl, readerToolbarAnchor);
            } else {
                readerToolbarHome.appendChild(readerToolbarEl);
            }
        }
        if (readerMetaEl) {
            readerMetaEl.textContent = '';
        }

        outputElement.classList.remove('scroll-mode');
        updatePageIndicator();
    }

    function finalizeComicLoad(archiveName) {
        progressTextElement.innerHTML = '<span style="color: #4ade80;">Completed!</span>';
        sePreConElement.style.display = 'none';
        outputElement.style.display = 'block';

        if (readerToolbarEl) {
            readerToolbarEl.style.display = 'flex';
        }
        if (readerMetaEl) {
            readerMetaEl.textContent = archiveName
                ? `${archiveName} - Click the page to open the gallery`
                : 'Click the page to open the gallery';
        }

        buildLightboxLinks();
        initializeGallery();
        const chapterProgress = getChapterProgress(currentComicFilename);
        const lastPage = getLastPageRead(currentComicFilename);
        const fallbackMode = pendingChapterPrefs?.mode || readingMode || readerSettings.defaultMode;
        const resolvedMode = chapterProgress?.mode
            ? (chapterProgress.mode === 'webtoon' ? 'scroll' : 'paged')
            : fallbackMode;
        readingMode = resolvedMode === 'scroll' || resolvedMode === 'paged' ? resolvedMode : readerSettings.defaultMode;
        localStorage.setItem(READER_MODE_KEY, readingMode);

        const savedZoom = chapterProgress?.webtoonZoom;
        const fallbackZoom = pendingChapterPrefs?.webtoonZoom;
        if (readingMode === 'scroll') {
            if (typeof savedZoom === 'number') {
                scrollZoom = clamp(savedZoom, SCROLL_ZOOM_MIN, SCROLL_ZOOM_MAX);
            } else if (typeof fallbackZoom === 'number') {
                scrollZoom = clamp(fallbackZoom, SCROLL_ZOOM_MIN, SCROLL_ZOOM_MAX);
            }
        }

        const startIndex = typeof chapterProgress?.pageIndex === 'number' ? chapterProgress.pageIndex : lastPage;
        currentPageIndex = clamp(startIndex, 0, totalPages - 1);
        currentScrollIndex = currentPageIndex;
        if (readingMode === 'scroll' && typeof chapterProgress?.scrollRatio === 'number') {
            pendingScrollRestoreRatio = clamp(chapterProgress.scrollRatio, 0, 1);
        }
        applyReadingMode(true);
        updatePageIndicator();
        updateChapterButtons();
        touchChapterProgress(currentComicFilename, chapterProgress);
        pendingChapterPrefs = null;

        setTimeout(() => {
            generateThumbnailFromFirstImage();
        }, 100);
    }

    function showReaderError(message) {
        const safeMessage = typeof message === 'string' ? message : String(message);
        if (readerMetaEl) {
            readerMetaEl.innerHTML = `<span style="color: #ef4444;">${safeMessage}</span>`;
        }
        if (readerToolbarEl) {
            readerToolbarEl.style.display = 'none';
        }
        sePreConElement.style.display = 'none';
        outputElement.style.display = 'block';
    }

    async function readContents(archive, archiveName) {
        const entries = archive.entries;
        const imageEntries = entries.filter(entry => getExt(entry.name) !== '');
        totalPages = imageEntries.length;

        if (totalPages === 0) {
            showReaderError('No images were found in this archive.');
            return;
        }

        const promises = [];
        for (let i = 0; i < imageEntries.length; i++) {
            promises.push(createBlobAsync(imageEntries[i], i, totalPages));
        }

        await Promise.all(promises);
        finalizeComicLoad(archiveName);
    }

    function createBlobAsync(entry, index, max) {
        return new Promise((resolve) => {
            entry.readData((data, err) => {
                if (err) {
                    console.error('Failed to read entry:', err);
                    resolve();
                    return;
                }

                const blob = new Blob([data], { type: getMIME(entry.name) });
                const url = URL.createObjectURL(blob);
                pageUrls[index] = url;
                pagesLoaded += 1;

                progressTextElement.innerHTML = `Reading ${pagesLoaded}/${max} pages`;
                resolve();
            });
        });
    }

    function buildLightboxLinks() {
        if (!lightboxLinksEl) return;

        lightboxLinksEl.innerHTML = '';
        pageLinks = pageUrls.map((url, index) => {
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('aria-label', `Page ${index + 1}`);
            link.dataset.index = index.toString();
            lightboxLinksEl.appendChild(link);
            return link;
        });
    }

    function initializeGallery() {
        if (!lightboxLinksEl) return;

        if (lightGalleryInstance) {
            lightGalleryInstance.destroy(true);
            lightGalleryInstance = null;
        }

        // [FIX v2.1.0] lightGallery 2.x UMD API — plugins array, window.lgZoom etc.
        // DHLKeyuser fork called lightGallery(el, opts) which is the v1 global API.
        if (typeof window.lightGallery !== 'function') return;

        lightGalleryInstance = window.lightGallery(lightboxLinksEl, {
            selector: 'a',
            plugins: [window.lgZoom, window.lgFullscreen, window.lgThumbnail, window.lgAutoplay, window.lgRotate],
            zoom: true,
            download: false,
            enableSwipe: true,
            thumbnail: true,
            animateThumb: true,
            showThumbByDefault: true,
            autoplay: false,
            rotate: true
        });

        if (lightboxLinksEl) {
            // [FIX v2.1.0] v2 event name: lgAfterSlide (was onAfterSlide in v1)
            lightboxLinksEl.removeEventListener('lgAfterSlide', handleLightboxSlide);
            lightboxLinksEl.addEventListener('lgAfterSlide', handleLightboxSlide);
        }
    }

    function handleLightboxSlide(event) {
        const index = event.detail.index;
        currentPageIndex = index;
        currentScrollIndex = index;
        updatePageIndicator();
        saveLastPageRead(currentComicFilename, index);
    }

    function setReadingMode(mode) {
        if (mode !== 'paged' && mode !== 'scroll') {
            return;
        }
        if (readingMode === mode) {
            return;
        }

        readingMode = mode;
        localStorage.setItem(READER_MODE_KEY, readingMode);
        applyReadingMode(true);
        if (currentComicFilename) {
            saveChapterProgress(currentComicFilename, { mode: readingMode });
        }
    }

    function applyReadingMode(shouldJump) {
        updateModeButtons();

        if (readingMode === 'scroll') {
            outputElement.classList.add('scroll-mode');
            if (pagedContainerEl) pagedContainerEl.style.display = 'none';
            if (scrollContainerEl) scrollContainerEl.style.display = 'block';
            if (smartGapToggleEl) smartGapToggleEl.disabled = false;

            lastScrollY = window.scrollY;
            activateWebtoonDock();
            renderScrollMode(shouldJump);
        } else {
            outputElement.classList.remove('scroll-mode');
            if (scrollContainerEl) scrollContainerEl.style.display = 'none';
            if (pagedContainerEl) pagedContainerEl.style.display = 'block';
            if (smartGapToggleEl) smartGapToggleEl.disabled = true;

            deactivateWebtoonDock();
            clearScrollObservers();
            renderPagedImage(currentPageIndex);
        }

        updateZoomControls();
    }

    function activateWebtoonDock() {
        if (!webtoonDockEl || !dockContentEl || !readerToolbarEl) {
            return;
        }

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
        if (readerToolbarHome && readerToolbarEl) {
            if (readerToolbarAnchor) {
                readerToolbarHome.insertBefore(readerToolbarEl, readerToolbarAnchor);
            } else {
                readerToolbarHome.appendChild(readerToolbarEl);
            }
        }
        if (scrollContainerEl) {
            scrollContainerEl.style.paddingBottom = '';
        }
        hideNextChapterFloat();
    }

    function updateModeButtons() {
        modeButtons.forEach((btn) => {
            const isActive = btn.dataset.readingMode === readingMode;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive.toString());
        });
    }

    function renderPagedImage(index) {
        if (!pagedImageEl || totalPages === 0) {
            return;
        }

        const safeIndex = clamp(index, 0, totalPages - 1);
        currentPageIndex = safeIndex;
        currentScrollIndex = safeIndex;
        pagedImageEl.src = pageUrls[safeIndex];
        pagedImageEl.alt = `Page ${safeIndex + 1}`;

        if (pagedImageLinkEl) {
            pagedImageLinkEl.href = pageUrls[safeIndex];
        }

        updatePageIndicator();
    }

    function renderScrollMode(shouldJump) {
        if (!scrollModeReady) {
            buildScrollPages();
        }

        applyScrollZoom();
        initLazyObserver();
        initScrollObserver();

        if (shouldJump) {
            if (pendingScrollRestoreRatio != null) {
                restoreScrollRatio(pendingScrollRestoreRatio);
                pendingScrollRestoreRatio = null;
            } else {
                scrollToPageIndex(currentScrollIndex, false);
            }
        }
    }

    function buildScrollPages() {
        if (!scrollContainerEl) return;

        scrollContainerEl.innerHTML = '';
        scrollPageElements = [];
        scrollEdgeData = [];

        pageUrls.forEach((url, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'scroll-page';
            wrapper.dataset.index = index.toString();

            const img = document.createElement('img');
            img.loading = 'lazy';
            img.decoding = 'async';
            img.alt = `Page ${index + 1}`;
            img.setAttribute('data-src', url);
            img.addEventListener('load', () => analyzeImageWhitespace(img, index));

            wrapper.appendChild(img);
            scrollContainerEl.appendChild(wrapper);
            scrollPageElements.push(wrapper);
        });

        scrollModeReady = true;
        applySmartGapState();
    }

    function initLazyObserver() {
        if (!scrollContainerEl) return;

        if (lazyObserver) {
            lazyObserver.disconnect();
        }

        const images = scrollContainerEl.querySelectorAll('img[data-src]');
        if (!('IntersectionObserver' in window)) {
            images.forEach((img) => setImageSource(img));
            return;
        }

        lazyObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const img = entry.target;
                setImageSource(img);
                lazyObserver.unobserve(img);
            });
        }, { rootMargin: '800px 0px' });

        images.forEach((img) => lazyObserver.observe(img));
    }

    function initScrollObserver() {
        if (!scrollContainerEl || !scrollPageElements.length) return;

        if (visibilityObserver) {
            visibilityObserver.disconnect();
        }
        visibilityRatios = new Map();

        if (!('IntersectionObserver' in window)) {
            return;
        }

        visibilityObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const index = Number(entry.target.dataset.index);
                visibilityRatios.set(index, entry.intersectionRatio);
            });

            let bestIndex = currentScrollIndex;
            let bestRatio = 0;
            visibilityRatios.forEach((ratio, index) => {
                if (ratio > bestRatio) {
                    bestRatio = ratio;
                    bestIndex = index;
                }
            });

            if (bestIndex !== currentScrollIndex) {
                currentScrollIndex = bestIndex;
                currentPageIndex = bestIndex;
                updatePageIndicator();
                scheduleSaveProgress(bestIndex);
            }
        }, { threshold: [0, 0.25, 0.5, 0.75, 1] });

        scrollPageElements.forEach((page) => visibilityObserver.observe(page));
    }

    function clearScrollObservers() {
        if (lazyObserver) {
            lazyObserver.disconnect();
            lazyObserver = null;
        }
        if (visibilityObserver) {
            visibilityObserver.disconnect();
            visibilityObserver = null;
        }
    }

    function updatePageIndicator() {
        const index = readingMode === 'scroll' ? currentScrollIndex : currentPageIndex;
        const label = totalPages === 0 ? '0 / 0' : `${index + 1} / ${totalPages}`;
        if (pageIndicatorEl) {
            pageIndicatorEl.textContent = label;
        }
        if (dockPageIndicatorEl) {
            dockPageIndicatorEl.textContent = label;
        }
    }

    function scrollToPageIndex(index, useSmooth) {
        if (!scrollPageElements.length) return;
        const safeIndex = clamp(index, 0, totalPages - 1);
        currentScrollIndex = safeIndex;
        currentPageIndex = safeIndex;
        updatePageIndicator();

        const target = scrollPageElements[safeIndex];
        if (target) {
            target.scrollIntoView({
                behavior: useSmooth ? 'smooth' : 'auto',
                block: 'start'
            });
        }
    }

    function getScrollRatio() {
        if (!scrollContainerEl) return 0;
        const containerRect = scrollContainerEl.getBoundingClientRect();
        const containerTop = containerRect.top + window.pageYOffset;
        const containerHeight = scrollContainerEl.scrollHeight || scrollContainerEl.offsetHeight;
        const maxScroll = containerHeight - window.innerHeight;
        if (maxScroll <= 0) {
            return 0;
        }
        const scrollTop = window.pageYOffset - containerTop;
        return clamp(scrollTop / maxScroll, 0, 1);
    }

    function scrollToScrollRatio(ratio) {
        if (!scrollContainerEl) return;
        const containerRect = scrollContainerEl.getBoundingClientRect();
        const containerTop = containerRect.top + window.pageYOffset;
        const containerHeight = scrollContainerEl.scrollHeight || scrollContainerEl.offsetHeight;
        const maxScroll = containerHeight - window.innerHeight;
        if (maxScroll <= 0) {
            return;
        }
        const targetScroll = containerTop + (clamp(ratio, 0, 1) * maxScroll);
        window.scrollTo({ top: targetScroll, behavior: 'auto' });
    }

    function restoreScrollRatio(ratio) {
        requestAnimationFrame(() => {
            scrollToScrollRatio(ratio);
            setTimeout(() => scrollToScrollRatio(ratio), 250);
        });
    }

    function goToRelativePage(delta) {
        if (totalPages === 0) return;

        if (readingMode === 'scroll') {
            scrollToPageIndex(currentScrollIndex + delta, true);
        } else {
            const nextIndex = clamp(currentPageIndex + delta, 0, totalPages - 1);
            renderPagedImage(nextIndex);
            saveLastPageRead(currentComicFilename, nextIndex);
        }
    }

    function handleReaderKeydown(event) {
        if (outputElement.style.display !== 'block') {
            return;
        }

        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
            return;
        }
        if (document.body.classList.contains('lg-on')) {
            return;
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goToRelativePage(-1);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            goToRelativePage(1);
        }
    }

    function applyScrollZoom() {
        if (!scrollContainerEl) return;

        scrollZoom = clamp(scrollZoom, SCROLL_ZOOM_MIN, SCROLL_ZOOM_MAX);
        const desiredWidth = BASE_SCROLL_WIDTH_VW * scrollZoom;
        const clampedWidth = Math.min(desiredWidth, 100);
        scrollContainerEl.style.setProperty('--scroll-image-width', `${clampedWidth}vw`);
        localStorage.setItem(SCROLL_ZOOM_KEY, scrollZoom.toString());
        updateZoomControls();
    }

    function updateZoomControls() {
        if (zoomLevelEl) {
            zoomLevelEl.textContent = `${Math.round(scrollZoom * 100)}%`;
        }
        const isScrollMode = readingMode === 'scroll';
        if (zoomOutBtn) zoomOutBtn.disabled = !isScrollMode;
        if (zoomInBtn) zoomInBtn.disabled = !isScrollMode;
    }

    function adjustScrollZoom(delta) {
        scrollZoom = clamp(scrollZoom + delta, SCROLL_ZOOM_MIN, SCROLL_ZOOM_MAX);
        applyScrollZoom();
        if (readingMode === 'scroll') {
            saveChapterProgress(currentComicFilename, {
                pageIndex: currentScrollIndex,
                scrollRatio: getScrollRatio(),
                webtoonZoom: scrollZoom
            });
        }
    }

    function scheduleSaveProgress(index) {
        if (scrollSaveTimeout) {
            clearTimeout(scrollSaveTimeout);
        }
        scrollSaveTimeout = setTimeout(() => {
            saveLastPageRead(currentComicFilename, index);
        }, 200);
    }

    function scheduleScrollProgressSave() {
        if (!currentComicFilename) return;
        if (scrollProgressTimer) {
            clearTimeout(scrollProgressTimer);
        }
        scrollProgressTimer = setTimeout(() => {
            saveChapterProgress(currentComicFilename, {
                pageIndex: currentScrollIndex,
                scrollRatio: getScrollRatio()
            });
        }, 300);
    }

    function setImageSource(img) {
        if (!img) return;
        const dataSrc = img.getAttribute('data-src');
        if (!dataSrc) return;
        img.src = dataSrc;
        img.removeAttribute('data-src');
    }

    function analyzeImageWhitespace(img, index) {
        if (!img.naturalWidth || !img.naturalHeight) {
            return;
        }

        const stripHeight = Math.min(20, img.naturalHeight);
        const sampleHeight = Math.min(10, stripHeight);
        const sampleWidth = Math.min(120, img.naturalWidth);

        const canvas = document.createElement('canvas');
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) return;

        const topWhite = isStripMostlyWhite(ctx, img, 0, stripHeight, sampleWidth, sampleHeight);
        const bottomStart = img.naturalHeight - stripHeight;
        const bottomWhite = isStripMostlyWhite(ctx, img, bottomStart, stripHeight, sampleWidth, sampleHeight);

        scrollEdgeData[index] = { topWhite, bottomWhite };
        updateSmartGapForIndex(index);
    }

    function isStripMostlyWhite(ctx, img, startY, stripHeight, sampleWidth, sampleHeight) {
        ctx.clearRect(0, 0, sampleWidth, sampleHeight);
        ctx.drawImage(
            img,
            0,
            startY,
            img.naturalWidth,
            stripHeight,
            0,
            0,
            sampleWidth,
            sampleHeight
        );

        const data = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
        const totalPixels = data.length / 4;
        let whitePixels = 0;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (r > 240 && g > 240 && b > 240) {
                whitePixels += 1;
            }
        }

        return whitePixels / totalPixels > 0.92;
    }

    function updateSmartGapForIndex(index) {
        if (!smartGapEnabled) return;

        const prevIndex = index - 1;
        if (prevIndex >= 0 && scrollEdgeData[prevIndex] && scrollEdgeData[index]) {
            const shouldTighten = scrollEdgeData[prevIndex].bottomWhite && scrollEdgeData[index].topWhite;
            toggleTightGap(prevIndex, shouldTighten);
        }

        const nextIndex = index + 1;
        if (nextIndex < totalPages && scrollEdgeData[index] && scrollEdgeData[nextIndex]) {
            const shouldTighten = scrollEdgeData[index].bottomWhite && scrollEdgeData[nextIndex].topWhite;
            toggleTightGap(index, shouldTighten);
        }
    }

    function applySmartGapState() {
        if (!scrollPageElements.length) return;

        if (!smartGapEnabled) {
            scrollPageElements.forEach((page) => page.classList.remove('scroll-page--tight'));
            return;
        }

        scrollPageElements.forEach((page, index) => {
            const current = scrollEdgeData[index];
            const next = scrollEdgeData[index + 1];
            const shouldTighten = current && next && current.bottomWhite && next.topWhite;
            toggleTightGap(index, shouldTighten);
        });
    }

    function toggleTightGap(index, shouldTighten) {
        const page = scrollPageElements[index];
        if (!page) return;
        page.classList.toggle('scroll-page--tight', shouldTighten);
    }

    function getExt(filename) {
        const ext = filename.split('.').pop();
        return (ext === filename) ? '' : ext;
    }

    function getMIME(filename) {
        const ext = getExt(filename).toLowerCase();
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'bmp': 'image/bmp',
            'webp': 'image/webp'
        };
        return mimeTypes[ext] || 'image/jpeg';
    }

    // [SEC v2.1.0] Track all blob URLs for safe cleanup; revoke each on img load/error
    const _activeBlobURLs = new Set();

    function clearBlobs() {
        // Revoke individually tracked URLs (from previous comic) and clear the set
        for (const url of _activeBlobURLs) {
            try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        }
        _activeBlobURLs.clear();
        // Also revoke the pageUrls array (DHLKeyuser's approach)
        if (pageUrls.length > 0) {
            pageUrls.forEach(url => {
                try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
            });
        }
    }

    function generateThumbnailFromFirstImage() {
        try {
            const firstUrl = pageUrls[0];
            if (!firstUrl) {
                return;
            }

            const previewImg = new Image();
            previewImg.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const maxWidth = 100;
                const scale = maxWidth / previewImg.naturalWidth;
                canvas.width = maxWidth;
                canvas.height = previewImg.naturalHeight * scale;

                ctx.drawImage(previewImg, 0, 0, canvas.width, canvas.height);
                const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

                // get existing data to preserve last_page
                const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');
                const existing = readingHistory[currentComicFilename] || {};
                saveLastPageRead(currentComicFilename, existing.last_page || 0, thumbnail);
            };
            previewImg.src = firstUrl;
        } catch (e) {
            console.error('Failed to create thumbnail:', e);
        }
    }

    function saveLastPageRead(filename, pageIndex, thumbnail = null) {
        try {
            const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');
            const existing = readingHistory[filename] || {};
            const finalThumbnail = thumbnail || existing.thumbnail || null;

            readingHistory[filename] = {
                last_page: pageIndex,
                timestamp: Date.now(),
                thumbnail: finalThumbnail
            };
            localStorage.setItem('comic_reader_userpref', JSON.stringify(readingHistory));
            saveChapterProgress(filename, { pageIndex });
        } catch (e) {
            console.error('Failed to save reading history:', e);
        }
    }

    function getLastPageRead(filename) {
        try {
            const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');
            return readingHistory[filename]?.last_page || 0;
        } catch (e) {
            console.error('Failed to read reading history:', e);
            return 0;
        }
    }


    // --- Hosted Library Mode ---

    async function initHostedLibrary() {
        if (typeof HostedLibrary === 'undefined') return;
        const manifest = await HostedLibrary.loadManifest();
        if (manifest) {
            await showHostedLibraryMode();
        }

        if (supportsFileSystemAccess && hostedSelectFolderBtn) {
            hostedSelectFolderBtn.style.display = '';
            if (hostedFolderDivider) hostedFolderDivider.style.display = '';
            hostedSelectFolderBtn.addEventListener('click', () => {
                if (selectFolderBtn) selectFolderBtn.click();
            });
        }

        if (hostedQuickReadBtn) {
            hostedQuickReadBtn.addEventListener('click', () => showQuickReadMode());
        }

        if (hostedSettingsToggleBtn && hostedSettingsPanelEl) {
            hostedSettingsToggleBtn.addEventListener('click', () => {
                const isHidden = hostedSettingsPanelEl.style.display === 'none' || hostedSettingsPanelEl.style.display === '';
                hostedSettingsPanelEl.style.display = isHidden ? 'flex' : 'none';
            });
        }

        if (hostedDefaultModeSelectEl) {
            hostedDefaultModeSelectEl.value = readerSettings.defaultMode;
            hostedDefaultModeSelectEl.addEventListener('change', () => {
                readerSettings.defaultMode = hostedDefaultModeSelectEl.value === 'paged' ? 'paged' : 'scroll';
                saveReaderSettings(readerSettings);
                if (defaultModeSelectEl) defaultModeSelectEl.value = readerSettings.defaultMode;
            });
        }

        if (hostedAutoAdvanceToggleEl) {
            hostedAutoAdvanceToggleEl.checked = Boolean(readerSettings.autoAdvance);
            hostedAutoAdvanceToggleEl.addEventListener('change', () => {
                readerSettings.autoAdvance = hostedAutoAdvanceToggleEl.checked;
                autoAdvanceEnabled = readerSettings.autoAdvance;
                saveReaderSettings(readerSettings);
                if (autoAdvanceToggleEl) autoAdvanceToggleEl.checked = readerSettings.autoAdvance;
            });
        }

        if (hostedResetProgressBtn) {
            hostedResetProgressBtn.addEventListener('click', () => {
                const confirmed = window.confirm('Reset all reading progress? This cannot be undone.');
                if (confirmed) {
                    resetAllProgress();
                }
            });
        }
    }

    async function showHostedLibraryMode() {
        if (typeof HostedLibrary === 'undefined') return;

        isHostedLibraryMode = true;
        isLibraryMode = false;
        initialViewEl.style.display = 'none';
        libraryViewEl.style.display = 'none';
        if (hostedLibraryViewEl) hostedLibraryViewEl.style.display = 'block';
        quickReadViewEl.style.display = 'none';
        footerCollapsedTextEl.textContent = 'Show library';

        loadHostedRecentComics();
        loadHostedAllComics();

        if (hostedRecentComicsListEl && hostedRecentComicsListEl.children.length > 0) {
            if (hostedRecentComicsEl) hostedRecentComicsEl.style.display = 'block';
        }
        if (hostedAllComicsEl) hostedAllComicsEl.style.display = 'block';
    }

    function loadHostedAllComics() {
        if (!hostedAllComicsListEl) return;

        const seriesList = HostedLibrary.listSeries();
        const hasAnyChapters = seriesList && seriesList.some(s => s.chapters && s.chapters.length > 0);

        if (!hasAnyChapters) {
            const seriesNames = seriesList ? seriesList.map(s => s.title).filter(Boolean) : [];
            const seriesNote = seriesNames.length > 0
                ? `<div style="margin-top: 8px; color: var(--text); font-size: 13px;">Series folders found: <strong>${seriesNames.join(', ')}</strong></div><div style="margin-top: 4px; color: var(--muted); font-size: 13px;">Upload .cbz files into these folders and update library.json to see them here.</div>`
                : '';
            hostedAllComicsListEl.innerHTML = `<div style="text-align: center; color: var(--muted); padding: 20px; font-size: 14px;">No chapters in the library yet.${seriesNote}</div>`;
            return;
        }

        const allChapters = [];
        const seriesForRender = [];
        for (const s of seriesList) {
            if (!s.chapters || s.chapters.length === 0) continue;
            const sorted = [...s.chapters].sort(naturalCompare);
            seriesForRender.push({ key: s.title.toLowerCase(), title: s.title, chapters: sorted });
            allChapters.push(...sorted);
        }
        seriesForRender.sort((a, b) => naturalCompare(a.title, b.title));

        libraryComicList = seriesForRender.flatMap(s => s.chapters);
        updateChapterContext(currentComicFilename, currentChapterFromLibrary);
        renderHostedSeriesLibrary(seriesForRender);
    }

    function renderHostedSeriesLibrary(seriesList) {
        if (!hostedAllComicsListEl) return;

        const progressStore = loadProgressStore();
        hostedAllComicsListEl.innerHTML = '';
        hostedAllComicsListEl.classList.add('series-list');

        seriesList.forEach((series) => {
            const seriesWrapper = document.createElement('div');
            seriesWrapper.className = 'series-item';
            const latest = getLatestSeriesProgress(series.chapters, progressStore);
            const latestLabel = latest
                ? `${series.chapters.length} chapters • ${latest.filename} • ${formatTimestamp(latest.progress.lastRead)}`
                : `${series.chapters.length} chapters`;

            seriesWrapper.innerHTML = `
                <button class="series-header" aria-expanded="false">
                    <div>
                        <div class="series-title">${series.title}</div>
                        <div class="series-meta">${latestLabel}</div>
                    </div>
                    <span class="series-toggle">▾</span>
                </button>
                <div class="series-chapters"></div>
            `;

            const headerBtn = seriesWrapper.querySelector('.series-header');
            const chaptersEl = seriesWrapper.querySelector('.series-chapters');
            headerBtn.addEventListener('click', () => {
                const expanded = seriesWrapper.classList.toggle('expanded');
                headerBtn.setAttribute('aria-expanded', expanded.toString());
            });

            series.chapters.forEach((filename) => {
                const chapterProgress = progressStore[filename];
                const progressPercent = getProgressPercent(chapterProgress);
                const chapterRow = document.createElement('div');
                chapterRow.className = 'series-chapter';
                chapterRow.innerHTML = `
                    <div class="series-chapter-title">${filename}</div>
                    <div class="series-chapter-meta">${formatProgressLabel(chapterProgress)}</div>
                    <div class="progress-bar"><div class="progress-bar-fill" style="width: ${progressPercent}%"></div></div>
                `;
                chapterRow.addEventListener('click', () => openComicFromHostedLibrary(filename));
                chaptersEl.appendChild(chapterRow);
            });

            hostedAllComicsListEl.appendChild(seriesWrapper);
        });
    }

    function loadHostedRecentComics() {
        if (!hostedRecentComicsListEl) return;

        try {
            const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');
            const progressStore = loadProgressStore();

            const allChapters = new Set(HostedLibrary.listAllChapters());

            const recentComics = Object.entries(progressStore)
                .filter(([filename]) => allChapters.has(filename))
                .sort((a, b) => (b[1]?.lastRead || 0) - (a[1]?.lastRead || 0))
                .slice(0, 5);

            hostedRecentComicsListEl.innerHTML = '';

            if (recentComics.length === 0) {
                if (hostedRecentComicsEl) hostedRecentComicsEl.style.display = 'none';
                return;
            }
            if (hostedRecentComicsEl) hostedRecentComicsEl.style.display = 'block';

            for (const [filename, progress] of recentComics) {
                const item = document.createElement('div');
                item.className = 'recent-comic-item';

                const thumb = readingHistory[filename]?.thumbnail;
                const iconContent = thumb
                    ? `<img src="${thumb}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">`
                    : `<svg viewBox="0 0 16 16"><path d="M3.5 2a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 12.5 2h-9zm6.854 6.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L8.793 9H5.5a.5.5 0 0 1 0-1h3.293L6.646 5.854a.5.5 0 1 1 .708-.708l3 3z"/></svg>`;

                const progressPercent = getProgressPercent(progress);
                item.innerHTML = `
                    <div class="recent-comic-icon">${iconContent}</div>
                    <div class="recent-comic-info">
                        <div class="recent-comic-name">${filename}</div>
                        <div class="recent-comic-meta">${formatProgressLabel(progress)} • ${formatTimestamp(progress.lastRead)}</div>
                        <div class="progress-bar"><div class="progress-bar-fill" style="width: ${progressPercent}%"></div></div>
                    </div>
                `;
                item.addEventListener('click', () => openComicFromHostedLibrary(filename));
                hostedRecentComicsListEl.appendChild(item);
            }
        } catch (err) {
            console.error('Failed to load hosted recent comics:', err);
        }
    }

    async function openComicFromHostedLibrary(filename) {
        try {
            progressTextElement.innerHTML = `Downloading ${filename}...`;
            sePreConElement.style.display = 'block';
            const file = await HostedLibrary.fetchComicFile(filename);
            sePreConElement.style.display = 'none';
            updateChapterContext(filename, true);
            openComic(file, { fromLibrary: true });
            setTimeout(() => {
                loadHostedRecentComics();
                if (hostedRecentComicsListEl && hostedRecentComicsListEl.children.length > 0 && hostedRecentComicsEl) {
                    hostedRecentComicsEl.style.display = 'block';
                }
            }, 500);
        } catch (err) {
            console.error('Failed to open comic from hosted library:', err);
            sePreConElement.style.display = 'none';
            alert('Could not download this comic: ' + err.message);
        }
    }

    // [SEC v2.1.0] IDB version bumped to 2 — clears stale v1 handles on upgrade
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('ComicReaderDB', 2);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (db.objectStoreNames.contains('directories')) {
                    db.deleteObjectStore('directories');
                }
                db.createObjectStore('directories');
            };
        });
    }

    async function saveDirectoryHandle(dirHandle) {
        try {
            const db = await openDB();
            const tx = db.transaction('directories', 'readwrite');
            const store = tx.objectStore('directories');
            store.put(dirHandle, 'comicsFolder');
            await tx.complete;
        } catch (err) {
            console.error('Failed to save directory handle:', err);
        }
    }

    async function loadDirectoryHandle() {
        try {
            const db = await openDB();
            const tx = db.transaction('directories', 'readonly');
            const store = tx.objectStore('directories');
            const handle = await new Promise((resolve, reject) => {
                const request = store.get('comicsFolder');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (handle) {
                // verify we still have permission
                const permission = await handle.queryPermission({ mode: 'read' });
                if (permission === 'granted') {
                    return { handle, hasPermission: true };
                } else {
                    // permission is 'prompt' or 'denied' - need user interaction
                    return { handle, hasPermission: false };
                }
            }
            return { handle: null, hasPermission: false };
        } catch (err) {
            console.error('Failed to load directory handle:', err);
            return { handle: null, hasPermission: false };
        }
    }

    async function loadRecentComics() {
        try {
            const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');
            const progressStore = loadProgressStore();

            const recentComics = Object.entries(progressStore)
                .sort((a, b) => (b[1]?.lastRead || 0) - (a[1]?.lastRead || 0))
                .slice(0, 5);

            recentComicsListEl.innerHTML = '';

            if (recentComics.length === 0) {
                if (recentComicsEl) {
                    recentComicsEl.style.display = 'none';
                }
                return;
            }
            if (recentComicsEl) {
                recentComicsEl.style.display = 'block';
            }

            for (const [filename, progress] of recentComics) {
                const item = document.createElement('div');
                item.className = 'recent-comic-item';

                const thumb = readingHistory[filename]?.thumbnail;
                const iconContent = thumb
                    ? `<img src="${thumb}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">`
                    : `<svg viewBox="0 0 16 16">
                        <path d="M3.5 2a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 12.5 2h-9zm6.854 6.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L8.793 9H5.5a.5.5 0 0 1 0-1h3.293L6.646 5.854a.5.5 0 1 1 .708-.708l3 3z"/>
                    </svg>`;

                const progressPercent = getProgressPercent(progress);
                item.innerHTML = `
                    <div class="recent-comic-icon">
                        ${iconContent}
                    </div>
                    <div class="recent-comic-info">
                        <div class="recent-comic-name">${filename}</div>
                        <div class="recent-comic-meta">${formatProgressLabel(progress)} • ${formatTimestamp(progress.lastRead)}</div>
                        <div class="progress-bar"><div class="progress-bar-fill" style="width: ${progressPercent}%"></div></div>
                    </div>
                `;
                item.addEventListener('click', () => openComicFromFolder(filename));
                recentComicsListEl.appendChild(item);
            }
        } catch (err) {
            console.error('Failed to load recent comics:', err);
        }
    }

    async function removeComicFromHistory(filename) {
        const readingHistory = JSON.parse(localStorage.getItem('comic_reader_userpref') || '{}');
        if (readingHistory[filename]) {
            delete readingHistory[filename];
            localStorage.setItem('comic_reader_userpref', JSON.stringify(readingHistory));
            clearChapterProgress(filename);
            
            if (isHostedLibraryMode) {
                loadHostedRecentComics();
                if (hostedRecentComicsListEl && hostedRecentComicsListEl.children.length === 0 && hostedRecentComicsEl) {
                    hostedRecentComicsEl.style.display = 'none';
                }
            } else {
                await loadRecentComics();
                if (recentComicsListEl.children.length === 0) {
                    recentComicsEl.style.display = 'none';
                }
            }
        }
    }

    async function openComicFromFolder(filename) {
        try {
            if (!comicsDirectoryHandle) {
                throw new Error('Directory handle not available');
            }

            // check permission before accessing files
            const permission = await comicsDirectoryHandle.queryPermission({ mode: 'read' });
            if (permission !== 'granted') {
                // try to request permission
                const newPermission = await comicsDirectoryHandle.requestPermission({ mode: 'read' });
                if (newPermission !== 'granted') {
                    showReconnectButton();
                    return;
                }
            }

            const fileHandle = await comicsDirectoryHandle.getFileHandle(filename);
            const file = await fileHandle.getFile();
            updateChapterContext(filename, true);
            openComic(file, { fromLibrary: true });
            // refresh recent list after opening
            setTimeout(async () => {
                if (comicsDirectoryHandle) {
                    await loadRecentComics();
                    // show recently read if not already visible
                    if (recentComicsListEl.children.length > 0) {
                        recentComicsEl.style.display = 'block';
                    }
                }
            }, 500);
        } catch (err) {
            console.error('Failed to open comic:', err);
            if (err.name === 'NotAllowedError') {
                showReconnectButton();
            } else {
                alert('Could not find this comic in the selected folder. Please re-upload it or select a different folder.');
                await removeComicFromHistory(filename);
            }
        }
    }

    function formatTimestamp(timestamp) {
        if (!timestamp) return 'Never';
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    function loadReaderSettings() {
        try {
            const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            const merged = {
                ...DEFAULT_SETTINGS,
                ...stored
            };
            if (merged.defaultMode !== 'scroll' && merged.defaultMode !== 'paged') {
                merged.defaultMode = DEFAULT_SETTINGS.defaultMode;
            }
            return merged;
        } catch (e) {
            console.error('Failed to load settings:', e);
            return { ...DEFAULT_SETTINGS };
        }
    }

    function saveReaderSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('Failed to save settings:', e);
        }
    }

    function resetAllProgress() {
        localStorage.removeItem(CHAPTER_PROGRESS_KEY);
        if (isHostedLibraryMode) {
            loadHostedRecentComics();
            loadHostedAllComics();
        } else {
            loadRecentComics();
            loadAllComics();
        }
    }

    function clearChapterProgress(filename) {
        if (!filename) return;
        const progress = loadProgressStore();
        if (progress[filename]) {
            delete progress[filename];
            saveProgressStore(progress);
        }
    }

    function getProgressPercent(progress) {
        if (!progress) return 0;
        if (typeof progress.scrollRatio === 'number') {
            return Math.round(progress.scrollRatio * 100);
        }
        if (typeof progress.pageIndex === 'number' && typeof progress.pageCount === 'number' && progress.pageCount > 0) {
            return Math.round(((progress.pageIndex + 1) / progress.pageCount) * 100);
        }
        return 0;
    }

    function formatProgressLabel(progress) {
        if (!progress) return 'Not started';
        if (progress.mode === 'webtoon' && typeof progress.scrollRatio === 'number') {
            return `${Math.round(progress.scrollRatio * 100)}% read`;
        }
        if (typeof progress.pageIndex === 'number') {
            return `Page ${progress.pageIndex + 1}`;
        }
        return 'In progress';
    }

    function getLatestSeriesProgress(chapters, progressStore) {
        let latest = null;
        chapters.forEach((filename) => {
            const progress = progressStore[filename];
            if (!progress || !progress.lastRead) return;
            if (!latest || progress.lastRead > latest.progress.lastRead) {
                latest = { filename, progress };
            }
        });
        return latest;
    }

    function parseSeriesKey(filename) {
        if (!filename) return '';
        let key = filename.toLowerCase();
        key = key.replace(/\.[^.]+$/, '');
        key = key.replace(/\[[^\]]*\]|\([^\)]*\)/g, ' ');
        key = key.replace(/\b(?:digital|webrip|web|scan|scans|raw|color|fixed|fix|date)\b/gi, ' ');
        key = key.replace(/\b(19|20)\d{2}\b/g, ' ');
        key = key.replace(/\b(?:chapter|chap|ch|c|vol|volume|v)\s*0*\d+\b/gi, ' ');
        key = key.replace(/#\s*\d+\b/gi, ' ');
        key = key.replace(/[_\-]+/g, ' ');
        key = key.replace(/\s+/g, ' ').trim();
        return key || filename.toLowerCase();
    }

    function formatSeriesTitle(filename, fallback) {
        if (!filename) return fallback || '';
        let title = filename.replace(/\.[^.]+$/, '');
        title = title.replace(/\[[^\]]*\]|\([^\)]*\)/g, ' ');
        title = title.replace(/\b(?:digital|webrip|web|scan|scans|raw|color|fixed|fix|date)\b/gi, ' ');
        title = title.replace(/\b(19|20)\d{2}\b/g, ' ');
        title = title.replace(/\b(?:chapter|chap|ch|c|vol|volume|v)\s*0*\d+\b/gi, ' ');
        title = title.replace(/#\s*\d+\b/gi, ' ');
        title = title.replace(/[_\-]+/g, ' ');
        title = title.replace(/\s+/g, ' ').trim();
        return title || fallback || '';
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function naturalCompare(a, b) {
        const ax = String(a).toLowerCase().match(/\d+|\D+/g) || [];
        const bx = String(b).toLowerCase().match(/\d+|\D+/g) || [];
        const len = Math.min(ax.length, bx.length);
        for (let i = 0; i < len; i++) {
            const aChunk = ax[i];
            const bChunk = bx[i];
            const aNum = Number(aChunk);
            const bNum = Number(bChunk);
            const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);
            if (bothNumeric && aNum !== bNum) {
                return aNum - bNum;
            }
            if (!bothNumeric && aChunk !== bChunk) {
                return aChunk.localeCompare(bChunk);
            }
        }
        return ax.length - bx.length;
    }
});
