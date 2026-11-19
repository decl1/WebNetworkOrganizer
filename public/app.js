"use strict";

const state = {
  settings: {},
  containers: [],
  editingContainerId: null,
  hostModalContainerId: null,
  hostSettingsId: null,
  hostSettingsWebServices: [],
  hostSettingsWebServicesRemoved: [],
  hostPanels: {},
  hostTimers: {},
};

function findContainer(containerId) {
  return state.containers.find((container) => container.id === containerId);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("#theme-select").value = theme;
}

function applyLanguage(lang) {
  document.documentElement.lang = lang;
  $("#language-select").value = lang;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.title = t(element.dataset.i18nTitle);
  });
  const settingsBtn = $("#settings-btn");
  settingsBtn.title = t("settings");
  settingsBtn.setAttribute("aria-label", t("settings"));
  refreshContainerModalLabels();
  renderContainers();
}

function refreshContainerModalLabels() {
  const editing = state.editingContainerId !== null;
  $("#container-modal-title").textContent = t(editing ? "renameContainer" : "addContainer");
  $("#container-modal-submit").textContent = t(editing ? "save" : "create");
}

async function loadSettings() {
  const settings = await api("/api/settings");
  state.settings = settings;
  applyTheme(settings.theme);
  applyLanguage(settings.language);
}

function setStatus(text, kind = "") {
  const status = $("#settings-status");
  status.textContent = text;
  status.className = "settings-status" + (kind ? " " + kind : "");
}

async function saveSettings(patch) {
  setStatus(t("saving"));
  try {
    state.settings = await api("/api/settings", { method: "PATCH", body: JSON.stringify(patch) });
    setStatus(t("saved"), "ok");
  } catch (error) {
    setStatus(`${t("saveError")} ${error}`, "error");
  }
}

function applyPatch(patch) {
  Object.assign(state.settings, patch);
  if (patch.language !== undefined) {
    applyLanguage(patch.language);
  }
  if (patch.theme !== undefined) {
    applyTheme(patch.theme);
  }
}

function openSettings() {
  $("#settings-overlay").classList.remove("hidden");
}

function closeSettings() {
  $("#settings-overlay").classList.add("hidden");
}

async function loadContainers() {
  state.containers = await api("/api/containers");
  renderContainers();
  syncHostTimers();
}

function syncHostTimers() {
  const timers = state.hostTimers;
  const liveIds = new Set();
  for (const container of state.containers) {
    for (const host of container.hosts) {
      liveIds.add(host.id);
      const seconds = Number(host.auto_refresh) || 0;
      const intervalMs = seconds > 0 ? seconds * 1000 : 0;
      const entry = timers[host.id] || (timers[host.id] = { interval: null, intervalMs: 0, inFlight: false });
      if (intervalMs === 0) {
        if (entry.interval !== null) {
          clearInterval(entry.interval);
          entry.interval = null;
          entry.intervalMs = 0;
        }
      } else if (entry.interval === null || entry.intervalMs !== intervalMs) {
        if (entry.interval !== null) {
          clearInterval(entry.interval);
        }
        entry.intervalMs = intervalMs;
        entry.interval = setInterval(() => {
          refreshHost(host.id, true).catch(() => {});
        }, intervalMs);
      }
    }
  }
  for (const hostId of Object.keys(timers)) {
    if (!liveIds.has(Number(hostId))) {
      if (timers[hostId].interval !== null) {
        clearInterval(timers[hostId].interval);
      }
      delete timers[hostId];
    }
  }
}

function renderContainers() {
  const containerEl = $("#containers");
  if (state.containers.length === 0) {
    containerEl.innerHTML = `<div class="empty"><p>${t("emptyContainers")}</p></div>`;
    return;
  }
  containerEl.innerHTML = state.containers
    .map(
      (container) => `
      <div class="container-card" data-container-id="${container.id}">
        <div class="container-header">
          <h2 class="container-title">${escapeHtml(container.name)}</h2>
          <div class="container-actions">
            <button class="btn icon" data-action="rename-container" data-i18n-title="rename" title="${t("rename")}">${ICONS.pencil}</button>
            <button class="btn icon danger-box" data-action="delete-container" data-i18n-title="delete" title="${t("delete")}">${ICONS.trash}</button>
          </div>
        </div>
        <div class="hosts">
          ${container.hosts.length === 0 ? `<div class="hosts-empty">${t("emptyHosts")}</div>` : ""}
          ${container.hosts.map(hostCardHtml).join("")}
          <div class="add-card">
            <button class="btn plus" data-action="add-host" data-i18n-title="addHost" title="${t("addHost")}">${ICONS.plus}</button>
          </div>
        </div>
      </div>`,
    )
    .join("");
  for (const container of state.containers) {
    for (const host of container.hosts) {
      if (state.hostPanels[host.id] === "docker") {
        loadDockerPanel(host.id);
      }
    }
  }
}

