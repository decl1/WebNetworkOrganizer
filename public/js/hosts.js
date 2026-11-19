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

function hostAddressHtml(host) {
  const status = host.ping_status || "unknown";
  const dotTitle =
    status === "ok"
      ? t("pingOk").replace("{ms}", host.ping_ms !== null && host.ping_ms !== undefined ? host.ping_ms : "<1")
      : status === "fail"
        ? t("pingFail")
        : t("pingUnknown");
  return `<span class="host-address">
      <span class="ping-dot" data-status="${status}" title="${status === "unknown" ? "" : dotTitle}"></span>
      <span class="host-address-text">${escapeHtml(host.address)}</span>
    </span>`;
}

function hostSshBarHtml(host) {
  const status = host.ssh_status || "unknown";
  const port = host.ssh_port || 22;
  const title =
    status === "ok"
      ? `${t("sshOk")} — ${host.ssh_user}@${host.address}:${port}`
      : status === "fail"
        ? `${t("sshFail")}: ${host.ssh_error || ""}`
        : t("sshUnknown");
  return `<div class="ssh-bar">
      <span class="ping-dot" data-kind="ssh" data-status="${status}" title="${status === "unknown" ? "" : title}"></span>
      <span class="ssh-bar-label" title="${title}">${t("ssh")}: :${port}</span>
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
            ${hostAddressHtml(host)}
          </div>
          <div class="host-actions">
            <button class="btn icon" data-action="refresh-host" data-i18n-title="refresh" title="${t("refresh")}">${ICONS.refresh}</button>
          </div>
        </div>
        ${hostSshBarHtml(host)}
        ${hostSectionHtml("webServices", "noWebServices")}
        ${hostSectionHtml("services", "noServices")}
        <div class="host-footer">
          <button class="btn icon" data-action="host-settings" data-i18n-title="hostSettings" title="${t("hostSettings")}">${ICONS.gear}</button>
          <button class="btn icon" data-action="host-logs" data-i18n-title="logs" title="${t("logs")}">${ICONS.logs}</button>
          <button class="btn icon" data-action="host-terminal" data-i18n-title="terminal" title="${t("terminal")}">${ICONS.terminal}</button>
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

function updateHostPingDot(host) {
  const card = document.querySelector(`.host-card[data-host-id="${host.id}"]`);
  if (!card) {
    return;
  }
  const dot = card.querySelector(".ping-dot");
  if (!dot) {
    return;
  }
  const status = host.ping_status || "unknown";
  dot.dataset.status = status;
  dot.title =
    status === "ok"
      ? t("pingOk").replace("{ms}", host.ping_ms !== null && host.ping_ms !== undefined ? host.ping_ms : "<1")
      : status === "fail"
        ? t("pingFail")
        : t("pingUnknown");
}

function updateHostSshBar(host) {
  const card = document.querySelector(`.host-card[data-host-id="${host.id}"]`);
  if (!card) {
    return;
  }
  const dot = card.querySelector(".ssh-bar .ping-dot");
  const label = card.querySelector(".ssh-bar-label");
  if (!dot || !label) {
    return;
  }
  const status = host.ssh_status || "unknown";
  const port = host.ssh_port || 22;
  const title =
    status === "ok"
      ? `${t("sshOk")} — ${host.ssh_user}@${host.address}:${port}`
      : status === "fail"
        ? `${t("sshFail")}: ${host.ssh_error || ""}`
        : t("sshUnknown");
  dot.dataset.status = status;
  dot.title = status === "unknown" ? "" : title;
  label.textContent = `${t("ssh")}: :${port}`;
  label.title = title;
}

async function refreshHost(hostId, silent = false) {
  const timers = state.hostTimers;
  const entry = timers[hostId] || (timers[hostId] = { interval: null, intervalMs: 0, inFlight: false });
  if (entry.inFlight) {
    return;
  }
  entry.inFlight = true;
  try {
    const updated = await api(`/api/hosts/${hostId}/refresh`, { method: "POST" });
    const host = findHostById(hostId);
    if (host) {
      Object.assign(host, updated);
      updateHostPingDot(host);
      updateHostSshBar(host);
    }
  } catch (error) {
    if (silent) {
      return;
    }
    const host = findHostById(hostId);
    throw new Error(`${host ? host.name : hostId}: ${error}`);
  } finally {
    entry.inFlight = false;
  }
}

function clearHostSettingsErrors() {
  const error = $("#host-settings-error");
  error.textContent = "";
  error.style.display = "none";
  $("#host-settings-name").classList.remove("field-invalid");
  $("#host-settings-address").classList.remove("field-invalid");
  $("#host-settings-auto-refresh").classList.remove("field-invalid");
  $("#host-settings-ssh-user").classList.remove("field-invalid");
  $("#host-settings-ssh-port").classList.remove("field-invalid");
  $("#host-settings-ssh-password").classList.remove("field-invalid");
}

function setHostSettingsSection(section) {
  const overlay = $("#host-settings-overlay");
  overlay.querySelectorAll(".settings-nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.section === section);
  });
  overlay.querySelectorAll(".settings-section").forEach((item) => {
    item.style.display = item.id === `settings-section-${section}` ? "" : "none";
  });
}

function syncSshAuthFields() {
  const auth = $("#host-settings-ssh-auth").value;
  $("#host-settings-ssh-password-field").style.display = auth === "password" ? "" : "none";
  $("#host-settings-ssh-key-field").style.display = auth === "key" ? "" : "none";
}

async function fillSshPublicKey() {
  const input = $("#host-settings-ssh-key");
  try {
    const data = await api("/api/ssh/public-key");
    input.value = data.public_key || "";
  } catch (error) {
    input.value = "";
  }
}

function updateSshKeyInstallHint(host) {
  const hint = $("#host-settings-ssh-key-install");
  const user = $("#host-settings-ssh-user").value.trim();
  const port = $("#host-settings-ssh-port").value.trim();
  const address = (host && host.address) || "";
  hint.textContent =
    user && address ? `${t("sshKeyInstall")} ssh-copy-id -p ${port || 22} ${user}@${address}` : "";
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
  $("#host-settings-auto-refresh").value = host.auto_refresh ?? 0;
  $("#host-settings-ssh-auth").value = host.ssh_auth || "key";
  $("#host-settings-ssh-user").value = host.ssh_user || "";
  $("#host-settings-ssh-port").value = host.ssh_port || 22;
  $("#host-settings-ssh-password").value = host.ssh_password || "";
  clearHostSettingsErrors();
  syncSshAuthFields();
  updateSshKeyInstallHint(host);
  fillSshPublicKey();
  setHostSettingsSection("general");
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
  const autoRefresh = Number($("#host-settings-auto-refresh").value);
  if (!Number.isInteger(autoRefresh) || autoRefresh < 0 || autoRefresh > 86400) {
    showHostSettingsError("#host-settings-auto-refresh", t("autoRefreshInvalid"));
    return;
  }
  const sshAuth = $("#host-settings-ssh-auth").value;
  const sshUser = $("#host-settings-ssh-user").value.trim();
  const sshPort = Number($("#host-settings-ssh-port").value);
  if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) {
    showHostSettingsError("#host-settings-ssh-port", t("sshPortRequired"));
    return;
  }
  const sshPassword = sshAuth === "password" ? $("#host-settings-ssh-password").value.trim() : "";
  if (sshAuth === "password" && !sshPassword) {
    showHostSettingsError("#host-settings-ssh-password", t("sshPasswordRequired"));
    return;
  }
  setHostStatus(t("saving"));
  try {
    await api(`/api/hosts/${hostId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        address,
        auto_refresh: autoRefresh,
        ssh_auth: sshAuth,
        ssh_user: sshUser,
        ssh_port: sshPort,
        ssh_password: sshPassword,
      }),
    });
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
  document.querySelectorAll(".host-settings-save").forEach((btn) => btn.addEventListener("click", saveHostSettings));
  $("#host-delete-btn").addEventListener("click", deleteHostFlow);
  $("#host-settings-overlay").querySelectorAll(".settings-nav-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      const host = state.hostSettingsId !== null ? findHostById(state.hostSettingsId) : null;
      updateSshKeyInstallHint(host);
      setHostSettingsSection(item.dataset.section);
    });
  });
  const settingsAuth = $("#host-settings-ssh-auth");
  const settingsUser = $("#host-settings-ssh-user");
  const settingsPort = $("#host-settings-ssh-port");
  settingsAuth.addEventListener("change", () => {
    syncSshAuthFields();
    const host = state.hostSettingsId !== null ? findHostById(state.hostSettingsId) : null;
    updateSshKeyInstallHint(host);
  });
  const clearSettingsInputErrors = () => {
    clearHostSettingsErrors();
    setHostStatus("");
  };
  const settingsName = $("#host-settings-name");
  const settingsAddress = $("#host-settings-address");
  const settingsAutoRefresh = $("#host-settings-auto-refresh");
  const settingsPassword = $("#host-settings-ssh-password");
  settingsName.addEventListener("input", clearSettingsInputErrors);
  settingsAddress.addEventListener("input", clearSettingsInputErrors);
  settingsAutoRefresh.addEventListener("input", clearSettingsInputErrors);
  settingsUser.addEventListener("input", () => {
    clearSettingsInputErrors();
    const host = state.hostSettingsId !== null ? findHostById(state.hostSettingsId) : null;
    updateSshKeyInstallHint(host);
  });
  settingsPort.addEventListener("input", () => {
    clearSettingsInputErrors();
    const host = state.hostSettingsId !== null ? findHostById(state.hostSettingsId) : null;
    updateSshKeyInstallHint(host);
  });
  settingsPassword.addEventListener("input", clearSettingsInputErrors);
}