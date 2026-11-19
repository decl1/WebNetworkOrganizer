"use strict";

class LogWindow extends BaseWindow {
  constructor(host) {
    super({
      id: `logs-${host.id}`,
      title: `${t("logs")} · ${host.name}`,
      icon: ICONS.logs,
      width: 460,
      height: 360,
    });
    this.hostId = host.id;
    this.hostName = host.name;
    this.pollTimer = null;
  }

  createContent() {
    this.body.innerHTML = `
      <div class="log-toolbar">
        <button type="button" class="btn icon" data-log-action="refresh" data-i18n-title="refresh" title="${t("refresh")}">${ICONS.refresh}</button>
        <button type="button" class="btn icon" data-log-action="clear" data-i18n-title="clearLogs" title="${t("clearLogs")}">${ICONS.trash}</button>
      </div>
      <div class="log-list"></div>`;
    this.list = this.body.querySelector(".log-list");
    this.body.querySelector("[data-log-action='refresh']").addEventListener("click", () => this.reload());
    this.body.querySelector("[data-log-action='clear']").addEventListener("click", () => this.clear());
  }

  onOpen() {
    this.pollTimer = setInterval(() => this.reload(), 2000);
  }

  onClose() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  restore() {
    super.restore();
    this.reload();
  }

  async reload() {
    if (this.minimized) {
      return;
    }
    try {
      const logs = await api(`/api/hosts/${this.hostId}/logs?limit=200`);
      this._render(logs);
    } catch (error) {
      if (String(error).includes("404")) {
        this.close();
      } else {
        this.list.innerHTML = `<div class="log-empty">${t("logsLoadError")} ${escapeHtml(String(error))}</div>`;
      }
    }
  }

  _render(logs) {
    if (logs.length === 0) {
      this.list.innerHTML = `<div class="log-empty">${t("logsEmpty")}</div>`;
      return;
    }
    const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 24;
    this.list.innerHTML = logs
      .map(
        (entry) => `
        <div class="log-entry log-${escapeHtml(entry.level)}">
          <span class="log-time">${escapeHtml(formatLogTime(entry.ts))}</span>
          <span class="log-level">${escapeHtml(entry.level)}</span>
          <span class="log-message">${escapeHtml(entry.message)}</span>
        </div>`,
      )
      .join("");
    if (atBottom) {
      this.list.scrollTop = this.list.scrollHeight;
    }
  }

  async clear() {
    if (!confirm(t("clearLogsConfirm").replace("{name}", this.hostName))) {
      return;
    }
    try {
      await api(`/api/hosts/${this.hostId}/logs`, { method: "DELETE" });
      await this.reload();
    } catch (error) {
      this.list.innerHTML = `<div class="log-empty">${t("logsLoadError")} ${escapeHtml(String(error))}</div>`;
    }
  }
}

function formatLogTime(ts) {
  const date = new Date(ts.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) {
    return ts;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour12: false })}`;
}

function openHostLogs(host) {
  const existing = WindowManager.get(`logs-${host.id}`);
  if (existing) {
    existing.restore();
    return;
  }
  new LogWindow(host);
}