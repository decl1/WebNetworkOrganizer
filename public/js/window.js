"use strict";

const WindowManager = (() => {
  let layer = null;
  let taskbar = null;
  let zCounter = 50;
  const windows = {};
  let order = [];
  let activeId = null;
  let cascade = 0;

  function init() {
    layer = document.createElement("div");
    layer.id = "windows-layer";
    document.body.appendChild(layer);
    taskbar = document.getElementById("taskbar");
    const topbar = document.querySelector(".topbar");
    const layout = () => {
      layer.style.top = `${topbar.offsetHeight}px`;
      layer.style.bottom = `${taskbar.offsetHeight}px`;
      layer.style.left = "0";
      layer.style.right = "0";
    };
    layout();
    window.addEventListener("resize", layout);
  }

  function bounds() {
    return { width: layer.clientWidth, height: layer.clientHeight };
  }

  function add(win) {
    windows[win.id] = win;
    order.push(win.id);
    if (cascade > 96) {
      cascade = 0;
    }
    win.position(cascade, cascade);
    cascade += 28;
    layer.appendChild(win.el);
    renderTaskbar();
    setActive(win.id);
  }

  function remove(id) {
    const win = windows[id];
    if (!win) {
      return;
    }
    delete windows[id];
    order = order.filter((item) => item !== id);
    if (activeId === id) {
      activeId = null;
      const top = [...order].reverse().find((item) => !windows[item].minimized);
      if (top !== undefined) {
        setActive(top);
      }
    }
    renderTaskbar();
  }

  function get(id) {
    return windows[id] || null;
  }

  function raise(id) {
    const win = windows[id];
    if (!win || win.minimized) {
      return;
    }
    zCounter += 1;
    win.el.style.zIndex = String(zCounter);
    order = order.filter((item) => item !== id);
    order.push(id);
    setActive(id);
  }

  function setActive(id) {
    activeId = id;
    for (const item of Object.values(windows)) {
      item.el.classList.toggle("active", item.id === id && !item.minimized);
    }
    renderTaskbar();
  }

  function renderTaskbar() {
    if (!taskbar) {
      return;
    }
    taskbar.innerHTML = order
      .map((id) => {
        const win = windows[id];
        const cls = ["taskbar-item"];
        if (win.minimized) {
          cls.push("minimized");
        }
        if (id === activeId && !win.minimized) {
          cls.push("active");
        }
        return `<button class="${cls.join(" ")}" data-win-id="${id}" title="${escapeHtml(win.title)}">
          <span class="taskbar-icon">${win.icon || ""}</span>
          <span class="taskbar-label">${escapeHtml(win.title)}</span>
        </button>`;
      })
      .join("");
  }

  function onTaskbarClick(event) {
    const button = event.target.closest("[data-win-id]");
    if (!button) {
      return;
    }
    const win = windows[button.dataset.winId];
    if (!win) {
      return;
    }
    if (win.minimized) {
      win.restore();
    } else if (activeId === win.id) {
      win.minimize();
    } else {
      win.raise();
    }
  }

  return {
    init,
    add,
    remove,
    get,
    raise,
    setActive,
    renderTaskbar,
    bounds,
    onTaskbarClick,
  };
})();

class BaseWindow {
  constructor({ id, title, icon = "", width = 440, height = 340 }) {
    this.id = id;
    this.title = title;
    this.icon = icon;
    this.width = width;
    this.height = height;
    this.minimized = false;
    this.maximized = false;
    this.x = 40;
    this.y = 40;
    this._savedRect = null;

    const el = document.createElement("div");
    el.className = "win";
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.innerHTML = `
      <div class="win-titlebar" data-win-drag>
        <span class="win-icon">${icon || ""}</span>
        <span class="win-title">${escapeHtml(title)}</span>
        <div class="win-controls">
          <button class="win-btn" data-win-action="minimize" title="${t("minimize")}">${ICONS.minimize}</button>
          <button class="win-btn win-btn-maximize" data-win-action="maximize" title="${t("maximize")}">${ICONS.maximize}</button>
          <button class="win-btn win-btn-close" data-win-action="close" title="${t("close")}">${ICONS.x}</button>
        </div>
      </div>
      <div class="win-body"></div>
      <div class="win-resize" data-win-resize></div>`;
    this.el = el;
    this.body = el.querySelector(".win-body");

    el.addEventListener("pointerdown", () => WindowManager.raise(this.id));
    el.querySelector("[data-win-drag]").addEventListener("pointerdown", (event) => this._startDrag(event));
    el.querySelector("[data-win-resize]").addEventListener("pointerdown", (event) => this._startResize(event));
    el.addEventListener("click", (event) => this._onControlsClick(event));

    WindowManager.add(this);
    this.createContent();
    if (typeof this.onOpen === "function") {
      this.onOpen();
    }
  }

