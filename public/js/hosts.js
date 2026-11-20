"use strict";

function getOpenPanel(hostId) {
  return state.hostPanels[hostId] || null;
}

function hostWebServicesHtml(host) {
  const services = host.web_services || [];
  if (services.length === 0) {
    return hostSectionHtml("webServices", "noWebServices");
  }
  const address = host.address || "";
  const rows = services.map((service) => webServiceRowHtml(service, address)).join("");
  return `<div class="host-section" data-host-ws="${host.id}">
      <h4 class="host-section-title">${t("webServices")}</h4>
      ${rows}
    </div>`;
}

function webServiceRowHtml(service, address) {
  const status = service.status || "unknown";
  const title =
    status === "ok"
      ? t("wsOk")
      : status === "fail"
        ? `${t("wsFail")}: ${service.error || ""}`
        : t("wsUnknown");
  const openUrl = `http://${address}:${service.port}/`;
  const openButton = `<a class="ws-open" href="${escapeHtml(openUrl)}" target="_blank" rel="noopener" title="${t("wsOpen")}">${ICONS.chevronRight}</a>`
  return `<div class="ws-row">
      <span class="ping-dot" data-kind="ws" data-status="${status}" title="${status === "unknown" ? "" : title}"></span>
      <span class="ws-name" title="${title}">${escapeHtml(service.name)}</span>
      <span class="ws-port">:${service.port}</span>
      ${openButton}
    </div>`;
}

function updateHostWebServices(host) {
  const card = document.querySelector(`.host-card[data-host-id="${host.id}"]`);
  if (!card) {
    return;
  }
  const current = card.querySelector(".host-section[data-host-ws]");
  if (current) {
    current.outerHTML = hostWebServicesHtml(host);
  }
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
  const bodyKey = panel === "docker" ? "dockerLoading" : "noSysInfoData";
  const body =
    panel === "docker"
      ? `<div class="host-panel-body" data-docker-body="${hostId}">${t(bodyKey)}</div>`
      : `<div class="host-panel-body">${t(bodyKey)}</div>`;
  return `
    <div class="host-panel${open}" data-panel-body="${panel}">
      <div class="host-panel-header">
        <span class="host-panel-icon">${ICONS[panel]}</span>
        <span class="host-panel-title">${t(titleKey)}</span>
        <button class="btn icon panel-close" data-action="close-panel" data-panel="${panel}" title="${t("close")}">${ICONS.x}</button>
      </div>
      ${body}
    </div>`;
}

function dockerRowHtml(container) {
  const up = /^Up/i.test(container.status || "");
  const title = `ID: ${container.id}`;
  return `<div class="docker-item" title="${escapeHtml(title)}">
      <span class="docker-dot" data-up="${up ? 1 : 0}"></span>
      <span class="docker-icon">${ICONS.docker}</span>
      <span class="docker-name">${escapeHtml(container.names || container.id)}</span>
      <span class="docker-image">${escapeHtml(container.image || "")}</span>
      <span class="docker-ports">${escapeHtml(container.ports || "")}</span>
    </div>`;
}

