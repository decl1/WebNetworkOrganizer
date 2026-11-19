"use strict";

function getOpenPanel(hostId) {
  return state.hostPanels[hostId] || null;
}

function hostSectionHtml(titleKey, emptyKey) {
  return `
    <div class="host-section">
      <h4 class="host-section-title">${t(titleKey)}</h4>
      <p class="host-section-empty">${t(emptyKey)}</p>
    </div>`;
}

function hostPanelHtml(hostId, panel) {
  const open = getOpenPanel(hostId) === panel ? " open" : "";
  const titleKey = panel === "docker" ? "docker" : "sysInfo";
  const bodyKey = panel === "docker" ? "noDockerData" : "noSysInfoData";
  return `
    <div class="host-panel${open}" data-panel-body="${panel}">
      <div class="host-panel-header">
        <span class="host-panel-icon">${ICONS[panel]}</span>
        <span class="host-panel-title">${t(titleKey)}</span>
        <button class="btn icon panel-close" data-action="close-panel" data-panel="${panel}" title="${t("close")}">${ICONS.x}</button>
      </div>
      <div class="host-panel-body">${t(bodyKey)}</div>
    </div>`;
}

function hostCardHtml(host) {
  return `
    <div class="host-card" data-host-id="${host.id}">
      <div class="host-main">
        <div class="host-header">
          <span class="os-icon" title="${t("linux")}">${ICONS.os.linux}</span>
          <div class="host-id">
            <h3 class="host-title">${escapeHtml(host.name)}</h3>
            <span class="host-address">${escapeHtml(host.address)}</span>
          </div>
          <div class="host-actions">
            <button class="btn icon" data-action="refresh-host" data-i18n-title="refresh" title="${t("refresh")}">${ICONS.refresh}</button>
          </div>
        </div>
        ${hostSectionHtml("webServices", "noWebServices")}
        ${hostSectionHtml("services", "noServices")}
        <div class="host-footer">
          <button class="btn icon" data-action="host-settings" data-i18n-title="hostSettings" title="${t("hostSettings")}">${ICONS.gear}</button>
          <button class="btn icon" data-action="host-terminal" data-i18n-title="terminalSoon" title="${t("terminalSoon")}" disabled>${ICONS.terminal}</button>
        </div>
      </div>
      <div class="host-tabs">
        <button class="host-tab${getOpenPanel(host.id) === "docker" ? " active" : ""}" data-action="toggle-panel" data-panel="docker" data-i18n-title="docker" title="${t("docker")}">${ICONS.docker}</button>
        <button class="host-tab${getOpenPanel(host.id) === "sysinfo" ? " active" : ""}" data-action="toggle-panel" data-panel="sysinfo" data-i18n-title="sysInfo" title="${t("sysInfo")}">${ICONS.sysinfo}</button>
      </div>
      ${hostPanelHtml(host.id, "docker")}
      ${hostPanelHtml(host.id, "sysinfo")}
    </div>`;
}

function openHostModal(containerId) {
  state.hostModalContainerId = containerId;
  const error = $("#host-error");
  error.style.display = "none";
  $("#host-name").value = "";
  $("#host-address").value = "";
  $("#host-overlay").classList.remove("hidden");
  $("#host-name").focus();
}

function closeHostModal() {
  $("#host-overlay").classList.add("hidden");
  state.hostModalContainerId = null;
}

function findHostById(hostId) {
  for (const container of state.containers) {
    const host = container.hosts.find((item) => item.id === hostId);
    if (host) {
      return host;
    }
  }
  return null;
}

function clearHostSettingsErrors() {
  const error = $("#host-settings-error");
  error.textContent = "";
  error.style.display = "none";
  $("#host-settings-name").classList.remove("field-invalid");
  $("#host-settings-address").classList.remove("field-invalid");
}

function showHostSettingsError(fieldId, message) {
  const field = $(fieldId);
  field.classList.add("field-invalid");
  field.focus();
  const error = $("#host-settings-error");
  error.textContent = message;
  error.style.display = "block";
}

