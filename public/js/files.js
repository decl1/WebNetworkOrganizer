"use strict";

const FS_DRAG_MIME = "application/x-wno-fs";

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

class FileManagerWindow extends BaseWindow {
  constructor(host) {
    super({
      id: `files-${host.id}`,
      title: `${t("files")} · ${host.name}`,
      icon: ICONS.folder,
      width: 780,
      height: 500,
    });
    this.host = host;
    this.cwd = "~";
    this._entries = [];
    this._selected = new Set();
    this._lastIndex = -1;
    this._dropRow = null;
  }

  createContent() {
    this.body.innerHTML = `
      <div class="fs-toolbar">
        <button type="button" class="btn icon" data-fs-action="up" data-i18n-title="fsUp" title="${t("fsUp")}">${ICONS.arrowUp}</button>
        <button type="button" class="btn icon" data-fs-action="refresh" data-i18n-title="refresh" title="${t("refresh")}">${ICONS.refresh}</button>
        <button type="button" class="btn icon" data-fs-action="console" data-i18n-title="fsOpenInConsole" title="${t("fsOpenInConsole")}">${ICONS.terminal}</button>
        <div class="fs-path" data-fs-role="path"></div>
      </div>
      <div class="fs-list" data-fs-role="list"></div>
      <div class="fs-status" data-fs-role="status"></div>
      <div class="fs-menu" data-fs-role="menu" hidden></div>
      <div class="fs-modal-backdrop" data-fs-role="mbackdrop" hidden>
        <div class="fs-modal">
          <div class="fs-modal-title" data-fs-role="mtitle"></div>
          <input class="fs-modal-input" data-fs-role="minput" type="text" spellcheck="false">
          <div class="fs-modal-error" data-fs-role="merror" hidden></div>
          <div class="fs-modal-actions">
            <button type="button" class="btn" data-fs-role="mcancel"></button>
            <button type="button" class="btn primary" data-fs-role="mok"></button>
          </div>
        </div>
      </div>`;
    this.pathEl = this.body.querySelector("[data-fs-role='path']");
    this.listEl = this.body.querySelector("[data-fs-role='list']");
    this.statusEl = this.body.querySelector("[data-fs-role='status']");
    this.menuEl = this.body.querySelector("[data-fs-role='menu']");
    this.modalBackdrop = this.body.querySelector("[data-fs-role='mbackdrop']");
    this.modalTitle = this.body.querySelector("[data-fs-role='mtitle']");
    this.modalInput = this.body.querySelector("[data-fs-role='minput']");
    this.modalError = this.body.querySelector("[data-fs-role='merror']");
    this.modalCancel = this.body.querySelector("[data-fs-role='mcancel']");
    this.modalOk = this.body.querySelector("[data-fs-role='mok']");
    this._onMenuPointer = null;
    this._onMenuKey = null;

    this.body.querySelector("[data-fs-action='up']").addEventListener("click", () => this._goUp());
    this.body.querySelector("[data-fs-action='refresh']").addEventListener("click", () => this.reload());
    this.body
      .querySelector("[data-fs-action='console']")
      .addEventListener("click", () => openHostConsole(this.host, this.cwd));

    this.pathEl.addEventListener("click", (event) => {
      const crumb = event.target.closest("[data-fs-nav]");
      if (crumb) {
        this.cwd = crumb.dataset.fsNav;
        this.reload();
      }
    });

    this._wireList();
    this._wireDragDrop();
    this._wireModal();
  }

