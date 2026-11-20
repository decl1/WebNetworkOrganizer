"use strict";

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFsTime(mtime) {
  if (!mtime) {
    return "—";
  }
  const date = new Date(mtime * 1000);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour12: false })}`;
}

function fsParentPath(path) {
  if (!path || path === "/") {
    return "/";
  }
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

function fsFileName(path) {
  const name = String(path || "").split("/").filter(Boolean).pop();
  return name || path || "";
}

class FileManagerWindow extends BaseWindow {
  constructor(host) {
    super({
      id: `files-${host.id}`,
      title: `${t("files")} · ${host.name}`,
      icon: ICONS.folder,
      width: 760,
      height: 480,
    });
    this.host = host;
    this.cwd = "~";
  }

  createContent() {
    this.body.innerHTML = `
      <div class="fs-toolbar">
        <button type="button" class="btn icon" data-fs-action="up" data-i18n-title="fsUp" title="${t("fsUp")}">${ICONS.arrowUp}</button>
        <button type="button" class="btn icon" data-fs-action="refresh" data-i18n-title="refresh" title="${t("refresh")}">${ICONS.refresh}</button>
        <div class="fs-path" data-fs-role="path"></div>
        <button type="button" class="btn" data-fs-action="console" title="${t("fsOpenInConsole")}">${ICONS.terminal}<span class="fs-console-label">${t("fsOpenInConsole")}</span></button>
      </div>
      <div class="fs-list" data-fs-role="list"></div>
      <div class="fs-status" data-fs-role="status"></div>`;
    this.pathEl = this.body.querySelector("[data-fs-role='path']");
    this.listEl = this.body.querySelector("[data-fs-role='list']");
    this.statusEl = this.body.querySelector("[data-fs-role='status']");

    this.body.querySelector("[data-fs-action='up']").addEventListener("click", () => this._goUp());
    this.body.querySelector("[data-fs-action='refresh']").addEventListener("click", () => this.reload());
    this.body
      .querySelector("[data-fs-action='console']")
      .addEventListener("click", () => this._openInConsole());

    this.pathEl.addEventListener("click", (event) => {
      const crumb = event.target.closest("[data-fs-nav]");
      if (crumb) {
        this.cwd = crumb.dataset.fsNav;
        this.reload();
      }
    });

    this.listEl.addEventListener("click", (event) => {
      const download = event.target.closest("[data-fs-download]");
      if (download) {
        event.stopPropagation();
        this._download(download.dataset.fsDownload);
        return;
      }
      const dir = event.target.closest("[data-fs-open]");
      if (dir) {
        this.cwd = dir.dataset.fsOpen;
        this.reload();
        return;
      }
      const file = event.target.closest("[data-fs-edit]");
      if (file) {
        openFileEditor(this.host, file.dataset.fsEdit);
      }
    });

    this.body.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      this.listEl.classList.add("fs-drag");
    });
    this.body.addEventListener("dragleave", (event) => {
      if (!this.body.contains(event.relatedTarget)) {
        this.listEl.classList.remove("fs-drag");
      }
    });
    this.body.addEventListener("drop", (event) => {
      event.preventDefault();
      this.listEl.classList.remove("fs-drag");
      const files = event.dataTransfer && Array.from(event.dataTransfer.files || []);
      if (files && files.length > 0) {
        this._upload(files);
      }
    });
  }

  onOpen() {
    this.reload();
  }

  restore() {
    super.restore();
    this.reload();
  }

  _setStatus(text, kind = "") {
    this.statusEl.textContent = text;
    this.statusEl.className = "fs-status" + (kind ? ` ${kind}` : "");
  }

  async reload() {
    if (this.minimized) {
      return;
    }
    this.listEl.innerHTML = `<p class="fs-empty">${t("sysInfoLoading")}</p>`;
    try {
      const result = await api(`/api/hosts/${this.host.id}/fs/list?path=${encodeURIComponent(this.cwd)}`);
      if (result.error) {
        this._showError(result.error);
        return;
      }
      this.cwd = result.path;
      this._render(result.entries);
    } catch (error) {
      this._showError(`${t("fsLoadError")} ${String(error)}`);
    }
  }

  _showError(message) {
    this.listEl.innerHTML = `<p class="fs-error">${escapeHtml(String(message))}</p>`;
    this.pathEl.innerHTML = `<span class="fs-crumb-sep">/</span><span class="fs-crumb">${escapeHtml(this.cwd)}</span>`;
  }

  _render(entries) {
    this.pathEl.innerHTML = this._breadcrumbs();
    if (entries.length === 0) {
      this.listEl.innerHTML = `<p class="fs-empty">${t("fsEmpty")}</p>`;
      return;
    }
    this.listEl.innerHTML = entries.map((entry) => this._rowHtml(entry)).join("");
  }

  _breadcrumbs() {
    const parts = this.cwd.split("/").filter(Boolean);
    const crumbs = [`<button type="button" class="fs-crumb" data-fs-nav="/">/</button>`];
    let acc = "";
    for (const part of parts) {
      acc += `/${part}`;
      crumbs.push(
        `<button type="button" class="fs-crumb" data-fs-nav="${escapeHtml(acc)}">${escapeHtml(part)}</button>`,
      );
    }
    return crumbs.join('<span class="fs-crumb-sep">›</span>');
  }

  _rowHtml(entry) {
    const isDir = entry.type === "dir";
    const icon = isDir ? ICONS.folder : ICONS.file;
    const name = escapeHtml(entry.name);
    const size = isDir ? "" : formatFileSize(entry.size);
    const time = formatFsTime(entry.mtime);
    const pathAttr = escapeHtml(entry.path);
    if (isDir) {
      return `<div class="fs-row" role="button" data-fs-open="${pathAttr}" title="${t("fsOpen")}">
        <span class="fs-cell fs-name fs-name-dir"><span class="fs-icon">${ICONS.folder}</span>${name}</span>
        <span class="fs-cell fs-size"></span>
        <span class="fs-cell fs-time">${time}</span>
        <span class="fs-cell fs-actions"></span>
      </div>`;
    }
    return `<div class="fs-row" data-fs-edit="${pathAttr}" title="${t("fsEdit")}">
      <span class="fs-cell fs-name"><span class="fs-icon">${ICONS.file}</span>${name}</span>
      <span class="fs-cell fs-size">${size}</span>
      <span class="fs-cell fs-time">${time}</span>
      <span class="fs-cell fs-actions">
        <button type="button" class="btn icon" data-fs-download="${pathAttr}" data-i18n-title="fsDownload" title="${t("fsDownload")}">${ICONS.download}</button>
      </span>
    </div>`;
  }

  _goUp() {
    this.cwd = fsParentPath(this.cwd);
    this.reload();
  }

  _openInConsole() {
    openHostConsole(this.host, this.cwd);
  }

  async _download(rawPath) {
    const name = fsFileName(rawPath);
    this._setStatus(`${t("fsDownload")} ${name}`);
    try {
      const response = await fetch(
        `/api/hosts/${this.host.id}/fs/download?path=${encodeURIComponent(rawPath)}`,
      );
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok && contentType.includes("json")) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this._setStatus("");
    } catch (error) {
      this._setStatus(`${t("fsDownloadError")} ${String(error)}`, "error");
    }
  }

  async _upload(files) {
    let uploaded = 0;
    let failed = 0;
    for (const file of files) {
      const ok = await this._uploadOne(file);
      if (ok) {
        uploaded += 1;
      } else {
        failed += 1;
      }
    }
    await this.reload();
    if (uploaded > 0 && failed === 0) {
      this._setStatus(t("fsUploaded").replace("{count}", String(uploaded)), "ok");
    } else if (failed > 0) {
      this._setStatus(t("fsUploaded").replace("{count}", String(uploaded)), "error");
    }
  }

  _uploadOne(file) {
    return new Promise((resolve) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `/api/hosts/${this.host.id}/fs/upload?path=${encodeURIComponent(this.cwd)}`,
      );
      xhr.responseType = "json";
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          this._setStatus(`${t("fsUploading").replace("{name}", file.name)} ${percent}%`);
        }
      });
      xhr.addEventListener("load", () => {
        const payload = xhr.response || {};
        if (xhr.status >= 400 || payload.error) {
          this._setStatus(`${t("fsUploadError")} ${file.name}: ${payload.error || `HTTP ${xhr.status}`}`, "error");
          resolve(false);
          return;
        }
        this._setStatus("");
        resolve(true);
      });
      xhr.addEventListener("error", () => {
        this._setStatus(`${t("fsUploadError")} ${file.name}`, "error");
        resolve(false);
      });
      xhr.send(form);
    });
  }
}

class FileEditorWindow extends BaseWindow {
  constructor(host) {
    super({
      id: `file-${host.id}`,
      title: `${t("fsEditor")} · ${host.name}`,
      icon: ICONS.pencil,
      width: 720,
      height: 500,
    });
    this.host = host;
    this.path = null;
    this._loadSeq = 0;
  }

  createContent() {
    this.body.innerHTML = `
      <div class="fs-toolbar">
        <span class="fs-editor-path" data-fs-role="path"></span>
        <button type="button" class="btn primary" data-fs-action="save">${t("save")}</button>
      </div>
      <textarea class="fs-editor" data-fs-role="editor" spellcheck="false"></textarea>
      <div class="fs-status" data-fs-role="status"></div>`;
    this.pathLabel = this.body.querySelector("[data-fs-role='path']");
    this.editor = this.body.querySelector("[data-fs-role='editor']");
    this.statusEl = this.body.querySelector("[data-fs-role='status']");
    this.saveBtn = this.body.querySelector("[data-fs-action='save']");

    this.saveBtn.addEventListener("click", () => this._save());
    this.editor.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        this._save();
      }
    });
    this.editor.addEventListener("input", () => this._setDirty());
  }

  _setStatus(text, kind = "") {
    this.statusEl.textContent = text;
    this.statusEl.className = "fs-status" + (kind ? ` ${kind}` : "");
  }

  _setDirty() {
    this.saveBtn.disabled = this.editor.disabled;
  }

  load(rawPath) {
    this.path = rawPath;
    this.pathLabel.textContent = rawPath;
    const seq = ++this._loadSeq;
    this.editor.disabled = true;
    this.saveBtn.disabled = true;
    this.editor.value = "";
    this._setStatus(t("sysInfoLoading"));
    api(`/api/hosts/${this.host.id}/fs/read?path=${encodeURIComponent(rawPath)}`)
      .then((result) => {
        if (seq !== this._loadSeq) {
          return;
        }
        if (result.error) {
          this._setStatus(result.error, "error");
          return;
        }
        this.pathLabel.textContent = result.path;
        this.editor.value = result.content;
        this.editor.disabled = result.binary || result.truncated;
        this.saveBtn.disabled = this.editor.disabled;
        if (result.binary) {
          this._setStatus(t("fsBinary"), "error");
        } else if (result.truncated) {
          this._setStatus(t("fsTooBig"), "error");
        } else {
          this._setStatus("");
        }
      })
      .catch((error) => {
        if (seq === this._loadSeq) {
          this._setStatus(`${t("fsReadError")} ${String(error)}`, "error");
        }
      });
  }

  async _save() {
    if (this.editor.disabled || !this.path) {
      return;
    }
    this._setStatus(t("saving"));
    try {
      const response = await fetch(
        `/api/hosts/${this.host.id}/fs/write?path=${encodeURIComponent(this.path)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          body: this.editor.value,
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      this._setStatus(t("fsSaved"), "ok");
    } catch (error) {
      this._setStatus(`${t("fsSaveError")} ${String(error)}`, "error");
    }
  }
}

function openHostFiles(host) {
  const existing = WindowManager.get(`files-${host.id}`);
  if (existing) {
    existing.restore();
    return;
  }
  new FileManagerWindow(host);
}

function openFileEditor(host, rawPath) {
  let win = WindowManager.get(`file-${host.id}`);
  if (!win) {
    win = new FileEditorWindow(host);
  } else {
    win.restore();
  }
  win.load(rawPath);
  win.raise();
}