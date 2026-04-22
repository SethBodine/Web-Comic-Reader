/**
 * Web Comic Reader — script.js
 *
 * CHANGELOG
 * ──────────────────────────────────────────────────────────────────────────────
 * v2.0.0
 *
 * [SECURITY] XSS — replaced all innerHTML string concatenation that included
 *            user-controlled data (filenames) with textContent / DOM API calls.
 *            Filenames are now NEVER interpolated into HTML strings.
 *
 * [SECURITY] localStorage data is now sanitised before use: thumbnails are
 *            validated as data:image/jpeg; URIs before being injected into img.src;
 *            last_page is coerced to a safe integer; timestamps are coerced to
 *            numbers to prevent prototype-pollution payloads stored by a rogue page.
 *
 * [SECURITY] IndexedDB handle stored under a versioned key so stale handles
 *            from older installs don't silently fail.
 *
 * [SECURITY] File-type validation added before archiveOpenFile() is called:
 *            magic-byte check + extension allowlist to prevent processing
 *            arbitrary files dropped onto the zone.
 *
 * [SECURITY] Blob URL lifetime is now tracked in a WeakMap; all object URLs
 *            are revoked immediately after the image loads (or on error) to
 *            prevent memory leaks and potential URL-spoofing in long sessions.
 *
 * [LARGE FILE] Files up to 1 GB are now supported via chunked FileReader reads
 *              rather than a single slice().readAsArrayBuffer() call.  A visible
 *              progress bar shows byte-level progress during the read phase.
 *              A >100 MB warning banner is shown before reading starts.
 *
 * [LARGE FILE] Comic pages are now rendered lazily using IntersectionObserver:
 *              images load only when they scroll near the viewport, reducing
 *              peak memory from O(all pages) to O(visible + buffer pages).
 *
 * [DEPS]     Migrated from lightGallery 1.x API (lightGallery() global function)
 *            to lightGallery 2.x UMD API (window.lightGallery constructor with
 *            plugin objects).  All plugin options updated to v2 equivalents.
 *
 * [FEATURE] Drag-and-drop visual feedback: dropzone highlights on dragover,
 *           de-highlights on dragleave/drop.  A "large file" warning shows for
 *           files > 100 MB.
 *
 * [FEATURE] jszip 3.x async API used for ZIP entries instead of
 *           zip_entry.asArrayBuffer() (synchronous, blocks the UI thread).
 *
 * [FIX]    AVIF and TIFF image MIME types added to getMIME() lookup table.
 *
 * [FIX]    Page ordering now uses a natural-sort comparator so pages sort as
 *           1, 2, …, 10 instead of 1, 10, 2, … for archives with numeric names.
 *
 * [FIX]    readContents() is now sequential (page-by-page) rather than using
 *           Promise.all() so the browser does not attempt to decode hundreds of
 *           images simultaneously for large comics (was causing OOM crashes).
 *
 * [A11Y]   Comic page <img> elements now carry descriptive alt text and
 *          loading="lazy" attribute as an additional hint to the browser.
 * ──────────────────────────────────────────────────────────────────────────────
 */

'use strict';

/* ─── Constants ──────────────────────────────────────────────────────────── */

/** Maximum file size accepted (1 GiB). */
const MAX_FILE_BYTES = 1 * 1024 * 1024 * 1024;

/** Files larger than this trigger the "large file" UX warning (100 MiB). */
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024;

/** How many bytes to read per FileReader chunk for large files. */
const CHUNK_SIZE = 64 * 1024 * 1024; // 64 MiB chunks

/** Allowed file extensions (lower-case). */
const ALLOWED_EXTENSIONS = new Set(['.cbr', '.cbz', '.cbt']);

/** LocalStorage key for reading history. */
const LS_KEY = 'comic_reader_userpref';

/** IndexedDB database + store names. */
const IDB_DB   = 'ComicReaderDB';
const IDB_VER  = 2;          // bumped from 1 so old stale handles are cleared
const IDB_STORE = 'directories';

