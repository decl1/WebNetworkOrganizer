"use strict";

class ConsoleWindow extends BaseWindow {
  constructor(host) {
    super({
      id: `console-${host.id}`,
      title: `${t("ssh")} · ${host.name}`,
      icon: ICONS.terminal,
      width: 640,
      height: 440,
    });
    this.hostId = host.id;
    this.ws = null;
    this._resizeTimer = null;

    this._fit = new FitAddon.FitAddon();
    this.term = new Terminal({
      cursorBlink: true,
      scrollback: 5000,
      fontFamily: "Menlo, Consolas, 'DejaVu Sans Mono', monospace",
      fontSize: 13,
      theme: {
        background: "#101418",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
      },
    });
    this.term.loadAddon(this._fit);
    this.term.open(this.termEl);
    this.term.onData((data) => this._send(data));
    this.term.onResize(({ cols, rows }) => this._sendResize(cols, rows));

    window.addEventListener("resize", this._onResizeBound);
    this.connect();
  }

  createContent() {
    this.body.innerHTML = `<div class="console-term"></div>`;
    this.termEl = this.body.querySelector(".console-term");
    this.body.addEventListener("pointerdown", () => this.term.focus());
  }

  onClose() {
    window.removeEventListener("resize", this._onResizeBound);
    if (this._resizeTimer !== null) {
      clearTimeout(this._resizeTimer);
    }
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.term.dispose();
  }

  connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws/hosts/${this.hostId}/ssh`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) {
        return;
      }
      this._fit.fit();
      const { cols, rows } = this._fit.proposeDimensions();
      this._sendResize(cols, rows);
      this.term.focus();
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws) {
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        this.term.write(new Uint8Array(event.data));
        return;
      }
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      if (message.type === "error") {
        this.term.writeln(`\u001b[31m${message.message}\u001b[0m`);
      } else if (message.type === "closed") {
        this.term.writeln(`\u001b[33m${t("consoleDisconnected")}\u001b[0m`);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) {
        return;
      }
      this.ws = null;
      this.term.writeln(`\u001b[33m${t("consoleDisconnected")}\u001b[0m`);
    };
  }

  _send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "input", data }));
    }
  }

  _sendResize(cols, rows) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.maximized) {
      return;
    }
    this.ws.send(JSON.stringify({ type: "resize", cols, rows }));
  }

  _onResizeBound = () => {
    if (this._resizeTimer !== null) {
      clearTimeout(this._resizeTimer);
    }
    this._resizeTimer = setTimeout(() => {
      const dims = this._fit.proposeDimensions();
      this._fit.fit();
      this._sendResize(dims.cols, dims.rows);
    }, 150);
  };
}

function openHostConsole(host) {
  const existing = WindowManager.get(`console-${host.id}`);
  if (existing) {
    existing.restore();
    return;
  }
  new ConsoleWindow(host);
}