function openContainerModal(container = null) {
  state.editingContainerId = container ? container.id : null;
  const error = $("#container-error");
  error.style.display = "none";
  $("#container-name").value = container ? container.name : "";
  refreshContainerModalLabels();
  $("#container-overlay").classList.remove("hidden");
  $("#container-name").focus();
}

function closeContainerModal() {
  $("#container-overlay").classList.add("hidden");
  state.editingContainerId = null;
}

async function saveContainer(name) {
  const editing = state.editingContainerId !== null;
  const url = editing ? `/api/containers/${state.editingContainerId}` : "/api/containers";
  return api(url, {
    method: editing ? "PATCH" : "POST",
    body: JSON.stringify({ name }),
  });
}

async function deleteContainer(container) {
  if (!confirm(t("deleteContainerConfirm").replace("{name}", container.name))) {
    return;
  }
  try {
    await api(`/api/containers/${container.id}`, { method: "DELETE" });
    state.hostPanels = {};
    await loadContainers();
  } catch (error) {
    alert(`${t("containerDeleteError")} ${error}`);
  }
}

function handleContainerClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const containerCard = button.closest(".container-card");
  const container = containerCard ? findContainer(Number(containerCard.dataset.containerId)) : null;
  const hostCard = button.closest(".host-card");
  const host =
    hostCard && container
      ? container.hosts.find((item) => item.id === Number(hostCard.dataset.hostId))
      : null;
  const panel = button.dataset.panel;

  switch (button.dataset.action) {
    case "rename-container":
      if (container) {
        openContainerModal(container);
      }
      break;
    case "delete-container":
      if (container) {
        deleteContainer(container);
      }
      break;
    case "add-host":
      if (container) {
        openHostModal(container.id);
      }
      break;
    case "refresh-host":
      if (host) {
        const svg = button.querySelector("svg");
        svg.classList.remove("spin");
        void svg.offsetWidth;
        svg.classList.add("spin");
        svg.addEventListener("animationend", () => svg.classList.remove("spin"), { once: true });
        refreshHost(host.id).catch((error) => alert(`${t("refreshError")} ${error}`));
      }
      break;
    case "host-settings":
      if (host) {
        openHostSettings(host);
      }
      break;
    case "host-logs":
      if (host) {
        openHostLogs(host);
      }
      break;
    case "host-terminal":
      if (host) {
        openHostConsole(host);
      }
      break;
    case "toggle-panel":
      if (host) {
        toggleHostPanel(host.id, panel);
      }
      break;
    case "close-panel":
      if (host) {
        closeHostPanel(host.id, panel);
      }
      break;
    default:
      break;
  }
}

function init() {
  initWindows();
  initHosts();

  $("#add-container-btn").addEventListener("click", () => openContainerModal());
  $("#container-close").addEventListener("click", closeContainerModal);
  $("#containers").addEventListener("click", handleContainerClick);
  $("#container-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = $("#container-error");
    const name = $("#container-name").value.trim();
    if (!name) {
      error.textContent = t("containerNameRequired");
      error.style.display = "block";
      return;
    }
    error.style.display = "none";
    const wasEditing = state.editingContainerId !== null;
    try {
      await saveContainer(name);
      closeContainerModal();
      await loadContainers();
    } catch (saveError) {
      error.textContent = `${t(wasEditing ? "containerRenameError" : "containerCreateError")} ${saveError}`;
      error.style.display = "block";
    }
  });

  $("#settings-btn").addEventListener("click", openSettings);
  $("#settings-close").addEventListener("click", closeSettings);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (!$("#host-overlay").classList.contains("hidden")) {
      closeHostModal();
    } else if (!$("#host-settings-overlay").classList.contains("hidden")) {
      closeHostSettings();
    } else if (!$("#container-overlay").classList.contains("hidden")) {
      closeContainerModal();
    } else if (!$("#settings-overlay").classList.contains("hidden")) {
      closeSettings();
    }
  });

  $("#theme-select").addEventListener("change", (event) => {
    const patch = { theme: event.target.value };
    applyPatch(patch);
    saveSettings(patch);
  });

  $("#language-select").addEventListener("change", (event) => {
    const patch = { language: event.target.value };
    applyPatch(patch);
    saveSettings(patch);
  });

  loadSettings().catch((error) => setStatus(`${t("loadError")} ${error}`, "error"));
  loadContainers().catch((error) => {
    document.getElementById("containers").innerHTML =
      `<div class="empty"><p>${t("containersLoadError")} ${escapeHtml(String(error))}</p></div>`;
  });
}

document.addEventListener("DOMContentLoaded", init);