  onOpen() {
    // BaseWindow calls onOpen() from its constructor, before this.host is set;
    // the first load is started by openHostFiles() right after construction.
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
    this._setStatus("");
    this._selected = new Set();
    this._lastIndex = -1;
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
    this._entries = entries;
    this.pathEl.innerHTML = this._breadcrumbs();
    if (entries.length === 0) {
      this.listEl.innerHTML = `<p class="fs-empty">${t("fsEmpty")}</p>`;
      return;
    }
    this.listEl.innerHTML = entries.map((entry, index) => this._rowHtml(entry, index)).join("");
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

  _rowHtml(entry, index) {
    const isDir = entry.type === "dir";
    const icon = isDir ? ICONS.folder : ICONS.file;
    const size = isDir ? "" : formatFileSize(entry.size);
    const time = formatFsTime(entry.mtime);
    return `<div class="fs-row${isDir ? " fs-row-dir" : ""}" draggable="true" data-fs-path="${escapeHtml(entry.path)}" data-fs-type="${entry.type}" data-fs-index="${index}" title="${escapeHtml(entry.path)}">
      <span class="fs-cell fs-name"><span class="fs-icon">${icon}</span>${escapeHtml(entry.name)}</span>
      <span class="fs-cell fs-size">${size}</span>
      <span class="fs-cell fs-time">${time}</span>
    </div>`;
  }

  _goUp() {
    this.cwd = fsParentPath(this.cwd);
    this.reload();
  }

  // ---- selection ----

  _setSelection(paths) {
    this._selected = paths;
    this.listEl.querySelectorAll(".fs-row[data-fs-index]").forEach((row) => {
      row.classList.toggle("fs-selected", paths.has(row.dataset.fsPath));
    });
    if (this._selected.size > 0) {
      this._setStatus(t("fsSelected").replace("{count}", String(this._selected.size)));
    }
  }

  _toggleSelection(index) {
    const entry = this._entries[index];
    if (!entry) {
      return;
    }
    const next = new Set(this._selected);
    if (next.has(entry.path)) {
      next.delete(entry.path);
    } else {
      next.add(entry.path);
    }
    this._lastIndex = index;
    this._setSelection(next);
  }

  _selectRange(from, to) {
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const next = new Set();
    for (let i = start; i <= end; i += 1) {
      const entry = this._entries[i];
      if (entry) {
        next.add(entry.path);
      }
    }
    this._lastIndex = to;
    this._setSelection(next);
  }

  _selectedPaths() {
    return Array.from(this._selected);
  }

  // ---- context menu ----

  _selectionMenuItems() {
    const paths = this._selectedPaths();
    const single = paths.length === 1;
    const entry = single ? this._entries.find((item) => item.path === paths[0]) : null;
    return [
      {
        label: t("fsOpen"),
        enabled: single && entry !== null,
        run: () => {
          if (entry.type === "dir") {
            this.cwd = entry.path;
            this.reload();
          } else {
            openFileEditor(this.host, entry.path);
          }
        },
      },
      {
        label: t("rename"),
        enabled: single && entry !== null,
        run: () => this._renameEntry(entry),
      },
      { type: "sep" },
      {
        label: t("delete"),
        enabled: paths.length > 0,
        run: () => this._deleteSelection(paths),
      },
      {
        label: t("fsDownload"),
        enabled: paths.length > 0,
        run: () => this._downloadSelection(paths),
      },
    ];
  }

  _emptyMenuItems() {
    return [
      { label: t("fsUploadFiles"), run: () => this._pickUpload() },
      { label: t("fsNewFolder"), run: () => this._newFolder() },
    ];
  }

  _showMenu(clientX, clientY, items) {
    this._hideMenu();
    this.menuEl.innerHTML = items
      .map((item) => {
        if (item.type === "sep") {
          return `<div class="fs-menu-sep"></div>`;
        }
        const disabled = item.enabled === false ? " disabled" : "";
        return `<button type="button" class="fs-menu-item${disabled}">${escapeHtml(item.label)}</button>`;
      })
      .join("");
    this.menuEl.hidden = false;
    const rect = this.body.getBoundingClientRect();
    let x = clientX - rect.left;
    let y = clientY - rect.top;
    const width = this.menuEl.offsetWidth;
    const height = this.menuEl.offsetHeight;
    if (x + width > this.body.clientWidth) {
      x = Math.max(0, this.body.clientWidth - width);
    }
    if (y + height > this.body.clientHeight) {
      y = Math.max(0, this.body.clientHeight - height);
    }
    this.menuEl.style.left = `${x}px`;
    this.menuEl.style.top = `${y}px`;
    const runs = items.filter((item) => item.type !== "sep");
    this.menuEl.querySelectorAll(".fs-menu-item").forEach((button, index) => {
      button.addEventListener("click", () => {
        this._hideMenu();
        if (button.classList.contains("disabled")) {
          return;
        }
        runs[index].run();
      });
    });
    this._onMenuPointer = (event) => {
      if (!this.menuEl.contains(event.target)) {
        this._hideMenu();
      }
    };
    this._onMenuKey = (event) => {
      if (event.key === "Escape") {
        this._hideMenu();
      }
    };
    setTimeout(() => {
      document.addEventListener("pointerdown", this._onMenuPointer);
      document.addEventListener("keydown", this._onMenuKey);
    }, 0);
  }

  _hideMenu() {
    if (this.menuEl) {
      this.menuEl.hidden = true;
      this.menuEl.innerHTML = "";
    }
    if (this._onMenuPointer) {
      document.removeEventListener("pointerdown", this._onMenuPointer);
      this._onMenuPointer = null;
    }
    if (this._onMenuKey) {
      document.removeEventListener("keydown", this._onMenuKey);
      this._onMenuKey = null;
    }
  }

  // ---- actions: rename / delete / new folder ----

  async _renameEntry(entry) {
    this._prompt(
      t("fsRename"),
      entry.name,
      t("save"),
      async (value) => {
        if (value === entry.name) {
          return;
        }
        try {
          const result = await api(`/api/hosts/${this.host.id}/fs/rename`, {
            method: "POST",
            body: JSON.stringify({ path: entry.path, new_name: value }),
          });
          if (result.error) {
            throw new Error(result.error);
          }
          await this.reload();
          this._setSelection(new Set([result.path]));
        } catch (error) {
          this._setStatus(`${t("fsRenameError")} ${String(error)}`, "error");
        }
      },
      (value) => value.length > 0 && !value.includes("/"),
    );
  }

  async _deleteSelection(paths) {
    if (!confirm(t("fsDeleteConfirm").replace("{count}", String(paths.length)))) {
      return;
    }
    try {
      const result = await api(`/api/hosts/${this.host.id}/fs/delete`, {
        method: "POST",
        body: JSON.stringify({ paths }),
      });
      if (result.error) {
        throw new Error(result.error);
      }
      await this.reload();
    } catch (error) {
      this._setStatus(`${t("fsDeleteError")} ${String(error)}`, "error");
    }
  }

  async _newFolder() {
    this._prompt(
      t("fsNewFolder"),
      "",
      t("create"),
      async (value) => {
        try {
          const result = await api(`/api/hosts/${this.host.id}/fs/mkdir`, {
            method: "POST",
            body: JSON.stringify({ path: this.cwd, name: value }),
          });
          if (result.error) {
            throw new Error(result.error);
          }
          await this.reload();
          this._setSelection(new Set([result.path]));
        } catch (error) {
          this._setStatus(`${t("fsNewFolderError")} ${String(error)}`, "error");
        }
      },
      (value) => value.length > 0 && !value.includes("/"),
    );
  }

  // ---- download ----

  _downloadSelection(paths) {
    if (paths.length === 1) {
      const entry = this._entries.find((item) => item.path === paths[0]);
      if (entry && entry.type !== "dir") {
        this._downloadPath(entry.path, entry.name);
        return;
      }
    }
    this._downloadArchive(paths);
  }

  _saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async _downloadPath(rawPath, name) {
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
      this._saveBlob(blob, name);
      this._setStatus("");
    } catch (error) {
      this._setStatus(`${t("fsDownloadError")} ${String(error)}`, "error");
    }
  }