  position(x, y) {
    const b = WindowManager.bounds();
    this.x = Math.max(-(this.width - 80), Math.min(x, Math.max(0, b.width - 80)));
    this.y = Math.max(0, Math.min(y, b.height - 32));
    this.el.style.left = `${this.x}px`;
    this.el.style.top = `${this.y}px`;
  }

  raise() {
    WindowManager.raise(this.id);
  }

  minimize() {
    if (this.minimized) {
      return;
    }
    this.minimized = true;
    this.el.classList.add("minimized");
    WindowManager.setActive(null);
  }

  restore() {
    if (!this.minimized) {
      return;
    }
    this.minimized = false;
    this.el.classList.remove("minimized");
    this.raise();
  }

  toggleMaximize() {
    if (this.maximized) {
      this._unmaximize();
    } else {
      this._maximize();
    }
  }

  _maximize() {
    if (this.maximized) {
      return;
    }
    this._savedRect = { x: this.x, y: this.y, width: this.width, height: this.height };
    this.maximized = true;
    this.el.classList.add("maximized");
    const maximizeBtn = this.el.querySelector("[data-win-action='maximize']");
    maximizeBtn.innerHTML = ICONS.restore;
    maximizeBtn.title = t("restore");
  }

  _unmaximize() {
    if (!this.maximized) {
      return;
    }
    this.maximized = false;
    this.el.classList.remove("maximized");
    const rect = this._savedRect || { x: 40, y: 40, width: 440, height: 340 };
    this._savedRect = null;
    this.width = rect.width;
    this.height = rect.height;
    this.el.style.width = `${rect.width}px`;
    this.el.style.height = `${rect.height}px`;
    this.position(rect.x, rect.y);
    const maximizeBtn = this.el.querySelector("[data-win-action='maximize']");
    maximizeBtn.innerHTML = ICONS.maximize;
    maximizeBtn.title = t("maximize");
  }

  close() {
    if (typeof this.onClose === "function") {
      this.onClose();
    }
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    WindowManager.remove(this.id);
  }

  createContent() {
    // Override in subclasses to fill this.body.
  }

  _onControlsClick(event) {
    const button = event.target.closest("[data-win-action]");
    if (!button) {
      return;
    }
    switch (button.dataset.winAction) {
      case "minimize":
        this.minimize();
        break;
      case "maximize":
        this.toggleMaximize();
        break;
      case "close":
        this.close();
        break;
      default:
        break;
    }
  }

  _startDrag(event) {
    if (event.target.closest("[data-win-action]")) {
      return;
    }
    if (this.maximized) {
      return;
    }
    this.raise();
    const startX = event.clientX;
    const startY = event.clientY;
    const origX = this.x;
    const origY = this.y;
    const win = this;
    event.preventDefault();

    const onMove = (moveEvent) => {
      win.position(origX + (moveEvent.clientX - startX), origY + (moveEvent.clientY - startY));
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.classList.remove("win-dragging");
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.body.classList.add("win-dragging");
  }

  _startResize(event) {
    if (this.maximized) {
      return;
    }
    this.raise();
    const startX = event.clientX;
    const startY = event.clientY;
    const origWidth = this.width;
    const origHeight = this.height;
    const win = this;
    event.preventDefault();

    const onMove = (moveEvent) => {
      const b = WindowManager.bounds();
      win.width = Math.max(240, Math.min(origWidth + (moveEvent.clientX - startX), b.width));
      win.height = Math.max(160, Math.min(origHeight + (moveEvent.clientY - startY), b.height - 40));
      win.el.style.width = `${win.width}px`;
      win.el.style.height = `${win.height}px`;
      win.el.style.left = `${Math.min(win.x, b.width - 40)}px`;
      win.el.style.top = `${Math.min(win.y, b.height - 40)}px`;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.classList.remove("win-resizing");
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.body.classList.add("win-resizing");
  }
}

function initWindows() {
  WindowManager.init();
  document.getElementById("taskbar").addEventListener("click", WindowManager.onTaskbarClick);
}