async function loadDockerPanel(hostId) {
  const card = document.querySelector(`.host-card[data-host-id="${hostId}"]`);
  if (!card) {
    return;
  }
  const body = card.querySelector(`[data-docker-body="${hostId}"]`);
  if (!body) {
    return;
  }
  const host = findHostById(hostId);
  if (!host || !host.docker_enabled) {
    body.innerHTML = `<p class="panel-empty">${t("dockerDisabled")}</p>`;
    return;
  }
  try {
    const result = await api(`/api/hosts/${hostId}/docker`);
    if (result && result.error) {
      body.innerHTML = `<p class="panel-error">${t("dockerLoadError")}: ${escapeHtml(result.error)}</p>`;
      return;
    }
    const containers = (result && result.containers) || [];
    if (containers.length === 0) {
      body.innerHTML = `<p class="panel-empty">${t("dockerNoContainers")}</p>`;
      return;
    }
    body.innerHTML = `<div class="docker-list">${containers.map(dockerRowHtml).join("")}</div>`;
  } catch (error) {
    body.innerHTML = `<p class="panel-error">${t("dockerLoadError")}: ${escapeHtml(String(error))}</p>`;
  }
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
        ${hostWebServicesHtml(host)}
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
      updateHostWebServices(host);
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
  $("#host-settings-docker-command").classList.remove("field-invalid");
  $("#ws-list").querySelectorAll(".field-invalid").forEach((input) => input.classList.remove("field-invalid"));
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
  state.hostSettingsWebServices = (host.web_services || []).map((service) => ({
    uid: `db-${service.id}`,
    id: service.id,
    orig: { name: service.name, port: service.port, health_url: service.health_url },
    name: service.name,
    port: service.port,
    health_url: service.health_url || "",
  }));
  state.hostSettingsWebServicesRemoved = [];
  renderWebServicesSettings();
  $("#host-settings-name").value = host.name;
  $("#host-settings-address").value = host.address;
  $("#host-settings-auto-refresh").value = host.auto_refresh ?? 0;
  $("#host-settings-ssh-auth").value = host.ssh_auth || "key";
  $("#host-settings-ssh-user").value = host.ssh_user || "";
  $("#host-settings-ssh-port").value = host.ssh_port || 22;
  $("#host-settings-ssh-password").value = host.ssh_password || "";
  $("#host-settings-docker-enabled").checked = !!host.docker_enabled;
  $("#host-settings-docker-command").value = host.docker_command || "sudo docker ps";
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

let wsUidCounter = 1;

function wsSettingsRowHtml(entry) {
  return `<div class="ws-form-row" data-entry-id="${entry.uid}">
      <input class="ws-input-name" type="text" maxlength="100" placeholder="${t("wsName")}" value="${escapeHtml(entry.name)}">
      <input class="ws-input-port" type="number" min="1" max="65535" step="1" placeholder="${t("wsPort")}" value="${entry.port}">
      <input class="ws-input-health" type="text" maxlength="500" placeholder="${t("wsHealthUrl")}" value="${escapeHtml(entry.health_url)}" title="${t("wsHealthUrlHint")}">
      <button type="button" class="btn icon ws-input-remove" data-i18n-title="wsRemove" title="${t("wsRemove")}">${ICONS.trash}</button>
    </div>`;
}

function renderWebServicesSettings() {
  const list = $("#ws-list");
  const entries = state.hostSettingsWebServices;
  if (entries.length === 0) {
    list.innerHTML = `<p class="host-section-empty">${t("noWebServices")}</p>`;
    return;
  }
  list.innerHTML = entries.map(wsSettingsRowHtml).join("");
}

function addWebServiceRow() {
  state.hostSettingsWebServices.push({
    uid: `new-${wsUidCounter++}`,
    id: null,
    orig: { name: "", port: 80, health_url: "" },
    name: "",
    port: 80,
    health_url: "",
  });
  renderWebServicesSettings();
}

function removeWebServiceRow(entryId) {
  const index = state.hostSettingsWebServices.findIndex((entry) => entry.uid === entryId);
  if (index === -1) {
    return;
  }
  const entry = state.hostSettingsWebServices[index];
  if (entry.id !== null) {
    state.hostSettingsWebServicesRemoved.push(entry.id);
  }
  state.hostSettingsWebServices.splice(index, 1);
  renderWebServicesSettings();
}

function collectWebServicesFromSettings() {
  return state.hostSettingsWebServices.map((entry) => {
    const row = document.querySelector(`.ws-form-row[data-entry-id="${entry.uid}"]`);
    const name = row ? row.querySelector(".ws-input-name").value.trim() : entry.name;
    const port = row ? Number(row.querySelector(".ws-input-port").value) : entry.port;
    const healthUrl = row ? row.querySelector(".ws-input-health").value.trim() : entry.health_url;
    return { ...entry, name, port, health_url: healthUrl };
  });
}

async function saveWebServices(hostId) {
  const entries = collectWebServicesFromSettings();
  for (const entry of entries) {
    if (!entry.name) {
      setHostStatus("");
      showHostSettingsError(`.ws-form-row[data-entry-id="${entry.uid}"] .ws-input-name`, t("wsNameRequired"));
      return false;
    }
    if (!Number.isInteger(entry.port) || entry.port < 1 || entry.port > 65535) {
      setHostStatus("");
      showHostSettingsError(`.ws-form-row[data-entry-id="${entry.uid}"] .ws-input-port`, t("wsPortRequired"));
      return false;
    }
  }
  for (const entry of entries) {
    if (entry.id === null) {
      const created = await api(`/api/hosts/${hostId}/web-services`, {
        method: "POST",
        body: JSON.stringify({ name: entry.name, port: entry.port, health_url: entry.health_url }),
      });
      entry.id = created.id;
      entry.uid = `db-${created.id}`;
      entry.orig = { name: entry.name, port: entry.port, health_url: entry.health_url };
      continue;
    }
    if (
      entry.name !== entry.orig.name ||
      entry.port !== entry.orig.port ||
      entry.health_url !== entry.orig.health_url
    ) {
      await api(`/api/hosts/${hostId}/web-services/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: entry.name, port: entry.port, health_url: entry.health_url }),
      });
    }
  }
  for (const serviceId of state.hostSettingsWebServicesRemoved) {
    await api(`/api/hosts/${hostId}/web-services/${serviceId}`, { method: "DELETE" });
  }
  return true;
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
  const dockerEnabled = $("#host-settings-docker-enabled").checked;
  const dockerCommand = $("#host-settings-docker-command").value.trim();
  if (dockerEnabled && !dockerCommand) {
    showHostSettingsError("#host-settings-docker-command", t("dockerCommandRequired"));
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
        docker_enabled: dockerEnabled,
        docker_command: dockerCommand || "sudo docker ps",
      }),
    });
    const saved = await saveWebServices(hostId);
    if (!saved) {
      return;
    }
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
  if (state.hostPanels[hostId] === "docker") {
    loadDockerPanel(hostId);
  }
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
  $("#ws-add-btn").addEventListener("click", addWebServiceRow);
  $("#ws-list").addEventListener("click", (event) => {
    const removeBtn = event.target.closest(".ws-input-remove");
    if (!removeBtn) {
      return;
    }
    const row = removeBtn.closest(".ws-form-row");
    if (row) {
      removeWebServiceRow(row.dataset.entryId);
    }
  });
  $("#ws-list").addEventListener("input", () => {
    clearSettingsInputErrors();
    setHostStatus("");
  });
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
  const settingsDockerCommand = $("#host-settings-docker-command");
  settingsDockerCommand.addEventListener("input", clearSettingsInputErrors);
  settingsPassword.addEventListener("input", clearSettingsInputErrors);
}