  async _downloadArchive(paths) {
    this._setStatus(t("fsArchiving"));
    try {
      const query = paths.map((path) => `paths=${encodeURIComponent(path)}`).join("&");
      const response = await fetch(`/api/hosts/${this.host.id}/fs/zip?${query}`);
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok && contentType.includes("json")) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      let name = "wno-archive.tar.gz";
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match) {
        name = match[1];
      }
      const blob = await response.blob();
      this._saveBlob(blob, name);
      this._setStatus("");
    } catch (error) {
      this._setStatus(`${t("fsArchiveError")} ${String(error)}`, "error");
    }
  }

  // ---- upload ----

  _pickUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      if (files.length > 0) {
        this._uploadTo(files, this.cwd);
      }
    });
    input.click();
  }

  async _uploadTo(files, targetDir) {
    let uploaded = 0;
    let failed = 0;
    for (const file of files) {
      const ok = await this._uploadOne(file, targetDir);
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

  _uploadOne(file, targetDir) {
    return new Promise((resolve) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `/api/hosts/${this.host.id}/fs/upload?path=${encodeURIComponent(targetDir)}`,
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

  // ---- drag & drop ----

  _wireList() {
    this.listEl.addEventListener("click", (event) => {
      const row = event.target.closest(".fs-row[data-fs-index]");
      if (!row) {
        this._setSelection(new Set());
        return;
      }
      const index = Number(row.dataset.fsIndex);
      if (event.ctrlKey || event.metaKey) {
        this._toggleSelection(index);
      } else if (event.shiftKey && this._lastIndex >= 0) {
        this._selectRange(this._lastIndex, index);
      } else {
        this._setSelection(new Set([row.dataset.fsPath]));
        this._lastIndex = index;
      }
    });

    this.listEl.addEventListener("dblclick", (event) => {
      const row = event.target.closest(".fs-row[data-fs-index]");
      if (!row) {
        return;
      }
      const entry = this._entries[Number(row.dataset.fsIndex)];
      if (!entry) {
        return;
      }
      if (entry.type === "dir") {
        this.cwd = entry.path;
        this.reload();
      } else {
        openFileEditor(this.host, entry.path);
      }
    });

    this.listEl.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const row = event.target.closest(".fs-row[data-fs-index]");
      if (row) {
        const path = row.dataset.fsPath;
        if (!this._selected.has(path)) {
          this._setSelection(new Set([path]));
          this._lastIndex = Number(row.dataset.fsIndex);
        }
        this._showMenu(event.clientX, event.clientY, this._selectionMenuItems());
      } else {
        this._setSelection(new Set());
        this._showMenu(event.clientX, event.clientY, this._emptyMenuItems());
      }
    });
  }

  _wireDragDrop() {
    this.listEl.addEventListener("dragstart", (event) => {
      const row = event.target.closest(".fs-row[data-fs-index]");
      if (!row) {
        return;
      }
      const path = row.dataset.fsPath;
      const paths = this._selected.has(path) ? this._selectedPaths() : [path];
      event.dataTransfer.setData(FS_DRAG_MIME, JSON.stringify({ hostId: this.host.id, paths }));
      event.dataTransfer.effectAllowed = "copyMove";
      try {
        event.dataTransfer.setDragImage(row, 24, 24);
      } catch (error) {
        // some browsers throw on unrendered elements — ignore
      }
    });

    this.listEl.addEventListener("dragend", () => this._setDropRow(null));

    this.listEl.addEventListener("dragover", (event) => {
      const payload = this._dragPayload(event);
      const row = event.target.closest(".fs-row[data-fs-index]");
      const isExternal =
        !payload && event.dataTransfer && Array.from(event.dataTransfer.types || []).includes("Files");
      if (!payload && !isExternal) {
        return;
      }
      if (row) {
        if (row.dataset.fsType !== "dir") {
          return;
        }
        if (payload && this._selected.has(row.dataset.fsPath)) {
          return;
        }
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = payload && payload.hostId !== this.host.id ? "copy" : "move";
      }
      this._setDropRow(row || null);
    });

    this.listEl.addEventListener("dragleave", (event) => {
      if (!this.listEl.contains(event.relatedTarget)) {
        this._setDropRow(null);
      }
    });

    this.listEl.addEventListener("drop", (event) => {
      event.preventDefault();
      this._setDropRow(null);
      const payload = this._dragPayload(event);
      if (payload) {
        this._handleFsDrop(event, payload);
        return;
      }
      const files = event.dataTransfer ? Array.from(event.dataTransfer.files || []) : [];
      if (files.length > 0) {
        const row = event.target.closest(".fs-row[data-fs-index]");
        const target = row && row.dataset.fsType === "dir" ? row.dataset.fsPath : this.cwd;
        this._uploadTo(files, target);
      }
    });
  }

  _dragPayload(event) {
    if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes(FS_DRAG_MIME)) {
      return null;
    }
    try {
      return JSON.parse(event.dataTransfer.getData(FS_DRAG_MIME));
    } catch (error) {
      return null;
    }
  }

  _setDropRow(row) {
    if (this._dropRow === row) {
      return;
    }
    if (this._dropRow) {
      this._dropRow.classList.remove("fs-drop-target");
    }
    this._dropRow = row;
    if (row) {
      row.classList.add("fs-drop-target");
    }
  }

  async _handleFsDrop(event, payload) {
    if (!payload || !Array.isArray(payload.paths) || payload.paths.length === 0) {
      return;
    }
    const row = event.target.closest(".fs-row[data-fs-index]");
    const targetDir = row && row.dataset.fsType === "dir" ? row.dataset.fsPath : this.cwd;
    if (payload.hostId === this.host.id && payload.paths.includes(targetDir)) {
      return;
    }
    const move = payload.hostId === this.host.id;
    this._setStatus(move ? t("fsMoving") : t("fsCopying"));
    try {
      const result = await api(`/api/hosts/${payload.hostId}/fs/copy`, {
        method: "POST",
        body: JSON.stringify({
          paths: payload.paths,
          target_host_id: this.host.id,
          target_dir: targetDir,
          move,
        }),
      });
      if (result.error) {
        throw new Error(result.error);
      }
      this._setStatus(
        move
          ? t("fsMoved").replace("{count}", String(payload.paths.length))
          : t("fsCopied").replace("{count}", String(payload.paths.length)),
        "ok",
      );
      await this.reload();
      if (move && payload.hostId !== this.host.id) {
        const source = WindowManager.get(`files-${payload.hostId}`);
        if (source) {
          source.reload();
        }
      }
    } catch (error) {
      this._setStatus(`${move ? t("fsMoveError") : t("fsCopyError")} ${String(error)}`, "error");
    }
  }

  // ---- modal prompt ----

  _wireModal() {
    const submit = () => this._modalSubmit();
    const cancel = () => {
      this.modalBackdrop.hidden = true;
      this._modalAction = null;
      this._modalValidate = null;
    };
    this.modalOk.addEventListener("click", submit);
    this.modalCancel.addEventListener("click", cancel);
    this.modalInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      } else if (event.key === "Escape") {
        cancel();
      }
    });
  }

  _prompt(title, initial, okLabel, action, validate) {
    this.modalTitle.textContent = title;
    this.modalInput.value = initial || "";
    this.modalOk.textContent = okLabel;
    this.modalCancel.textContent = t("cancel");
    this.modalError.hidden = true;
    this.modalBackdrop.hidden = false;
    this._modalAction = action;
    this._modalValidate = validate || null;
    this.modalInput.focus();
    this.modalInput.select();
  }

  _modalSubmit() {
    if (this.modalBackdrop.hidden || !this._modalAction) {
      return;
    }
    const value = this.modalInput.value.trim();
    if (this._modalValidate && !this._modalValidate(value)) {
      this.modalError.textContent = t("fsInvalidName");
      this.modalError.hidden = false;
      return;
    }
    const action = this._modalAction;
    this.modalBackdrop.hidden = true;
    this._modalAction = null;
    this._modalValidate = null;
    action(value);
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
  const win = new FileManagerWindow(host);
  win.reload();
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