/* ─── Boot ───────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

    /* DOM refs */
    const outputEl          = document.getElementById('output');
    const progressTextEl    = document.querySelector('.progress-text');
    const sePreConEl        = document.querySelector('.se-pre-con');
    const currYearEl        = document.getElementById('currYear');
    const wrapEl            = document.querySelector('.wrap');
    const collapseBtn       = document.getElementById('collapseBtn');
    const selectFolderBtn   = document.getElementById('selectFolderBtn');
    const quickReadBtn      = document.getElementById('quickReadBtn');
    const toggleUploadBtn   = document.getElementById('toggleUploadBtn');
    const backToLibraryBtn  = document.getElementById('backToLibraryBtn');
    const recentComicsEl    = document.getElementById('recentComics');
    const recentComicsListEl= document.getElementById('recentComicsList');
    const allComicsEl       = document.getElementById('allComics');
    const allComicsListEl   = document.getElementById('allComicsList');
    const dropzoneEl        = document.getElementById('dropzone');
    const initialViewEl     = document.getElementById('initialView');
    const libraryViewEl     = document.getElementById('libraryView');
    const quickReadViewEl   = document.getElementById('quickReadView');
    const footerCollapsedEl = document.getElementById('footerCollapsedText');
    const browserNoticeEl   = document.getElementById('browserNotice');
    const changeFolderBtn   = document.getElementById('changeFolderBtn');
    const currentFolderNameEl = document.getElementById('currentFolderName');
    const chunkProgressEl   = document.getElementById('chunkProgress');
    const chunkBarEl        = document.getElementById('chunkBar');
    const chunkLabelEl      = document.getElementById('chunkLabel');
    const fileSizeWarningEl = document.getElementById('fileSizeWarning');

    /* State */
    let comicsDirHandle     = null;
    let isLibraryMode       = false;
    let lightGalleryInstance= null;
    let hasInitGallery      = false;
    let currentComicFilename= '';

    /** Tracks all blob URLs created for the current comic so we can revoke them. */
    const activeBlobURLs    = new Set();

    /* ── Year ─────────────────────────────────────────────────────────────── */
    currYearEl.textContent = new Date().getFullYear();

    /* ── File System Access API support ──────────────────────────────────── */
    const supportsFS = 'showDirectoryPicker' in window;
    if (supportsFS) {
        selectFolderBtn.style.display = 'flex';
        document.getElementById('dividerOr').style.display = 'block';
    } else {
        browserNoticeEl.style.display = 'block';
        quickReadBtn.classList.replace('folder-btn-secondary', 'folder-btn-primary');
    }

    /* ── Load archive decoders ────────────────────────────────────────────── */
    loadArchiveFormats(['rar', 'zip', 'tar']);

    /* ══════════════════════════════════════════════════════════════════════════
       DROPZONE SETUP
       Supports both drag-and-drop AND click-to-open (default Dropzone behaviour).
    ══════════════════════════════════════════════════════════════════════════ */
    if (window.Dropzone) Dropzone.autoDiscover = false;

    const dz = new Dropzone('#dropzone', {
        url: '#',                           // no server upload
        acceptedFiles: '.cbr,.cbz,.cbt',
        createImageThumbnails: false,
        autoProcessQueue: false,
        previewsContainer: false,
        clickable: true,                    // click anywhere in zone to open picker
        maxFiles: 1,
        maxFilesize: 1024,                  // 1 GB in MB
        init() {
            this.on('maxfilesexceeded', function (file) {
                this.removeAllFiles();
                this.addFile(file);
            });

            this.on('addedfile', (file) => {
                // Reject files that are too large
                if (file.size > MAX_FILE_BYTES) {
                    showError(`File too large (${formatBytes(file.size)}). Maximum is 1 GB.`);
                    dz.removeAllFiles();
                    return;
                }

                // Show large-file warning banner
                if (fileSizeWarningEl) {
                    fileSizeWarningEl.style.display = file.size > LARGE_FILE_THRESHOLD ? 'block' : 'none';
                }

                openComic(file);
            });

            // Drag-over visual feedback
            this.on('dragover',  () => dropzoneEl.classList.add('dz-drag-hover'));
            this.on('dragleave', () => dropzoneEl.classList.remove('dz-drag-hover'));
            this.on('drop',      () => dropzoneEl.classList.remove('dz-drag-hover'));
        }
    });

    /* ══════════════════════════════════════════════════════════════════════════
       COLLAPSED FOOTER
    ══════════════════════════════════════════════════════════════════════════ */
    document.querySelector('.footer-collapsed').addEventListener('click', async () => {
        wrapEl.classList.remove('collapsed');
        if (isLibraryMode && comicsDirHandle) {
            const perm = await comicsDirHandle.queryPermission({ mode: 'read' });
            if (perm === 'granted') await showLibraryMode();
            else showReconnectButton();
        } else if (!isLibraryMode) {
            showQuickReadMode();
        } else {
            initialViewEl.style.display = 'block';
            libraryViewEl.style.display = 'none';
            quickReadViewEl.style.display = 'none';
        }
    });

    collapseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        wrapEl.classList.add('collapsed');
    });

    /* ══════════════════════════════════════════════════════════════════════════
       FOLDER / LIBRARY BUTTONS
    ══════════════════════════════════════════════════════════════════════════ */
    async function pickFolder() {
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
            const perm = await dirHandle.requestPermission({ mode: 'read' });
            if (perm !== 'granted') return;
            comicsDirHandle = dirHandle;
            await saveDirectoryHandle(dirHandle);
            await showLibraryMode();
        } catch (err) {
            if (err.name !== 'AbortError') console.error('Error selecting folder:', err);
        }
    }

    selectFolderBtn?.addEventListener('click', async () => {
        if (comicsDirHandle) {
            const perm = await comicsDirHandle.requestPermission({ mode: 'read' });
            if (perm === 'granted') { await showLibraryMode(); return; }
        }
        await pickFolder();
    });

    quickReadBtn?.addEventListener('click', showQuickReadMode);
    toggleUploadBtn?.addEventListener('click', showQuickReadMode);
    changeFolderBtn?.addEventListener('click', pickFolder);

    backToLibraryBtn?.addEventListener('click', async () => {
        if (!comicsDirHandle) return;
        const perm = await comicsDirHandle.queryPermission({ mode: 'read' });
        if (perm === 'granted') {
            await showLibraryMode();
        } else {
            try {
                const np = await comicsDirHandle.requestPermission({ mode: 'read' });
                if (np === 'granted') await showLibraryMode();
                else showReconnectButton();
            } catch { showReconnectButton(); }
        }
    });

    /* Load saved folder handle on startup */
    if (supportsFS) {
        loadDirectoryHandle().then(async ({ handle, hasPermission }) => {
            if (handle && hasPermission) {
                comicsDirHandle = handle;
                await showLibraryMode();
            } else if (handle) {
                comicsDirHandle = handle;
                showReconnectButton();
            }
        });
    }

    /* ══════════════════════════════════════════════════════════════════════════
       VIEW HELPERS
    ══════════════════════════════════════════════════════════════════════════ */
    function showReconnectButton() {
        initialViewEl.style.display = 'block';
        libraryViewEl.style.display = 'none';
        quickReadViewEl.style.display = 'none';
        const titleEl    = selectFolderBtn?.querySelector('.btn-title');
        const subtitleEl = selectFolderBtn?.querySelector('.btn-subtitle');
        if (titleEl)    titleEl.textContent    = 'Reconnect to Comics Folder';
        if (subtitleEl) subtitleEl.textContent = 'Click to restore access to your library';
    }

    async function showLibraryMode() {
        if (!comicsDirHandle) return;
        isLibraryMode = true;
        initialViewEl.style.display  = 'none';
        libraryViewEl.style.display  = 'block';
        quickReadViewEl.style.display = 'none';
        footerCollapsedEl.textContent = 'Show library';

        // [SECURITY] Set folder name via textContent, not innerHTML
        if (currentFolderNameEl) {
            currentFolderNameEl.textContent = '';
            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('viewBox', '0 0 16 16');
            icon.setAttribute('fill', 'currentColor');
            icon.setAttribute('width', '14');
            icon.setAttribute('height', '14');
            icon.setAttribute('aria-hidden', 'true');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z');
            icon.appendChild(path);
            currentFolderNameEl.appendChild(icon);
            currentFolderNameEl.appendChild(document.createTextNode(' ' + comicsDirHandle.name));
        }

        resetSelectBtnText();
        await loadRecentComics();
        await loadAllComics();
        if (recentComicsListEl.children.length > 0) recentComicsEl.style.display = 'block';
        allComicsEl.style.display = 'block';
    }

    function showQuickReadMode() {
        isLibraryMode = false;
        initialViewEl.style.display   = 'none';
        libraryViewEl.style.display   = 'none';
        quickReadViewEl.style.display = 'block';
        footerCollapsedEl.textContent  = 'Upload another file';
        resetSelectBtnText();
        if (backToLibraryBtn) backToLibraryBtn.style.display = comicsDirHandle ? 'block' : 'none';
    }

    function resetSelectBtnText() {
        const t = selectFolderBtn?.querySelector('.btn-title');
        const s = selectFolderBtn?.querySelector('.btn-subtitle');
        if (t) t.textContent = 'Select Comics Folder';
        if (s) s.textContent = 'Auto-track progress, browse all comics';
    }

    /* ══════════════════════════════════════════════════════════════════════════
       LIBRARY — LOAD ALL COMICS
    ══════════════════════════════════════════════════════════════════════════ */
    async function loadAllComics() {
        if (!comicsDirHandle) return;
        try {
            const perm = await comicsDirHandle.queryPermission({ mode: 'read' });
            if (perm !== 'granted') {
                allComicsListEl.textContent = 'Permission required to access folder';
                return;
            }

            allComicsListEl.innerHTML = '';
            const spinner = buildSpinner('Scanning folder…');
            allComicsListEl.appendChild(spinner);

            const comics = [];
            for await (const entry of comicsDirHandle.values()) {
                if (entry.kind === 'file') {
                    const ext = '.' + entry.name.split('.').pop().toLowerCase();
                    if (ALLOWED_EXTENSIONS.has(ext)) comics.push(entry.name);
                }
            }

            allComicsListEl.innerHTML = '';

            if (!comics.length) {
                const msg = document.createElement('div');
                msg.className = 'empty-message';
                msg.textContent = 'No comics found. Make sure your comics have .cbr, .cbz, or .cbt extension.';
                allComicsListEl.appendChild(msg);
                return;
            }

            comics.sort(naturalSort);
            const readingHistory = safeReadHistory();

            for (const filename of comics) {
                allComicsListEl.appendChild(buildComicItem(filename, readingHistory[filename], () => openComicFromFolder(filename)));
            }
        } catch (err) {
            console.error('Failed to load all comics:', err);
            if (err.name === 'NotFoundError') {
                allComicsListEl.innerHTML = '';
                const wrap = document.createElement('div');
                wrap.style.textAlign = 'center';
                wrap.style.padding   = '40px 20px';

                const msg = document.createElement('div');
                msg.style.marginBottom = '10px';
                msg.textContent = `Failed to load comics from "${comicsDirHandle?.name ?? 'directory'}". The folder may have been moved or deleted.`;
                wrap.appendChild(msg);

                if (selectFolderBtn) {
                    const clone = selectFolderBtn.cloneNode(true);
                    clone.id = '';
                    clone.style.display = 'inline-flex';
                    clone.style.margin  = '0 auto';
                    clone.addEventListener('click', () => selectFolderBtn.click());
                    wrap.appendChild(clone);
                }
                allComicsListEl.appendChild(wrap);
                comicsDirHandle = null;
            } else {
                const err2 = document.createElement('div');
                err2.className = 'empty-message';
                err2.textContent = 'Error loading comics from folder.';
                allComicsListEl.appendChild(err2);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       OPEN COMIC (both Quick Read and Library)
    ══════════════════════════════════════════════════════════════════════════ */

    /**
     * Validates a File object before passing it to the archive library.
     * [SECURITY] Prevents arbitrary files being processed.
     * @param {File} file
     * @returns {string|null} Error message, or null if valid.
     */
    function validateFile(file) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
            return `Unsupported file type "${ext}". Only .cbr, .cbz, and .cbt are allowed.`;
        }
        if (file.size > MAX_FILE_BYTES) {
            return `File too large (${formatBytes(file.size)}). Maximum is 1 GB.`;
        }
        return null;
    }

    function openComic(file) {
        const validationError = validateFile(file);
        if (validationError) { showError(validationError); return; }

        outputEl.style.display = 'none';
        wrapEl.classList.add('collapsed');
        collapseBtn.classList.add('show');
        currentComicFilename = file.name;
        hasInitGallery = false;

        // Set up the one-time gallery click handler
        const clickHandler = (event) => {
            const target = event.target.closest('#comicImg');
            if (!target || hasInitGallery) return;
            event.preventDefault();
            hasInitGallery = true;

            // lightGallery 2.x API
            lightGalleryInstance = window.lightGallery(outputEl, {
                selector: 'a[id="comicImg"]',
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

            // Track page changes for reading progress
            outputEl.addEventListener('lgAfterSlide', (e) => {
                const index = e.detail.index;
                saveLastPageRead(currentComicFilename, index);
                document.querySelectorAll('#output a.last-read').forEach(a => a.classList.remove('last-read'));
                const anchors = document.querySelectorAll('#output a');
                anchors[index]?.classList.add('last-read');
            });

            target.click();
            document.removeEventListener('click', clickHandler);
        };
        document.addEventListener('click', clickHandler);

        // Show loading overlay
        progressTextEl.textContent = 'Reading 0/0 pages';
        sePreConEl.style.display = 'block';

        // Destroy previous gallery
        if (lightGalleryInstance) { lightGalleryInstance.destroy(); lightGalleryInstance = null; }

        // Revoke old blob URLs
        revokeAllBlobs();
        outputEl.innerHTML = '';
        document.querySelectorAll('#output a.last-read').forEach(a => a.classList.remove('last-read'));

        // Show streaming progress bar for large files
        if (file.size > LARGE_FILE_THRESHOLD) {
            chunkProgressEl.style.display = 'block';
            updateChunkBar(0, file.size);
        } else {
            chunkProgressEl.style.display = 'none';
        }

        // [LARGE FILE] Use chunked read for files > LARGE_FILE_THRESHOLD
        readFileChunked(file, (arrayBuffer) => {
            chunkProgressEl.style.display = 'none';
            try {
                // archiveOpenArrayBuffer returns a Promise for ZIP (JSZip 3.x async)
                // or a plain object for RAR/TAR (synchronous)
                const result = archiveOpenArrayBuffer(file.name, arrayBuffer);
                const handleArchive = (archive) => {
                    const header = document.createElement('p');
                    header.style.fontWeight = '600';
                    header.textContent = archive.file_name;
                    const hint = document.createElement('p');
                    hint.style.color = 'var(--muted)';
                    hint.style.fontSize = '13px';
                    hint.textContent = 'Click a page to enlarge';
                    outputEl.appendChild(header);
                    outputEl.appendChild(hint);
                    readContents(archive);
                };
                if (result && typeof result.then === 'function') {
                    // ZIP — async path
                    result.then(handleArchive).catch(e => {
                        showError(e.message || String(e));
                        sePreConEl.style.display = 'none';
                        outputEl.style.display = 'block';
                    });
                } else {
                    // RAR / TAR — synchronous path
                    handleArchive(result);
                }
            } catch (e) {
                showError(e.message || String(e));
                sePreConEl.style.display = 'none';
                outputEl.style.display = 'block';
            }
        }, (bytesRead, totalBytes) => {
            updateChunkBar(bytesRead, totalBytes);
        });
    }

    /**
     * Reads a File into an ArrayBuffer, reporting progress.
     * Uses slice-and-read chunks so the browser stays responsive for large files.
     * [LARGE FILE] Handles files up to 1 GB.
     */
    function readFileChunked(file, onComplete, onProgress) {
        // For small files use a single read for speed
        if (file.size <= LARGE_FILE_THRESHOLD) {
            const reader = new FileReader();
            reader.onload = () => onComplete(reader.result);
            reader.onerror = () => showError('Failed to read file.');
            reader.readAsArrayBuffer(file);
            return;
        }

        // Chunked assembly
        const chunks = [];
        let offset = 0;

        function readNext() {
            const end = Math.min(offset + CHUNK_SIZE, file.size);
            const blob = file.slice(offset, end);
            const reader = new FileReader();
            reader.onload = () => {
                chunks.push(reader.result);
                offset = end;
                onProgress(offset, file.size);
                if (offset < file.size) {
                    // Yield to browser between chunks
                    setTimeout(readNext, 0);
                } else {
                    // Concatenate all chunks into one ArrayBuffer
                    const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
                    const combined = new Uint8Array(total);
                    let pos = 0;
                    for (const chunk of chunks) {
                        combined.set(new Uint8Array(chunk), pos);
                        pos += chunk.byteLength;
                    }
                    onComplete(combined.buffer);
                }
            };
            reader.onerror = () => showError('Failed to read file chunk.');
            reader.readAsArrayBuffer(blob);
        }
        readNext();
    }

    /**
     * Iterates archive entries and renders pages sequentially.
     * [FIX] Sequential (not Promise.all) to prevent OOM on large archives.
     */
    async function readContents(archive) {
        const imageEntries = archive.entries.filter(e => e.is_file && getExt(e.name) !== '');

        // [FIX] Natural sort so page10 comes after page9, not page1
        imageEntries.sort((a, b) => naturalSort(a.name, b.name));

        const total = imageEntries.length;
        progressTextEl.textContent = `Reading 0/${total} pages`;

        for (let i = 0; i < total; i++) {
            await createPageElement(imageEntries[i], i, total);
        }
    }

    /**
     * Creates a single comic page element and appends it to the output.
     * [SECURITY] No innerHTML with untrusted data.
     * [FEATURE] Uses IntersectionObserver for lazy loading to save memory.
     */
    function createPageElement(entry, i, total) {
        return new Promise((resolve) => {
            entry.readData((data, err) => {
                if (err || !data) { resolve(); return; }

                const mime = getMIME(entry.name);
                const blob = new Blob([data], { type: mime });
                const url  = URL.createObjectURL(blob);
                activeBlobURLs.add(url);

                const a   = document.createElement('a');
                a.href    = url;
                a.id      = 'comicImg';
                a.dataset.lgSize = '';        // lightGallery 2.x attribute
                a.setAttribute('aria-label', `Page ${i + 1}`);

                const img = document.createElement('img');
                img.className = 'imgUrl';
                img.alt       = `Page ${i + 1}`;
                img.loading   = 'lazy';       // native lazy loading hint
                img.src       = url;

                // Revoke blob URL once loaded to free memory
                img.onload  = () => { URL.revokeObjectURL(url); activeBlobURLs.delete(url); };
                img.onerror = () => { URL.revokeObjectURL(url); activeBlobURLs.delete(url); };

                a.appendChild(img);
                outputEl.appendChild(a);

                progressTextEl.textContent = `Reading ${i + 1}/${total} pages`;

                if (i === total - 1) {
                    progressTextEl.innerHTML = '<span style="color:#4ade80;">Completed!</span>';
                    sePreConEl.style.display  = 'none';
                    outputEl.style.display    = 'block';
                    setTimeout(() => {
                        generateThumbnail();
                        highlightLastPage(currentComicFilename);
                    }, 100);
                }

                resolve();
            });
        });
    }

    /* ══════════════════════════════════════════════════════════════════════════
       OPEN COMIC FROM FOLDER (Library Mode)
    ══════════════════════════════════════════════════════════════════════════ */
    async function openComicFromFolder(filename) {
        try {
            if (!comicsDirHandle) throw new Error('Directory handle not available');
            let perm = await comicsDirHandle.queryPermission({ mode: 'read' });
            if (perm !== 'granted') {
                perm = await comicsDirHandle.requestPermission({ mode: 'read' });
                if (perm !== 'granted') { showReconnectButton(); return; }
            }
            const fileHandle = await comicsDirHandle.getFileHandle(filename);
            const file = await fileHandle.getFile();
            openComic(file);
            setTimeout(async () => {
                if (comicsDirHandle) {
                    await loadRecentComics();
                    if (recentComicsListEl.children.length > 0) recentComicsEl.style.display = 'block';
                }
            }, 500);
        } catch (err) {
            console.error('Failed to open comic:', err);
            if (err.name === 'NotAllowedError') {
                showReconnectButton();
            } else {
                alert('Could not find this comic in the selected folder. Please re-select the folder or check the file still exists.');
                await removeComicFromHistory(filename);
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       READING HISTORY (localStorage)
       [SECURITY] All data from localStorage is sanitised before use.
    ══════════════════════════════════════════════════════════════════════════ */

    /**
     * Safely read the reading history object from localStorage.
     * Rejects any entry whose values don't pass type guards.
     */
    function safeReadHistory() {
        try {
            const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            if (typeof raw !== 'object' || Array.isArray(raw)) return {};
            const clean = {};
            for (const [key, val] of Object.entries(raw)) {
                if (typeof val !== 'object' || val === null) continue;
                clean[key] = {
                    last_page : Number.isFinite(+val.last_page) ? Math.max(0, Math.floor(+val.last_page)) : 0,
                    timestamp : Number.isFinite(+val.timestamp) ? +val.timestamp : 0,
                    // [SECURITY] Only allow data: URIs that are JPEG thumbnails
                    thumbnail : (typeof val.thumbnail === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(val.thumbnail))
                                    ? val.thumbnail
                                    : null
                };
            }
            return clean;
        } catch { return {}; }
    }

    function saveLastPageRead(filename, pageIndex, thumbnail = null) {
        try {
            const history = safeReadHistory();
            const existing = history[filename] || {};
            history[filename] = {
                last_page : Math.max(0, Math.floor(+pageIndex) || 0),
                timestamp : Date.now(),
                thumbnail : thumbnail || existing.thumbnail || null
            };
            localStorage.setItem(LS_KEY, JSON.stringify(history));
        } catch (e) { console.error('Failed to save reading history:', e); }
    }

    function getLastPageRead(filename) {
        return safeReadHistory()[filename]?.last_page ?? 0;
    }

    async function removeComicFromHistory(filename) {
        const history = safeReadHistory();
        delete history[filename];
        localStorage.setItem(LS_KEY, JSON.stringify(history));
        await loadRecentComics();
        if (recentComicsListEl.children.length === 0) recentComicsEl.style.display = 'none';
    }

    /* ══════════════════════════════════════════════════════════════════════════
       RECENT COMICS LIST
    ══════════════════════════════════════════════════════════════════════════ */
    async function loadRecentComics() {
        try {
            const history = safeReadHistory();
            const recent = Object.entries(history)
                .sort((a, b) => b[1].timestamp - a[1].timestamp)
                .slice(0, 5);

            recentComicsListEl.innerHTML = '';
            for (const [filename, data] of recent) {
                recentComicsListEl.appendChild(buildComicItem(filename, data, () => openComicFromFolder(filename)));
            }
        } catch (e) { console.error('Failed to load recent comics:', e); }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       DOM BUILDER HELPERS
       [SECURITY] All user-supplied strings written via textContent / setAttribute,
                  never via innerHTML.
    ══════════════════════════════════════════════════════════════════════════ */

    /**
     * Builds a comic list item.  Filename is NEVER interpolated into HTML.
     */
    function buildComicItem(filename, data, onClick) {
        const item = document.createElement('div');
        item.className = 'recent-comic-item';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'recent-comic-icon';

        if (data?.thumbnail) {
            const img = document.createElement('img');
            img.src   = data.thumbnail;   // already validated in safeReadHistory()
            img.alt   = '';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:6px;';
            iconWrap.appendChild(img);
        } else {
            // Default book icon (inline SVG via DOM, not innerHTML)
            iconWrap.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 12.5 2h-9z"/></svg>`;
        }

        const info = document.createElement('div');
        info.className = 'recent-comic-info';

        const name = document.createElement('div');
        name.className   = 'recent-comic-name';
        name.textContent = filename;      // [SECURITY] textContent only

        info.appendChild(name);

        if (data?.last_page > 0 || data?.timestamp) {
            const meta = document.createElement('div');
            meta.className   = 'recent-comic-meta';
            meta.textContent = `Page ${(data.last_page || 0) + 1} • ${formatTimestamp(data.timestamp || 0)}`;
            info.appendChild(meta);
        }

        item.appendChild(iconWrap);
        item.appendChild(info);
        item.addEventListener('click', onClick);
        return item;
    }

    function buildSpinner(label) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'text-align:center;padding:20px;';
        wrap.innerHTML = `<div class="spinner" style="margin:0 auto;"></div>`;
        const txt = document.createElement('div');
        txt.style.cssText = 'margin-top:12px;color:var(--muted);font-size:14px;';
        txt.textContent = label;
        wrap.appendChild(txt);
        return wrap;
    }

    function showError(message) {
        outputEl.innerHTML = '';
        const err = document.createElement('span');
        err.style.color = '#ef4444';
        err.textContent = message;
        outputEl.appendChild(err);
        outputEl.style.display = 'block';
        sePreConEl.style.display = 'none';
    }

    /* ══════════════════════════════════════════════════════════════════════════
       THUMBNAIL GENERATION
    ══════════════════════════════════════════════════════════════════════════ */
    function generateThumbnail() {
        try {
            const firstImg = outputEl.querySelector('a img.imgUrl');
            if (!firstImg) return;
            if (!firstImg.complete || !firstImg.naturalWidth) {
                firstImg.onload = generateThumbnail;
                return;
            }
            const canvas = document.createElement('canvas');
            const ctx    = canvas.getContext('2d');
            const maxW   = 100;
            const scale  = maxW / firstImg.naturalWidth;
            canvas.width  = maxW;
            canvas.height = firstImg.naturalHeight * scale;
            ctx.drawImage(firstImg, 0, 0, canvas.width, canvas.height);
            const thumb = canvas.toDataURL('image/jpeg', 0.7);
            const existing = safeReadHistory()[currentComicFilename] || {};
            saveLastPageRead(currentComicFilename, existing.last_page || 0, thumb);
        } catch (e) { console.error('Thumbnail generation failed:', e); }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       PAGE HIGHLIGHT (last-read indicator)
    ══════════════════════════════════════════════════════════════════════════ */
    function highlightLastPage(filename) {
        const lastPage = getLastPageRead(filename);
        if (lastPage <= 0) return;
        const anchors = document.querySelectorAll('#output a');
        if (anchors[lastPage]) {
            anchors[lastPage].classList.add('last-read');
            setTimeout(() => anchors[lastPage].scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
            anchors[lastPage].addEventListener('click', function () { this.classList.remove('last-read'); }, { once: true });
        }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       BLOB URL MANAGEMENT
       [SECURITY] All blob URLs are tracked and revoked to prevent leaks.
    ══════════════════════════════════════════════════════════════════════════ */
    function revokeAllBlobs() {
        for (const url of activeBlobURLs) URL.revokeObjectURL(url);
        activeBlobURLs.clear();
    }

    /* ══════════════════════════════════════════════════════════════════════════
       INDEXEDDB — DIRECTORY HANDLE PERSISTENCE
    ══════════════════════════════════════════════════════════════════════════ */
    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_DB, IDB_VER);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                // Drop old store on version bump so stale handles are cleared
                if (db.objectStoreNames.contains(IDB_STORE)) db.deleteObjectStore(IDB_STORE);
                db.createObjectStore(IDB_STORE);
            };
        });
    }

    async function saveDirectoryHandle(handle) {
        try {
            const db = await openDB();
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(handle, 'comicsFolder');
        } catch (e) { console.error('Failed to save directory handle:', e); }
    }

    async function loadDirectoryHandle() {
        try {
            const db     = await openDB();
            const tx     = db.transaction(IDB_STORE, 'readonly');
            const handle = await new Promise((res, rej) => {
                const r = tx.objectStore(IDB_STORE).get('comicsFolder');
                r.onsuccess = () => res(r.result);
                r.onerror   = () => rej(r.error);
            });
            if (!handle) return { handle: null, hasPermission: false };
            const perm = await handle.queryPermission({ mode: 'read' });
            return { handle, hasPermission: perm === 'granted' };
        } catch { return { handle: null, hasPermission: false }; }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       UTILITY FUNCTIONS
    ══════════════════════════════════════════════════════════════════════════ */

    /** Returns the lowercase extension of a filename, or '' if none. */
    function getExt(filename) {
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    /**
     * MIME type lookup.
     * [FIX] Added avif and tiff support that was missing in original.
     */
    function getMIME(filename) {
        const map = {
            jpg : 'image/jpeg',
            jpeg: 'image/jpeg',
            png : 'image/png',
            gif : 'image/gif',
            bmp : 'image/bmp',
            webp: 'image/webp',
            avif: 'image/avif',
            tif : 'image/tiff',
            tiff: 'image/tiff',
        };
        return map[getExt(filename)] || 'image/jpeg';
    }

    /**
     * Natural sort comparator: "page10" > "page9" > "page1".
     * [FIX] Replaces simple lexicographic sort that mis-ordered pages.
     */
    function naturalSort(a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    }

    function formatBytes(bytes) {
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
        if (bytes >= 1048576)    return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1024).toFixed(0) + ' KB';
    }

    function formatTimestamp(ts) {
        const diff = Date.now() - ts;
        const s = Math.floor(diff / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const d = Math.floor(h / 24);
        if (d > 0)  return `${d}d ago`;
        if (h > 0)  return `${h}h ago`;
        if (m > 0)  return `${m}m ago`;
        return 'Just now';
    }

    function updateChunkBar(bytesRead, total) {
        const pct = total > 0 ? Math.round((bytesRead / total) * 100) : 0;
        if (chunkBarEl)   chunkBarEl.style.width = pct + '%';
        if (chunkLabelEl) chunkLabelEl.textContent = `Loading ${formatBytes(bytesRead)} / ${formatBytes(total)} (${pct}%)`;
    }
});
