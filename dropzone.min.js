/**
 * uncompress.js — v3.0.0
 *
 * Drop-in replacement for the original workhorsy/uncompress.js.
 * Replaces the old Emscripten libunrar.js (~2015 build) and the separate
 * JSZip/libuntar shims with a single unified backend: libarchive-wasm
 * (libarchive compiled to WebAssembly, MIT licence, actively maintained).
 *
 * Public API (identical to the previous version — script.js is unchanged):
 *   loadArchiveFormats(formats)          — no-op kept for compatibility
 *   archiveOpenFile(file, cb)            — reads a File object
 *   archiveOpenArrayBuffer(name, buf)    — reads an ArrayBuffer; returns Promise
 *   archiveClose(archive)               — releases memory
 *   isRarFile / isZipFile / isTarFile   — magic-byte helpers
 *
 * Entry objects expose:
 *   { name, is_file, size_compressed, size_uncompressed, readData(cb) }
 *
 * Security improvements over v2.x:
 *   • No unsafe-eval required (libarchive-wasm is a clean WASM module)
 *   • RAR5 support (libunrar.js did not support RAR v5)
 *   • Path-traversal entries ('..' in name) are silently skipped
 *   • libunrar.js and libunrar.js.mem removed from the repository
 *
 * Dependencies (self-hosted):
 *   libarchive-browser.js  — esbuild IIFE bundle of libarchive-wasm@1.2.0.
 *                            Exposes window.libarchiveWasm, window.ArchiveReader,
 *                            window.ArchiveReaderEntry as browser globals.
 *   libarchive.wasm        — the compiled WebAssembly binary (599 KB).
 *                            Must be in the same directory as this script.
 *                            Served by Cloudflare Pages as application/wasm.
 *
 * Load order in index.html:
 *   1. libarchive-browser.js  (sets window.libarchiveWasm + ArchiveReader)
 *   2. uncompress.js          (this file — uses those globals)
 *
 * CHANGELOG
 * ─────────────────────────────────────────────────────────────────────────
 * [v3.0.0] Replace libunrar.js + JSZip + libuntar with libarchive-wasm@1.2.0.
 *          • All formats (RAR4, RAR5, ZIP, TAR, 7z, …) handled by one library.
 *          • unsafe-eval no longer required in the CSP.
 *          • Path-traversal guard retained from v2.0.0.
 *          • loadArchiveFormats() kept as no-op for API compatibility.
 *          • currentScriptPath() stack-trace hack removed entirely.
 *          • ArchiveReader used as global (exposed by browser bundle); WASM
 *            binary located via locateFile() pointing at our assets directory.
 *          • Entry data read eagerly inside forEach() — libarchive requires
 *            sequential access and cannot seek after the iterator advances.
 *          • reader.free() called in finally block for guaranteed WASM cleanup.
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

(function () {

    /* ── Module-load state ─────────────────────────────────────────────── */

    /** @type {Promise<object>|null} Singleton — load the WASM module once. */
    var _modulePromise = null;

    /**
     * Base URL of this script — captured synchronously at load time via
     * document.currentScript (set during synchronous script evaluation).
     * Used by locateFile() to tell the Emscripten loader where libarchive.wasm lives.
     * @type {string}
     */
    var _scriptBase = (function () {
        var s = document.currentScript;
        if (s && s.src) {
            return s.src.substring(0, s.src.lastIndexOf('/') + 1);
        }
        return './assets/js/uncompress/';
    }());

    /**
     * Lazily initialise the libarchive WASM module.
     *
     * libarchiveWasm() is exposed as a browser global by libarchive-browser.js.
     * It returns a Promise that resolves to the wrapped libarchive module
     * (an object with cwrap-bound functions: read_new_memory, entry_pathname, etc.).
     *
     * @returns {Promise<object>}
     */
    function getModule() {
        if (_modulePromise) return _modulePromise;

        if (typeof window.libarchiveWasm !== 'function') {
            return Promise.reject(new Error(
                'libarchiveWasm global not found. ' +
                'Ensure libarchive-browser.js is loaded before uncompress.js.'
            ));
        }

        _modulePromise = window.libarchiveWasm({
            locateFile: function (filename) {
                // Routes libarchive.wasm fetch to our self-hosted copy.
                return _scriptBase + filename;
            }
        });

        return _modulePromise;
    }

    /* ── Public: compatibility shim ───────────────────────────────────── */

    /**
     * No-op — kept so callers using the old API do not throw.
     * libarchive-wasm handles all formats through one unified module.
     */
    function loadArchiveFormats(/* formats */) { /* intentional no-op */ }

    /* ── Public: open a File object ───────────────────────────────────── */

    /**
     * Read a browser File object and open it as an archive.
     *
     * @param {File}     file
     * @param {Function} cb   Called as cb(archive, error)
     */
    function archiveOpenFile(file, cb) {
        var fr = new FileReader();
        fr.onload = function (evt) {
            archiveOpenArrayBuffer(file.name, evt.target.result)
                .then(function (archive) { cb(archive, null); })
                .catch(function (e)      { cb(null, e);       });
        };
        fr.onerror = function () {
            cb(null, new Error('FileReader failed to read the file.'));
        };
        fr.readAsArrayBuffer(file.slice());
    }

    /* ── Public: open an ArrayBuffer ──────────────────────────────────── */

    /**
     * Open a raw ArrayBuffer as an archive.
     *
     * @param  {string}       file_name    Original filename.
     * @param  {ArrayBuffer}  array_buffer Raw archive bytes.
     * @returns {Promise<object>}
     */
    function archiveOpenArrayBuffer(file_name, array_buffer) {
        return getModule().then(function (mod) {
            return _openWithModule(mod, file_name, array_buffer);
        });
    }

    /* ── Internal: build archive descriptor from loaded module ────────── */

    /**
     * Open the archive and eagerly extract all entry data into JS memory.
     *
     * libarchive requires strictly sequential access — once the entry iterator
     * advances past an entry, its data cannot be re-read.  We copy all entry
     * data out of the WASM heap inside forEach() so each entry's readData()
     * callback can deliver bytes asynchronously later, independently.
     *
     * Important: ArchiveReader.forEach() calls entry.free() after the user
     * callback returns.  entry.free() calls skipData() if readData() was not
     * called, and nulls out the reader reference.  Therefore:
     *   • Call readData() OR skipData() inside the callback — not both.
     *   • The Int8Array returned by readData() is a view into WASM HEAP8;
     *     call .slice() immediately to copy it before the heap is reused.
     *
     * @param  {object}      mod          Wrapped libarchive module.
     * @param  {string}      file_name
     * @param  {ArrayBuffer} array_buffer
     * @returns {object}                  Archive descriptor.
     */
    function _openWithModule(mod, file_name, array_buffer) {
        // ArchiveReader is exposed as a global by libarchive-browser.js.
        // Constructor: new ArchiveReader(wrappedLibarchiveModule, Int8Array)
        if (typeof window.ArchiveReader !== 'function') {
            throw new Error(
                'ArchiveReader global not found. ' +
                'Ensure libarchive-browser.js loaded correctly.'
            );
        }

        var int8   = new Int8Array(array_buffer);
        var reader = new window.ArchiveReader(mod, int8);
        var entries = [];

        try {
            reader.forEach(function (entry) {
                var name = entry.getPathname();

                // [SECURITY] Reject path-traversal sequences.
                if (!name || name.indexOf('..') !== -1) {
                    entry.skipData(); // must call skipData or readData before free()
                    return;
                }

                var filetype = entry.getFiletype();
                var is_file  = (filetype === 'File');
                var size     = entry.getSize() || 0;

                if (!is_file) {
                    // Directories have no data — skipData() is required before
                    // forEach's entry.free() is called.
                    entry.skipData();
                    entries.push({
                        name: name, is_file: false,
                        size_compressed: 0, size_uncompressed: 0,
                        readData: function (cb) {
                            setTimeout(function () { cb(null, null); }, 0);
                        }
                    });
                    return;
                }

                // Read entry data eagerly.
                // readData() returns an Int8Array view into the WASM HEAP8.
                // .slice() copies bytes into a new independent ArrayBuffer
                // before forEach() calls entry.free() and the heap slot is freed.
                var data = null;
                try {
                    var raw = entry.readData(); // consumes the entry; marks readCalled=true
                    if (raw && raw.length) {
                        data = raw.slice().buffer; // Int8Array → copy → ArrayBuffer
                    } else {
                        data = new ArrayBuffer(0);
                    }
                } catch (e) {
                    // Encrypted, corrupted, or zero-size entry — expose via readData error.
                    data = null;
                }
                // Note: do NOT call entry.skipData() here — readData() already consumed
                // the entry data stream (readCalled=true).  forEach will call entry.free()
                // which calls skipData() only if readCalled is still false.

                entries.push({
                    name: name, is_file: true,
                    size_compressed:   size,
                    size_uncompressed: size,
                    readData: (function (d) {
                        return function (cb) {
                            setTimeout(function () {
                                if (d !== null) {
                                    cb(d, null);
                                } else {
                                    cb(null, new Error('Entry data unavailable (encrypted or corrupt).'));
                                }
                            }, 0);
                        };
                    }(data))
                });
            });
        } finally {
            // Guaranteed cleanup of WASM heap memory even if iteration threw.
            try { reader.free(); } catch (_) {}
        }

        if (!entries.length) {
            throw new Error('No readable entries found in archive.');
        }

        // Note: entries are NOT sorted here. processArchive() in script.js
        // applies naturalCompare sorting after filtering to image files only,
        // which is the correct place to own display ordering.

        return {
            file_name:    file_name,
            archive_type: 'libarchive',
            array_buffer: array_buffer,
            entries:      entries,
            handle:       null // no opaque handle — data already in JS memory
        };
    }

    /* ── Public: release ──────────────────────────────────────────────── */

    /**
     * Release an archive object.
     * All entry data was copied into JS-owned ArrayBuffers at open time,
     * so there is nothing WASM-side to free here.  Kept for API compatibility.
     *
     * @param {object} archive
     */
    function archiveClose(archive) {
        if (!archive) return;
        archive.file_name = archive.archive_type = archive.array_buffer =
            archive.entries = archive.handle = null;
    }

    /* ── Public: magic-byte helpers ───────────────────────────────────── */

    /** @param {ArrayBuffer} buf @returns {boolean} */
    function isRarFile(buf) {
        if (!buf || buf.byteLength < 8) return false;
        var b = new Uint8Array(buf);
        if (b[0]===0x52&&b[1]===0x61&&b[2]===0x72&&b[3]===0x21&&
            b[4]===0x1A&&b[5]===0x07&&b[6]===0x01&&b[7]===0x00) return true; // RAR 5
        if (b[0]===0x52&&b[1]===0x61&&b[2]===0x72&&b[3]===0x21&&
            b[4]===0x1A&&b[5]===0x07&&b[6]===0x00) return true;               // RAR 1.5–4
        if (b[0]===0x52&&b[1]===0x45&&b[2]===0x7E&&b[3]===0x5E) return true; // Old-style
        return false;
    }

    /** @param {ArrayBuffer} buf @returns {boolean} */
    function isZipFile(buf) {
        if (!buf || buf.byteLength < 4) return false;
        var b = new Uint8Array(buf);
        return b[0]===0x50&&b[1]===0x4B&&b[2]===0x03&&b[3]===0x04;
    }

    /** @param {ArrayBuffer} buf @returns {boolean} */
    function isTarFile(buf) {
        if (!buf || buf.byteLength < 512) return false;
        var b   = new Uint8Array(buf);
        var sig = [0x75, 0x73, 0x74, 0x61, 0x72]; // "ustar"
        for (var i = 0; i < sig.length; i++) {
            if (b[257 + i] !== sig[i]) return false;
        }
        return true;
    }

    /* ── Export to global scope ────────────────────────────────────────── */

    var scope = (typeof window !== 'undefined') ? window : self;
    scope.loadArchiveFormats     = loadArchiveFormats;
    scope.archiveOpenFile        = archiveOpenFile;
    scope.archiveOpenArrayBuffer = archiveOpenArrayBuffer;
    scope.archiveClose           = archiveClose;
    scope.isRarFile              = isRarFile;
    scope.isZipFile              = isZipFile;
    scope.isTarFile              = isTarFile;

}());