function openHostSettings(host) {
  state.hostSettingsId = host.id;
  $("#host-settings-name").value = host.name;
  $("#host-settings-address").value = host.address;
  clearHostSettingsErrors();
  const status = $("#host-settings-status");
  status.textContent = "";
  status.className = "settings-status";
  $("#host-settings-overlay").classList.remove("hidden");
  $("#host-settings-name").focus();
}

function closeHostSettings() {
  $("#host-settings-overlay").classList.add("hidden");
  state.hostSettingsId = null;
}

function setHostStatus(text, kind = "") {
  const status = $("#host-settings-status");
  status.textContent = text;
  status.className = "settings-status" + (kind ? " " + kind : "");
}

async function saveHostSettings() {
  const hostId = state.hostSettingsId;
  if (hostId === null) {
    return;
  }
  clearHostSettingsErrors();
  const name = $("#host-settings-name").value.trim();
  if (!name) {
    showHostSettingsError("#host-settings-name", t("hostNameRequired"));
    return;
  }
  const address = $("#host-settings-address").value.trim();
  if (!address) {
    showHostSettingsError("#host-settings-address", t("hostAddressRequired"));
    return;
  }
  setHostStatus(t("saving"));
  try {
    await api(`/api/hosts/${hostId}`, { method: "PATCH", body: JSON.stringify({ name, address }) });
    setHostStatus(t("saved"), "ok");
    await loadContainers();
  } catch (error) {
    setHostStatus(`${t("hostRenameError")} ${error}`, "error");
  }
}

async function deleteHostFlow() {
  const hostId = state.hostSettingsId;
  if (hostId === null) {
    return;
  }
  const host = findHostById(hostId);
  if (!host) {
    return;
  }
  if (!confirm(t("deleteHostConfirm").replace("{name}", host.name))) {
    return;
  }
  try {
    await api(`/api/hosts/${hostId}`, { method: "DELETE" });
    closeHostSettings();
    await loadContainers();
  } catch (error) {
    setHostStatus(`${t("hostDeleteError")} ${error}`, "error");
  }
}

function setPanelState(hostId, panelId) {
  const card = document.querySelector(`.host-card[data-host-id="${hostId}"]`);
  if (!card) {
    return;
  }
  card.querySelectorAll(".host-panel").forEach((panel) => {
    panel.classList.toggle("open", panel.dataset.panelBody === panelId);
  });
  card.querySelectorAll(".host-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.panel === panelId);
  });
}

function toggleHostPanel(hostId, panel) {
  if (state.hostPanels[hostId] === panel) {
    delete state.hostPanels[hostId];
  } else {
    state.hostPanels[hostId] = panel;
  }
  setPanelState(hostId, state.hostPanels[hostId] || null);
}

function closeHostPanel(hostId, panel) {
  if (state.hostPanels[hostId] !== panel) {
    return;
  }
  delete state.hostPanels[hostId];
  setPanelState(hostId, null);
}

function initHosts() {
  $("#host-close").addEventListener("click", closeHostModal);
  $("#host-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = $("#host-error");
    const name = $("#host-name").value.trim();
    if (!name) {
      error.textContent = t("hostNameRequired");
      error.style.display = "block";
      return;
    }
    const address = $("#host-address").value.trim();
    if (!address) {
      error.textContent = t("hostAddressRequired");
      error.style.display = "block";
      return;
    }
    error.style.display = "none";
    const containerId = state.hostModalContainerId;
    const os = $("#host-os").value;
    try {
      await api(`/api/containers/${containerId}/hosts`, {
        method: "POST",
        body: JSON.stringify({ name, address, os }),
      });
      closeHostModal();
      await loadContainers();
    } catch (createError) {
      error.textContent = `${t("hostCreateError")} ${createError}`;
      error.style.display = "block";
    }
  });

  $("#host-settings-close").addEventListener("click", closeHostSettings);
  $("#host-settings-save").addEventListener("click", saveHostSettings);
  $("#host-delete-btn").addEventListener("click", deleteHostFlow);
  const settingsName = $("#host-settings-name");
  const settingsAddress = $("#host-settings-address");
  const clearSettingsInputErrors = () => {
    clearHostSettingsErrors();
    setHostStatus("");
  };
  settingsName.addEventListener("input", clearSettingsInputErrors);
  settingsAddress.addEventListener("input", clearSettingsInputErrors);
}