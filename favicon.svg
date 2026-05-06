/*!
 * Dropzone — vendored minimal build
 * Based on Dropzone.js MIT License | https://www.dropzone.dev
 *
 * CHANGELOG (assets/js/vendor/dropzone.min.js) — v2.1.0
 * [FIX] Dropzone 6.0.0 on jsdelivr/unpkg served as text/plain (wrong MIME),
 *       causing CORS failure and "Dropzone is not defined" at runtime.
 *       Now vendored locally as a plain-JS IIFE — zero CDN dependency.
 */
(function (global) {
  'use strict';

  function Dropzone(el, opts) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) throw new Error('Dropzone: invalid element');
    if (el.dropzone) throw new Error('Dropzone: already attached');

    this.element  = el;
    this.files    = [];
    this._cbs     = {};

    var defaults = {
      acceptedFiles:       null,
      maxFiles:            null,
      maxFilesize:         1024,        // MB
      createImageThumbnails: false,
      autoProcessQueue:    false,
      previewsContainer:   false,
      clickable:           true,
      url:                 '#',
      init:                function () {}
    };
    this.options = Object.assign({}, defaults, opts || {});

    el.dropzone = this;
    Dropzone.instances.push(this);

    // Hidden file input for click-to-open
    if (this.options.clickable) {
      this._input = this._makeInput();
      this._input.addEventListener('change', function (e) {
        Array.from(e.target.files).forEach(function (f) { this.addFile(f); }, this);
        // Reset so same file can be re-selected
        var fresh = this._makeInput();
        this._input.parentNode.replaceChild(fresh, this._input);
        this._input = fresh;
        this._input.addEventListener('change', arguments.callee.bind(this));
      }.bind(this));
    }

    // Drag events on element
    var dz = this;
    el.addEventListener('dragover',  function (e) { e.preventDefault(); el.classList.add('dz-drag-hover');    dz.emit('dragover',  e); });
    el.addEventListener('dragleave', function (e) {                      el.classList.remove('dz-drag-hover'); dz.emit('dragleave', e); });
    el.addEventListener('drop',      function (e) {
      e.preventDefault();
      el.classList.remove('dz-drag-hover');
      dz.emit('drop', e);
      var files = e.dataTransfer ? e.dataTransfer.files : null;
      if (files && files.length) Array.from(files).forEach(function (f) { dz.addFile(f); });
    });

    // [FIX v2.2.1] Prevent browser from navigating when files are dropped
    // outside the dropzone element. Without these, the browser intercepts
    // the drop and shows "not allowed" cursor over the whole page.
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop',     function (e) { e.preventDefault(); });

    // Click opens file picker
    el.addEventListener('click', function (e) {
      if (dz.options.clickable && dz._input) dz._input.click();
    });

    this.options.init.call(this);
  }

  Dropzone.prototype._makeInput = function () {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.style.cssText = 'display:none;position:absolute;top:0;left:0;width:0;height:0;';
    if (this.options.acceptedFiles) inp.accept = this.options.acceptedFiles;
    document.body.appendChild(inp);
    return inp;
  };

  Dropzone.prototype.on = function (ev, fn) {
    (this._cbs[ev] = this._cbs[ev] || []).push(fn);
    return this;
  };

  Dropzone.prototype.emit = function (ev) {
    var args = Array.prototype.slice.call(arguments, 1);
    var fns  = this._cbs[ev] || [];
    fns.forEach(function (fn) { fn.apply(this, args); }, this);
    return this;
  };

  Dropzone.prototype.addFile = function (file) {
    // Extension check
    if (this.options.acceptedFiles) {
      var allowed = this.options.acceptedFiles.split(',').map(function (s) { return s.trim().toLowerCase(); });
      var ext     = '.' + file.name.split('.').pop().toLowerCase();
      if (!allowed.some(function (a) { return a === ext || a === file.type; })) {
        this.emit('error', file, 'Invalid file type');
        return;
      }
    }
    // Size check (maxFilesize in MB)
    if (this.options.maxFilesize && file.size > this.options.maxFilesize * 1024 * 1024) {
      this.emit('error', file, 'File too large');
      return;
    }
    // maxFiles
    if (this.options.maxFiles && this.files.length >= this.options.maxFiles) {
      this.emit('maxfilesexceeded', file);
      return;
    }
    file.status = Dropzone.ADDED;
    this.files.push(file);
    this.emit('addedfile', file);
  };

  Dropzone.prototype.removeAllFiles = function () {
    this.files = [];
    return this;
  };

  Dropzone.prototype.destroy = function () {
    if (this._input && this._input.parentNode) this._input.parentNode.removeChild(this._input);
    delete this.element.dropzone;
    Dropzone.instances = Dropzone.instances.filter(function (d) { return d !== this; }, this);
  };

  Dropzone.autoDiscover = true;
  Dropzone.instances    = [];
  Dropzone.ADDED        = 'added';
  Dropzone.QUEUED       = 'queued';
  Dropzone.UPLOADING    = 'uploading';
  Dropzone.CANCELED     = 'canceled';
  Dropzone.ERROR        = 'error';
  Dropzone.SUCCESS      = 'success';

  Dropzone.optionsForElement = function (el) {
    if (el && el.getAttribute('id')) return Dropzone.options[el.getAttribute('id')];
  };
  Dropzone.options = {};

  global.Dropzone = Dropzone;
}(typeof window !== 'undefined' ? window : this));
