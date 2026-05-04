function readStoredToken() {
  return (
    localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
  );
}

function storeAuthToken(token, rememberMe) {
  if (rememberMe) {
    localStorage.setItem('auth_token', token);
    sessionStorage.removeItem('auth_token');
    return;
  }

  sessionStorage.setItem('auth_token', token);
  localStorage.removeItem('auth_token');
}

function clearStoredToken() {
  localStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_token');
}

function readRememberedUsername() {
  return localStorage.getItem('login_username') || '';
}

function storeRememberedUsername(username, rememberMe) {
  if (rememberMe) {
    localStorage.setItem('login_username', username);
  } else {
    localStorage.removeItem('login_username');
  }
}

const state = {
  token: readStoredToken(),
  eventSource: null,
  lastStatus: null,
  activity: [],
  configs: [],
  cookies: [],
  recipients: [],
  whatsappTargets: [],
  schedules: [],
  groups: [],
  prtgSettings: null,
  receiptFilter: 'all',
  accountUser: null,
};

const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout');
const logoutMobileBtn = document.getElementById('logout-mobile');
const toastContainer = document.getElementById('toast-container');

function showToast(message, type = 'error') {
  if (!toastContainer) return;
  const alertClass =
    type === 'success'
      ? 'alert-success'
      : type === 'info'
        ? 'alert-info'
        : type === 'warning'
          ? 'alert-warning'
          : 'alert-error';
  const alert = document.createElement('div');
  alert.className = `alert ${alertClass} pointer-events-auto shadow-lg max-w-xs py-2 px-3 text-sm`;
  alert.textContent = message;
  toastContainer.appendChild(alert);
  setTimeout(() => alert.remove(), 4000);
}

const statusText = document.getElementById('status-text');
const sessionText = document.getElementById('session-text');
const disconnectText = document.getElementById('disconnect-text');
const botJidText = document.getElementById('bot-jid-text');
const connectedText = document.getElementById('connected-text');
const hasQrText = document.getElementById('hasqr-text');
const connectionChip = document.getElementById('connection-chip');
const qrImage = document.getElementById('qr-image');
const qrCanvas = document.getElementById('qr-canvas');
const qrHint = document.getElementById('qr-hint');
const activityFeed = document.getElementById('activity-feed');
const navItems = document.querySelectorAll('.nav-item');
const contentViews = document.querySelectorAll('.content-view');
const prtgChip = document.getElementById('prtg-chip');
const receiptChip = document.getElementById('receipt-chip');

const configForm = document.getElementById('config-form');
const configList = document.getElementById('config-list');
const configClear = document.getElementById('config-clear');
const cookieForm = document.getElementById('cookie-form');
const cookieList = document.getElementById('cookie-list');
const cookieClear = document.getElementById('cookie-clear');
const receiptAddBtn = document.getElementById('receipt-add-btn');
const receiptModal = document.getElementById('receipt-modal');
const receiptModalClose = document.getElementById('receipt-modal-close');
const receiptModalTitle = document.getElementById('receipt-modal-title');
const receiptForm = document.getElementById('receipt-form');
const receiptList = document.getElementById('receipt-list');
const receiptClear = document.getElementById('receipt-clear');
const receiptTargetsRoot = document.getElementById('receipt-targets');
const receiptTargetsContact = document.getElementById(
  'receipt-targets-contact',
);
const receiptTargetsGroup = document.getElementById('receipt-targets-group');
const receiptTargetsChannel = document.getElementById(
  'receipt-targets-channel',
);
const receiptManualToggle = document.getElementById('receipt-manual-toggle');
const receiptManualRow = document.getElementById('receipt-manual-row');
const receiptChannelInput = document.getElementById('receipt-channel-input');
const receiptChannelBtn = document.getElementById('receipt-channel-btn');
const receiptGroupSelect = document.getElementById('receipt-group-select');
const receiptFilter = document.getElementById('receipt-filter');
const scheduleForm = document.getElementById('schedule-form');
const scheduleList = document.getElementById('schedule-list');
const scheduleClear = document.getElementById('schedule-clear');
const scheduleRunEnabledBtn = document.getElementById('schedule-run-enabled');
const groupSendBtn = document.getElementById('group-send-btn');
const groupSendSelect = document.getElementById('group-send-select');
const groupForm = document.getElementById('group-form');
const groupList = document.getElementById('group-list');
const groupFormClear = document.getElementById('group-form-clear');
const prtgSettingsForm = document.getElementById('prtg-settings-form');
const prtgSettingsClear = document.getElementById('prtg-settings-clear');
const accountForm = document.getElementById('account-form');
const accountMessage = document.getElementById('account-message');
const accountChip = document.getElementById('account-chip');

const rememberedUsername = readRememberedUsername();
if (loginForm && rememberedUsername) {
  const usernameField = getField(loginForm, 'username');
  if (usernameField) {
    usernameField.value = rememberedUsername;
  }
}

function getField(form, name) {
  return form ? form.querySelector(`[name="${name}"]`) : null;
}

function showLogin() {
  loginView.classList.remove('hidden');
  appView.classList.add('hidden');
}

function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
}

function setActiveView(viewName, pushState = true) {
  contentViews.forEach((view) => {
    view.classList.toggle('hidden', view.dataset.view !== viewName);
  });

  navItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  if (pushState) {
    const url = viewName === 'whatsapp' ? '/' : `/${viewName}`;
    window.history.pushState({ view: viewName }, '', url);
  }

  // Lazy load data based on view
  if (viewName === 'whatsapp') {
    loadStatus().catch(handleLogout);
    loadAccount().catch(handleLogout);
  } else if (viewName === 'prtg') {
    loadPrtgData().catch(handleLogout);
  } else if (viewName === 'receipts') {
    // Only load PRTG data for receipts (not WhatsApp targets)
    loadPrtgData().catch(handleLogout);
  }
}

window.addEventListener('popstate', (event) => {
  if (event.state && event.state.view) {
    setActiveView(event.state.view, false);
  } else {
    initRouter();
  }
});

function initRouter() {
  const path = window.location.pathname.replace(/^\/|\/$/g, '');
  const validViews = ['whatsapp', 'prtg', 'receipts'];
  const viewName = validViews.includes(path) ? path : 'whatsapp';
  setActiveView(viewName, false);
}

function setLoginError(message) {
  if (!message) {
    loginError.classList.add('hidden');
    return;
  }

  loginError.textContent = message;
  loginError.classList.remove('hidden');
}

function setAccountMessage(message, type = 'success') {
  if (!accountMessage) {
    return;
  }

  if (!message) {
    accountMessage.classList.add('hidden');
    accountMessage.textContent = '';
    return;
  }

  accountMessage.textContent = message;
  accountMessage.classList.toggle('text-success', type === 'success');
  accountMessage.classList.toggle('text-error', type === 'error');
  accountMessage.classList.remove('hidden');
}

function fillAccountForm() {
  if (!accountForm || !state.accountUser) {
    return;
  }

  getField(accountForm, 'username').value = state.accountUser.username || '';
  getField(accountForm, 'currentPassword').value = '';
  getField(accountForm, 'newPassword').value = '';

  if (accountChip) {
    accountChip.textContent = state.accountUser.username || 'signed in';
  }
}

async function login(username, password) {
  setLoginError('');
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  const data = await response.json();
  state.token = data.token;
  state.accountUser = data.user;
}

async function loadAccount() {
  const response = await apiFetch('/api/auth/me');
  state.accountUser = await response.json();
  fillAccountForm();
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders(),
    },
  });

  if (response.status === 401) {
    handleLogout();
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Request failed');
  }

  return response;
}

async function loadStatus() {
  const response = await apiFetch('/api/whatsapp/status');
  const status = await response.json();
  updateStatus(status, 'Initial status loaded');
}

async function loadPrtgData() {
  const [configs, cookies, recipients, schedules, groups, settings] =
    await Promise.all([
      apiFetch('/api/prtg/configs').then((res) => res.json()),
      apiFetch('/api/prtg/cookies').then((res) => res.json()),
      apiFetch('/api/prtg/recipients').then((res) => res.json()),
      apiFetch('/api/prtg/schedules').then((res) => res.json()),
      apiFetch('/api/prtg/groups').then((res) => res.json()),
      apiFetch('/api/prtg/settings').then((res) => res.json()),
    ]);

  state.configs = configs;
  state.cookies = cookies;
  state.recipients = recipients;
  state.schedules = schedules;
  state.groups = groups;
  state.prtgSettings = settings;

  renderGroups();
  fillPrtgSettingsForm(settings);
  populateGroupSelects();
  renderConfigs();
  renderCookies();
  renderReceipts();
  renderReceiptTargets();
  renderSchedules();

  if (prtgChip) {
    prtgChip.textContent = configs.length ? 'Configured' : 'Empty';
  }

  if (receiptChip) {
    receiptChip.textContent = `${recipients.length} items`;
  }
}

async function loadWhatsappTargets() {
  try {
    const response = await apiFetch('/api/whatsapp/targets');
    state.whatsappTargets = await response.json();
  } catch (error) {
    state.whatsappTargets = [];
  }

  renderReceiptTargets();
}

function updateStatus(status, note) {
  state.lastStatus = status;

  statusText.textContent = status.status;
  sessionText.textContent = status.sessionName || 'haruyaki';
  disconnectText.textContent = status.lastDisconnect?.at ?? '-';
  botJidText.textContent = status.me?.id ?? '-';
  connectedText.textContent = status.isConnected ? 'Yes' : 'No';
  hasQrText.textContent = status.hasQr ? 'Yes' : 'No';

  connectionChip.textContent = status.status;
  connectionChip.className = `badge ${status.isConnected ? 'badge-success' : 'badge-neutral'}`;

  const isLinked = Boolean(
    status.isConnected || status.me?.id || status.status === 'open',
  );

  if (isLinked) {
    clearQr(status, 'Session linked. QR is hidden.');
  } else if (status.status === 'qr_ready' && status.qrDataUrl) {
    qrHint.textContent = 'Scan to connect';
    renderQrImage(status.qrDataUrl);
  } else if (status.status === 'qr_ready' && status.qr) {
    qrHint.textContent = 'Scan to connect';
    renderQr(status.qr);
  } else {
    clearQr(status);
  }

  const wasConnected = state.lastStatus?.isConnected;
  if (!wasConnected && status.isConnected) {
    // We only refresh whatsapp targets here if they are already loaded
    // to keep it lazy. But if the modal is open, we should fetch.
    if (state.whatsappTargets.length > 0) {
      loadWhatsappTargets().catch(() => {});
    }
  }

  if (note) {
    pushActivity(note, status.status);
  }
}

function getMergedReceiptTargets() {
  const savedTargets = state.recipients
    .filter((recipient) => recipient.phoneNumber?.includes('@'))
    .map((recipient) => ({
      type: recipient.targetType || inferTargetType(recipient.phoneNumber),
      jid: recipient.phoneNumber,
      label: recipient.label || recipient.phoneNumber,
      description: recipient.label ? recipient.phoneNumber : null,
    }));

  return [...state.whatsappTargets, ...savedTargets].filter(
    (target, index, list) =>
      list.findIndex((item) => item.jid === target.jid) === index,
  );
}

function formatTargetLabel(target) {
  const label = target.label?.trim();
  if (label && label !== target.jid) {
    return label;
  }

  return formatJid(target.jid);
}

function formatTargetMeta(target) {
  const description = target.description?.trim();
  if (description && description !== target.jid) {
    return description;
  }

  return target.jid;
}

function formatJid(jid) {
  if (!jid) {
    return '-';
  }

  const base = jid.split('@')[0] || jid;
  if (base.length <= 6) {
    return base;
  }

  return `${base.slice(0, 4)}…${base.slice(-2)}`;
}

function renderReceiptTargets() {
  if (
    !receiptTargetsContact ||
    !receiptTargetsGroup ||
    !receiptTargetsChannel
  ) {
    return;
  }

  const targets = getMergedReceiptTargets();
  const buckets = {
    contact: receiptTargetsContact,
    group: receiptTargetsGroup,
    channel: receiptTargetsChannel,
  };

  Object.values(buckets).forEach((container) => {
    container.innerHTML = '';
  });

  targets.forEach((target) => {
    const container = buckets[target.type];
    if (!container) {
      return;
    }

    const label = document.createElement('label');
    label.className =
      'option-row flex items-start gap-2 p-2 rounded-lg border border-transparent cursor-pointer hover:bg-base-300 transition-colors';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'receiptTarget';
    input.value = target.jid;
    input.dataset.type = target.type;
    input.className = 'checkbox checkbox-xs mt-0.5 shrink-0';

    const textWrap = document.createElement('div');
    textWrap.className = 'flex flex-col min-w-0';

    const nameEl = document.createElement('span');
    nameEl.className = 'option-name text-sm font-medium leading-tight';
    nameEl.textContent = formatTargetLabel(target);

    const jidEl = document.createElement('span');
    jidEl.className =
      'text-xs text-base-content/40 font-mono leading-tight break-all mt-0.5';
    jidEl.textContent = target.jid;

    textWrap.append(nameEl, jidEl);
    label.append(input, textWrap);

    const refreshOption = () => {
      const checked = input.checked;
      label.classList.toggle('border-primary', checked);
      label.classList.toggle('bg-primary/10', checked);
      label.classList.toggle('border-transparent', !checked);
      nameEl.classList.toggle('text-primary', checked);
      nameEl.classList.toggle('font-semibold', checked);
    };

    input.addEventListener('change', () => {
      if (!input.checked) {
        return;
      }

      // Deselect all other options visually
      if (receiptTargetsRoot) {
        receiptTargetsRoot.querySelectorAll('.option-row').forEach((row) => {
          row.classList.remove('border-primary', 'bg-primary/10');
          row.classList.add('border-transparent');
          const n = row.querySelector('.option-name');
          if (n) {
            n.classList.remove('text-primary', 'font-semibold');
          }
        });
      }
      refreshOption();

      deselectReceiptTargets(input);
      if (receiptManualToggle) {
        receiptManualToggle.checked = false;
        updateReceiptManualVisibility();
      }

      if (receiptForm) {
        getField(receiptForm, 'phoneNumber').value = target.jid;
        if (!getField(receiptForm, 'label').value.trim()) {
          getField(receiptForm, 'label').value = target.label;
        }
      }
    });

    container.appendChild(label);
  });

  Object.entries(buckets).forEach(([type, container]) => {
    if (container.children.length > 0) {
      return;
    }

    const empty = document.createElement('div');
    empty.className = 'text-xs text-base-content/40 italic p-2';
    empty.textContent = `Belum ada ${type}.`;
    container.appendChild(empty);
  });
}

function renderQrImage(dataUrl) {
  qrCanvas.classList.add('hidden');
  qrImage.src = dataUrl;
  qrImage.classList.remove('hidden');
}

function renderQr(text) {
  if (!window.QRCode) {
    qrImage.classList.add('hidden');
    qrImage.removeAttribute('src');
    qrCanvas.classList.add('hidden');
    qrHint.textContent = 'QR received, but renderer is unavailable.';
    return;
  }

  qrImage.classList.add('hidden');
  qrImage.removeAttribute('src');
  qrCanvas.classList.remove('hidden');
  window.QRCode.toCanvas(qrCanvas, text, { width: 160, margin: 1 }, (error) => {
    if (error) {
      qrHint.textContent = 'Failed to render QR.';
    }
  });
}

function clearQr(status, message) {
  qrImage.classList.add('hidden');
  qrImage.removeAttribute('src');
  qrCanvas.classList.toggle('hidden', Boolean(message));
  const ctx = qrCanvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
  }
  qrHint.textContent = message
    ? message
    : status?.lastDisconnect?.message
      ? `Waiting for QR. Last error: ${status.lastDisconnect.message}`
      : 'Waiting for QR...';
}

function pushActivity(message, status) {
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${message} (${status})`;
  state.activity.unshift(line);
  state.activity = state.activity.slice(0, 8);
  renderActivity();
}

function renderActivity() {
  activityFeed.innerHTML = '';
  state.activity.forEach((line) => {
    const li = document.createElement('li');
    li.className =
      'px-2 py-1 rounded text-xs font-mono border-l-2 border-primary/40 bg-base-300 text-base-content/70';
    li.textContent = line;
    activityFeed.appendChild(li);
  });
}

function renderGroups() {
  if (!groupList) {
    return;
  }

  groupList.innerHTML = '';
  state.groups.forEach((group) => {
    const item = document.createElement('div');
    item.className =
      'flex items-center justify-between gap-2 rounded-lg bg-base-100 border border-base-300 p-2.5';

    const info = document.createElement('div');
    info.className = 'flex items-center gap-1.5 flex-wrap flex-1 min-w-0';
    info.innerHTML = `
      <span class="font-semibold text-sm">${group.name}</span>
      <span class="badge badge-xs ${group.enabled ? 'badge-soft badge-success' : 'badge-soft badge-error'}">${group.enabled ? 'on' : 'off'}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-1 shrink-0';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.className = 'btn btn-xs btn-ghost';
    editBtn.addEventListener('click', () => fillGroupForm(group));

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.textContent = group.enabled ? 'Disable' : 'Enable';
    toggleBtn.className = group.enabled
      ? 'btn btn-xs btn-ghost text-warning'
      : 'btn btn-xs btn-success';
    toggleBtn.addEventListener('click', () =>
      toggleGroupEnabled(group.id, !group.enabled),
    );

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Del';
    deleteBtn.className = 'btn btn-xs btn-ghost text-error';
    deleteBtn.addEventListener('click', () => deleteGroup(group.id));

    actions.append(editBtn, toggleBtn, deleteBtn);
    item.append(info, actions);
    groupList.appendChild(item);
  });
}

function populateGroupSelects() {
  const enabledGroups = state.groups.filter((g) => g.enabled);

  // Config form select (required, no ALL option). Disabled groups are still
  // shown so existing configs can be edited without losing their group value.
  const configGroupSelect = configForm
    ? configForm.querySelector('[name="groupId"]')
    : null;
  if (configGroupSelect) {
    const current = configGroupSelect.value;
    configGroupSelect.innerHTML =
      '<option value="" disabled selected>Pilih group...</option>';
    state.groups.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = String(g.id);
      opt.textContent = g.enabled ? g.name : `${g.name} (disabled)`;
      configGroupSelect.appendChild(opt);
    });
    if (current) {
      configGroupSelect.value = current;
    }
  }

  // Schedule form select (optional, ALL as first option)
  const scheduleGroupSelect = scheduleForm
    ? scheduleForm.querySelector('[name="groupId"]')
    : null;
  if (scheduleGroupSelect) {
    const current = scheduleGroupSelect.value;
    scheduleGroupSelect.innerHTML =
      '<option value="">ALL – semua group aktif</option>';
    enabledGroups.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = String(g.id);
      opt.textContent = g.name;
      scheduleGroupSelect.appendChild(opt);
    });
    scheduleGroupSelect.value = current || '';
  }

  // Receipt form select (optional, ALL as first option)
  if (receiptGroupSelect) {
    const current = receiptGroupSelect.value;
    receiptGroupSelect.innerHTML =
      '<option value="">Semua Group (ALL)</option>';
    enabledGroups.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = String(g.id);
      opt.textContent = g.name;
      receiptGroupSelect.appendChild(opt);
    });
    receiptGroupSelect.value = current || '';
  }

  // Group send select
  if (groupSendSelect) {
    const current = groupSendSelect.value;
    groupSendSelect.innerHTML =
      '<option value="ALL">ALL – semua group aktif</option>';
    enabledGroups.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = String(g.id);
      opt.textContent = g.name;
      groupSendSelect.appendChild(opt);
    });
    groupSendSelect.value = current || 'ALL';
  }
}

function renderConfigs() {
  if (!configList) {
    return;
  }

  configList.innerHTML = '';

  if (state.configs.length === 0) {
    const empty = document.createElement('li');
    empty.className =
      'rounded-lg border border-dashed border-base-300 bg-base-100 p-4 text-sm text-base-content/50';
    empty.textContent = 'Belum ada PRTG config.';
    configList.appendChild(empty);
    return;
  }

  const configsByGroup = state.configs.reduce((groups, config) => {
    const groupName = config.groupName || 'Tanpa Group';
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(config);
    return groups;
  }, new Map());

  const orderedGroupNames = [
    ...state.groups
      .map((group) => group.name)
      .filter((groupName) => configsByGroup.has(groupName)),
    ...[...configsByGroup.keys()].filter(
      (groupName) => !state.groups.some((group) => group.name === groupName),
    ),
  ];

  orderedGroupNames.forEach((groupName) => {
    const configs = configsByGroup.get(groupName) || [];
    const groupId = configs[0]?.groupId;
    const group = state.groups.find((item) => item.id === groupId);
    const groupEnabled =
      group?.enabled ?? configs.some((config) => config.groupEnabled);
    const section = document.createElement('li');

    const details = document.createElement('details');
    details.className =
      'collapse collapse-arrow border border-base-300 bg-base-100';
    details.open = configList.children.length === 0;

    const summary = document.createElement('summary');
    summary.className = 'collapse-title min-h-0 px-3 py-3 pr-10 cursor-pointer';
    summary.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="font-semibold text-sm min-w-0 break-all sm:truncate">${groupName}</span>
          <span class="badge badge-xs ${groupEnabled ? 'badge-soft badge-success' : 'badge-soft badge-error'} shrink-0">${groupEnabled ? 'on' : 'off'}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="badge badge-sm badge-outline shrink-0">${configs.length} chart</span>
          <button
            type="button"
            class="btn btn-xs ${groupEnabled ? 'btn-ghost text-warning' : 'btn-success'}"
            data-group-toggle-id="${groupId ?? ''}"
            data-group-toggle-enabled="${groupEnabled ? 'false' : 'true'}"
            ${groupId ? '' : 'disabled'}
          >
            ${groupEnabled ? 'Disable' : 'Enable'}
          </button>
          <button
            type="button"
            class="btn btn-xs btn-secondary"
            data-group-send-id="${groupId ?? ''}"
            ${groupId && groupEnabled ? '' : 'disabled'}
          >
            Send All
          </button>
        </div>
      </div>
    `;

    const sendAllBtn = summary.querySelector('[data-group-send-id]');
    sendAllBtn?.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget;
      if (
        !(target instanceof HTMLButtonElement) ||
        !target.dataset.groupSendId
      ) {
        return;
      }

      target.disabled = true;
      try {
        await sendGroup(target.dataset.groupSendId);
      } finally {
        target.disabled = false;
      }
    });

    const toggleGroupBtn = summary.querySelector('[data-group-toggle-id]');
    toggleGroupBtn?.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget;
      if (
        !(target instanceof HTMLButtonElement) ||
        !target.dataset.groupToggleId
      ) {
        return;
      }

      target.disabled = true;
      try {
        await toggleGroupEnabled(
          Number(target.dataset.groupToggleId),
          target.dataset.groupToggleEnabled === 'true',
        );
      } finally {
        target.disabled = false;
      }
    });

    const content = document.createElement('div');
    content.className = 'collapse-content px-3 pb-3';

    const items = document.createElement('div');
    items.className = 'grid grid-cols-1 xl:grid-cols-2 gap-2';

    configs.forEach((config) => {
      items.appendChild(createConfigItem(config));
    });

    content.appendChild(items);
    details.append(summary, content);
    section.appendChild(details);
    configList.appendChild(section);
  });
}

function createConfigItem(config) {
  const item = document.createElement('div');
  item.className =
    'flex flex-col sm:flex-row sm:items-start justify-between gap-2 rounded-lg bg-base-200/50 border border-base-300 p-3';
  item.classList.toggle('opacity-60', config.groupEnabled === false);

  const info = document.createElement('div');
  info.className = 'flex-1 min-w-0';
  info.innerHTML = `
    <div class="flex items-center gap-1.5 flex-wrap min-w-0">
      <span class="font-semibold text-sm min-w-0 break-all sm:truncate">${config.title}</span>
      <span class="badge badge-xs ${config.enabled ? 'badge-soft badge-success' : 'badge-soft badge-error'} shrink-0">${config.enabled ? 'on' : 'off'}</span>
    </div>
    <p class="text-xs text-base-content/40 break-all sm:truncate mt-0.5">${config.requestUrl}</p>
  `;

  const actions = document.createElement('div');
  actions.className =
    'grid grid-cols-3 sm:flex sm:items-center sm:justify-end gap-1 shrink-0 w-full sm:w-auto';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.textContent = 'Edit';
  editBtn.className = 'btn btn-xs btn-ghost';
  editBtn.addEventListener('click', () => fillConfigForm(config));

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.textContent = 'Send';
  sendBtn.className = 'btn btn-xs btn-primary';
  sendBtn.disabled = config.groupEnabled === false;
  sendBtn.addEventListener('click', () => sendConfig(config.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Del';
  deleteBtn.className = 'btn btn-xs btn-ghost text-error';
  deleteBtn.addEventListener('click', () => deleteConfig(config.id));

  actions.append(editBtn, sendBtn, deleteBtn);
  item.append(info, actions);

  return item;
}

function renderCookies() {
  if (!cookieList) {
    return;
  }

  cookieList.innerHTML = '';
  state.cookies.forEach((cookie) => {
    const item = document.createElement('div');
    item.className =
      'flex items-center justify-between gap-2 rounded-lg bg-base-100 border border-base-300 p-2.5';

    const info = document.createElement('div');
    info.className = 'flex items-center gap-1.5 flex-1 min-w-0';
    info.innerHTML = `
      <span class="font-semibold text-sm truncate">${cookie.label || 'Cookie'}</span>
      <span class="badge badge-xs ${cookie.isActive ? 'badge-soft badge-success' : 'badge-soft badge-neutral'}">${cookie.isActive ? 'active' : 'inactive'}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'flex gap-1 shrink-0';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.className = 'btn btn-xs btn-ghost';
    editBtn.addEventListener('click', () => fillCookieForm(cookie));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Del';
    deleteBtn.className = 'btn btn-xs btn-ghost text-error';
    deleteBtn.addEventListener('click', () => deleteCookie(cookie.id));

    actions.append(editBtn, deleteBtn);
    item.append(info, actions);
    cookieList.appendChild(item);
  });
}

function renderReceipts() {
  if (!receiptList) {
    return;
  }

  receiptList.innerHTML = '';
  const filtered = state.recipients.filter((recipient) => {
    if (state.receiptFilter === 'all') {
      return true;
    }

    const targetType =
      recipient.targetType || inferTargetType(recipient.phoneNumber);
    return targetType === state.receiptFilter;
  });

  filtered.forEach((recipient) => {
    const targetType =
      recipient.targetType || inferTargetType(recipient.phoneNumber);
    const card = document.createElement('div');
    card.className = 'card bg-base-200 shadow-sm';

    const cardBody = document.createElement('div');
    cardBody.className = 'card-body p-3 gap-2';

    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-2';
    header.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 mb-0.5">
          <p class="font-semibold text-sm truncate">${recipient.label || formatJid(recipient.phoneNumber)}</p>
          ${recipient.groupName ? `<span class="badge badge-outline badge-xs opacity-60">${recipient.groupName}</span>` : ''}
          ${recipient.isAdmin ? '<span class="badge badge-xs badge-warning">admin</span>' : ''}
        </div>
        <p class="text-xs text-base-content/40 font-mono break-all">${recipient.phoneNumber}</p>
      </div>
      <div class="flex flex-col items-end gap-1 shrink-0">
        <span class="badge badge-xs ${typeBadgeClass(targetType)}">${typeLabel(targetType)}</span>
        <span class="badge badge-xs ${recipient.enabled ? 'badge-soft badge-success' : 'badge-soft badge-error'}">${recipient.enabled ? 'active' : 'off'}</span>
      </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'flex gap-1.5 pt-1';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.className = 'btn btn-xs btn-ghost flex-1';
    editBtn.addEventListener('click', () => openReceiptModal(recipient));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'btn btn-xs btn-ghost text-error flex-1';
    deleteBtn.addEventListener('click', () => deleteReceipt(recipient.id));

    actions.append(editBtn, deleteBtn);
    cardBody.append(header, actions);
    card.appendChild(cardBody);
    receiptList.appendChild(card);
  });

  if (receiptChip) {
    receiptChip.textContent = `${state.recipients.length} items`;
  }

  const total = state.recipients.length;
  const enabled = state.recipients.filter((item) => item.enabled).length;
  const disabled = total - enabled;
  const totalEl = document.getElementById('receipt-total');
  const enabledEl = document.getElementById('receipt-enabled');
  const disabledEl = document.getElementById('receipt-disabled');
  if (totalEl) {
    totalEl.textContent = String(total);
  }
  if (enabledEl) {
    enabledEl.textContent = String(enabled);
  }
  if (disabledEl) {
    disabledEl.textContent = String(disabled);
  }
}

function inferTargetType(value) {
  if (value?.endsWith('@g.us')) {
    return 'group';
  }

  if (value?.endsWith('@newsletter')) {
    return 'channel';
  }

  if (value?.endsWith('@s.whatsapp.net')) {
    return 'contact';
  }

  return 'manual';
}

function deselectReceiptTargets(exceptInput) {
  if (!receiptTargetsRoot) {
    return;
  }

  receiptTargetsRoot
    .querySelectorAll('input[name="receiptTarget"]')
    .forEach((input) => {
      if (input !== exceptInput) {
        input.checked = false;
      }
    });
}

function updateReceiptManualVisibility() {
  if (!receiptManualRow) {
    return;
  }

  const isManual = Boolean(receiptManualToggle?.checked);
  receiptManualRow.classList.toggle('hidden', !isManual);
}

/**
 * Returns the DaisyUI badge modifier classes for a given recipient target type.
 * Used for both the receipt card list and the modal target selectors.
 */
function typeBadgeClass(type) {
  switch (type) {
    case 'group':
      return 'badge-soft badge-primary';
    case 'contact':
      return 'badge-soft badge-success';
    case 'channel':
      return 'badge-soft badge-warning';
    case 'manual':
      return 'badge-soft badge-info';
    default:
      return 'badge-soft badge-neutral';
  }
}

/** Human-readable label for each target type shown in badges. */
function typeLabel(type) {
  switch (type) {
    case 'group':
      return 'WA Group';
    case 'contact':
      return 'Contact';
    case 'channel':
      return 'Channel';
    case 'manual':
      return 'Manual #';
    default:
      return type;
  }
}

function scheduleTargetModeLabel(mode) {
  switch (mode) {
    case 'group_only':
      return 'Group only';
    case 'personal_only':
      return 'Personal only';
    case 'all':
    default:
      return 'Group + personal';
  }
}

function scheduleTargetModeBadgeClass(mode) {
  switch (mode) {
    case 'group_only':
      return 'badge-soft badge-primary';
    case 'personal_only':
      return 'badge-soft badge-info';
    case 'all':
    default:
      return 'badge-soft badge-secondary';
  }
}

function getSelectedReceiptTarget() {
  if (!receiptTargetsRoot) {
    return null;
  }

  const selected = receiptTargetsRoot.querySelector(
    'input[name="receiptTarget"]:checked',
  );
  if (!(selected instanceof HTMLInputElement)) {
    return null;
  }

  return {
    jid: selected.value,
    type: selected.dataset.type || inferTargetType(selected.value),
  };
}

function setSelectedReceiptTarget(jid) {
  if (!receiptTargetsRoot) {
    return;
  }

  receiptTargetsRoot.querySelectorAll('.option-row').forEach((row) => {
    const input = row.querySelector('input[name="receiptTarget"]');
    if (!(input instanceof HTMLInputElement)) return;
    const checked = input.value === jid;
    input.checked = checked;
    row.classList.toggle('border-primary', checked);
    row.classList.toggle('bg-primary/10', checked);
    row.classList.toggle('border-transparent', !checked);
    const n = row.querySelector('.option-name');
    if (n) {
      n.classList.toggle('text-primary', checked);
      n.classList.toggle('font-semibold', checked);
    }
  });
}

async function openReceiptModal(recipient) {
  if (!receiptModal || !receiptForm) {
    return;
  }

  receiptModalTitle.textContent = 'Memuat targets...';
  if (state.whatsappTargets.length === 0) {
    await loadWhatsappTargets().catch(() => {});
  }
  renderReceiptTargets();

  if (recipient) {
    if (receiptModalTitle) {
      receiptModalTitle.textContent = 'Edit Receipt';
    }
    getField(receiptForm, 'id').value = recipient.id;
    getField(receiptForm, 'label').value = recipient.label || '';
    getField(receiptForm, 'phoneNumber').value = recipient.phoneNumber || '';
    getField(receiptForm, 'enabled').checked = recipient.enabled;
    getField(receiptForm, 'isAdmin').checked = Boolean(recipient.isAdmin);
    if (receiptGroupSelect) {
      receiptGroupSelect.value = recipient.groupId
        ? String(recipient.groupId)
        : '';
    }
    const targetType =
      recipient.targetType || inferTargetType(recipient.phoneNumber);
    if (receiptManualToggle) {
      receiptManualToggle.checked = targetType === 'manual';
    }
    updateReceiptManualVisibility();
    if (targetType !== 'manual') {
      setSelectedReceiptTarget(recipient.phoneNumber || '');
    }
  } else {
    if (receiptModalTitle) {
      receiptModalTitle.textContent = 'Tambah Receipt';
    }
    clearForm(receiptForm);
    if (receiptManualToggle) {
      receiptManualToggle.checked = false;
    }
    if (receiptGroupSelect) {
      receiptGroupSelect.value = '';
    }
    updateReceiptManualVisibility();
    setSelectedReceiptTarget('');
  }

  receiptModal.showModal();
}

function closeReceiptModal() {
  receiptModal?.close();
}

function renderSchedules() {
  if (!scheduleList) {
    return;
  }

  scheduleList.innerHTML = '';
  state.schedules.forEach((schedule) => {
    const item = document.createElement('div');
    item.className =
      'flex items-start justify-between gap-2 rounded-lg bg-base-100 border border-base-300 p-2.5';

    const info = document.createElement('div');
    info.className = 'flex-1 min-w-0';
    info.innerHTML = `
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="font-semibold text-sm">${schedule.name}</span>
        <span class="badge badge-xs ${schedule.enabled ? 'badge-soft badge-success' : 'badge-soft badge-error'}">${schedule.enabled ? 'on' : 'off'}</span>
        <span class="badge badge-xs ${scheduleTargetModeBadgeClass(schedule.targetMode)}">${scheduleTargetModeLabel(schedule.targetMode)}</span>
      </div>
      <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
        <span class="text-xs text-base-content/40">${schedule.groupName || 'ALL groups'}</span>
        <span class="badge badge-xs badge-outline font-mono">${schedule.cron}</span>
      </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'flex gap-1 shrink-0';

    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.textContent = 'Run';
    runBtn.className = 'btn btn-xs btn-secondary';
    runBtn.disabled = !schedule.enabled;
    runBtn.addEventListener('click', async () => {
      try {
        await runSchedule(schedule.id, runBtn);
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : 'Gagal menjalankan schedule.',
        );
      }
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.className = 'btn btn-xs btn-ghost';
    editBtn.addEventListener('click', () => fillScheduleForm(schedule));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Del';
    deleteBtn.className = 'btn btn-xs btn-ghost text-error';
    deleteBtn.addEventListener('click', () => deleteSchedule(schedule.id));

    actions.append(runBtn, editBtn, deleteBtn);
    item.append(info, actions);
    scheduleList.appendChild(item);
  });
}

function fillConfigForm(config) {
  if (!configForm) {
    return;
  }
  getField(configForm, 'id').value = config.id;
  getField(configForm, 'title').value = config.title;
  getField(configForm, 'curlCommand').value = '';
  getField(configForm, 'requestUrl').value = config.requestUrl;
  getField(configForm, 'groupId').value = config.groupId;
  getField(configForm, 'enabled').checked = config.enabled;
}

function fillCookieForm(cookie) {
  if (!cookieForm) {
    return;
  }
  getField(cookieForm, 'id').value = cookie.id;
  getField(cookieForm, 'label').value = cookie.label || '';
  getField(cookieForm, 'value').value = cookie.value;
  getField(cookieForm, 'isActive').checked = cookie.isActive;
}

function fillPrtgSettingsForm(settings = state.prtgSettings) {
  if (!prtgSettingsForm || !settings) {
    return;
  }

  getField(prtgSettingsForm, 'loginUrl').value =
    settings.loginUrl || 'http://prtg.r1net.id/index.htm';
  getField(prtgSettingsForm, 'loginUsername').value =
    settings.loginUsername || '';
  getField(prtgSettingsForm, 'loginPassword').value = '';
  getField(prtgSettingsForm, 'privateMessageTemplate').value =
    settings.privateMessageTemplate ||
    settings.messageTemplate ||
    '{title}\nGroup: {groupname}';
  getField(prtgSettingsForm, 'groupMessageTemplate').value =
    settings.groupMessageTemplate ||
    settings.messageTemplate ||
    '{title}\nGroup: {groupname}';
}

function fillScheduleForm(schedule) {
  if (!scheduleForm) {
    return;
  }
  getField(scheduleForm, 'id').value = schedule.id;
  getField(scheduleForm, 'name').value = schedule.name;
  getField(scheduleForm, 'groupId').value = schedule.groupId ?? '';
  getField(scheduleForm, 'cron').value = schedule.cron;
  getField(scheduleForm, 'targetMode').value = schedule.targetMode || 'all';
  getField(scheduleForm, 'enabled').checked = schedule.enabled;
}

function clearForm(form) {
  if (!form) {
    return;
  }

  form.reset();
  const idField = getField(form, 'id');
  if (idField) {
    idField.value = '';
  }
}

async function saveConfig(payload) {
  if (payload.id) {
    await apiFetch(`/api/prtg/configs/${payload.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else {
    await apiFetch('/api/prtg/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  await loadPrtgData();
}

async function deleteConfig(id) {
  await apiFetch(`/api/prtg/configs/${id}`, { method: 'DELETE' });
  await loadPrtgData();
}

async function sendConfig(id) {
  await apiFetch(`/api/prtg/configs/${id}/send`, { method: 'POST' });
  pushActivity(`PRTG config ${id} sent`, 'sent');
}

async function saveCookie(payload) {
  if (payload.id) {
    await apiFetch(`/api/prtg/cookies/${payload.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else {
    await apiFetch('/api/prtg/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  await loadPrtgData();
}

async function deleteCookie(id) {
  await apiFetch(`/api/prtg/cookies/${id}`, { method: 'DELETE' });
  await loadPrtgData();
}

async function savePrtgSettings(payload) {
  await apiFetch('/api/prtg/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  await loadPrtgData();
}

async function saveReceipt(payload) {
  if (payload.id) {
    await apiFetch(`/api/prtg/recipients/${payload.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else {
    await apiFetch('/api/prtg/recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  await loadPrtgData();
}

async function deleteReceipt(id) {
  await apiFetch(`/api/prtg/recipients/${id}`, { method: 'DELETE' });
  await loadPrtgData();
}

async function lookupChannel(key) {
  if (!key) {
    return;
  }

  const response = await apiFetch(
    `/api/whatsapp/channels/metadata?key=${encodeURIComponent(key)}`,
  );
  const target = await response.json();
  const existingIndex = state.whatsappTargets.findIndex(
    (item) => item.jid === target.jid,
  );
  if (existingIndex >= 0) {
    state.whatsappTargets[existingIndex] = target;
  } else {
    state.whatsappTargets.push(target);
  }

  renderReceiptTargets();
  setSelectedReceiptTarget(target.jid);
  if (receiptForm) {
    getField(receiptForm, 'phoneNumber').value = target.jid;
    if (!getField(receiptForm, 'label').value.trim()) {
      getField(receiptForm, 'label').value = target.label;
    }
  }
}

async function saveSchedule(payload) {
  if (payload.id) {
    await apiFetch(`/api/prtg/schedules/${payload.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else {
    await apiFetch('/api/prtg/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  await loadPrtgData();
}

async function deleteSchedule(id) {
  await apiFetch(`/api/prtg/schedules/${id}`, { method: 'DELETE' });
  await loadPrtgData();
}

function formatScheduleRunResult(result) {
  if (Array.isArray(result)) {
    const sentConfigs = result.reduce(
      (total, item) => total + (item.result?.sentConfigs || 0),
      0,
    );
    const sentRecipients = result.reduce(
      (total, item) => total + (item.result?.sentRecipients || 0),
      0,
    );
    return `${result.length} schedule, ${sentConfigs} config, ${sentRecipients} receipt terkirim.`;
  }

  return `${result.scheduleName}: ${result.result?.sentConfigs || 0} config, ${result.result?.sentRecipients || 0} receipt terkirim.`;
}

async function runSchedule(id, button) {
  if (!id) {
    return;
  }

  const originalText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = 'Running';
  }

  try {
    const response = await apiFetch(`/api/prtg/schedules/${id}/run`, {
      method: 'POST',
    });
    const result = await response.json();
    pushActivity(`Schedule ${id} dispatched`, 'sent');
    showToast(formatScheduleRunResult(result), 'success');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || 'Run';
    }
  }
}

async function runEnabledSchedules(button) {
  const originalText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = 'Running';
  }

  try {
    const response = await apiFetch('/api/prtg/schedules/run-enabled', {
      method: 'POST',
    });
    const result = await response.json();
    pushActivity('Enabled schedules dispatched', 'sent');
    showToast(formatScheduleRunResult(result), 'success');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || 'Run Enabled';
    }
  }
}

async function sendGroup(id) {
  if (!id) {
    return;
  }

  await apiFetch(`/api/prtg/groups/${encodeURIComponent(id)}/send`, {
    method: 'POST',
  });
  pushActivity(`PRTG group ${id} sent`, 'sent');
}

async function saveGroup(payload) {
  if (payload.id) {
    await apiFetch(`/api/prtg/groups/${payload.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else {
    await apiFetch('/api/prtg/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  await loadPrtgData();
}

async function saveAccount(payload) {
  const response = await apiFetch('/api/auth/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  state.token = data.token;
  state.accountUser = data.user;

  const rememberMe =
    Boolean(localStorage.getItem('auth_token')) ||
    Boolean(localStorage.getItem('login_username'));
  storeAuthToken(data.token, rememberMe);
  storeRememberedUsername(data.user.username, rememberMe);
  fillAccountForm();
}

async function toggleGroupEnabled(id, enabled) {
  const group = state.groups.find((item) => item.id === id);
  if (!group) {
    return;
  }

  await saveGroup({
    id,
    name: group.name,
    enabled,
  });
  pushActivity(
    `PRTG group ${group.name} ${enabled ? 'enabled' : 'disabled'}`,
    'status',
  );
}

async function deleteGroup(id) {
  await apiFetch(`/api/prtg/groups/${id}`, { method: 'DELETE' });
  await loadPrtgData();
}

function fillGroupForm(group) {
  if (!groupForm) {
    return;
  }
  getField(groupForm, 'id').value = group.id;
  getField(groupForm, 'name').value = group.name;
  getField(groupForm, 'enabled').checked = group.enabled;
}

function connectStream() {
  if (!state.token) {
    return;
  }

  if (state.eventSource) {
    state.eventSource.close();
  }

  const streamUrl = `/api/whatsapp/stream?token=${encodeURIComponent(state.token)}`;
  state.eventSource = new EventSource(streamUrl);

  state.eventSource.onmessage = (event) => {
    try {
      const status = JSON.parse(event.data);
      updateStatus(status, 'Realtime update');
    } catch (error) {
      pushActivity('Realtime update parse failed', 'error');
    }
  };

  state.eventSource.onerror = () => {
    pushActivity('Realtime stream reconnecting', 'connecting');
  };
}

function handleLogout() {
  clearStoredToken();
  state.token = null;
  state.accountUser = null;
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  showLogin();
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = formData.get('username');
  const password = formData.get('password');
  const rememberMe = formData.get('rememberMe') === 'on';

  if (typeof username !== 'string' || typeof password !== 'string') {
    setLoginError('Missing username or password.');
    return;
  }

  try {
    await login(username, password);
    storeAuthToken(state.token, rememberMe);
    storeRememberedUsername(username.trim(), rememberMe);
    showApp();
    initRouter();
    connectStream();
  } catch (error) {
    setLoginError('Invalid username or password.');
  }
});

logoutBtn?.addEventListener('click', () => {
  handleLogout();
});

logoutMobileBtn?.addEventListener('click', () => {
  handleLogout();
});

accountForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setAccountMessage('');

  const username = getField(accountForm, 'username').value.trim();
  const currentPassword = getField(accountForm, 'currentPassword').value.trim();
  const newPassword = getField(accountForm, 'newPassword').value.trim();

  if (!username || !currentPassword) {
    setAccountMessage('Username dan current password wajib diisi.', 'error');
    return;
  }

  try {
    await saveAccount({
      username,
      currentPassword,
      ...(newPassword ? { newPassword } : {}),
    });
    setAccountMessage('Account updated.', 'success');
  } catch (error) {
    setAccountMessage('Account update failed.', 'error');
  }
});

navItems.forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const view = item.dataset.view;
    if (view) {
      setActiveView(view);
    }
  });
});

configForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    id: getField(configForm, 'id').value
      ? Number(getField(configForm, 'id').value)
      : null,
    title: getField(configForm, 'title').value.trim(),
    curlCommand: getField(configForm, 'curlCommand').value.trim(),
    requestUrl: getField(configForm, 'requestUrl').value.trim(),
    groupId: Number(getField(configForm, 'groupId').value),
    enabled: getField(configForm, 'enabled').checked,
  };

  try {
    await saveConfig(payload);
    clearForm(configForm);
    showToast('Config berhasil disimpan.', 'success');
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Gagal menyimpan config.',
    );
  }
});

configClear?.addEventListener('click', () => clearForm(configForm));

cookieForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    id: getField(cookieForm, 'id').value
      ? Number(getField(cookieForm, 'id').value)
      : null,
    label: getField(cookieForm, 'label').value.trim(),
    value: getField(cookieForm, 'value').value.trim(),
    isActive: getField(cookieForm, 'isActive').checked,
  };

  try {
    await saveCookie(payload);
    clearForm(cookieForm);
    showToast('Cookie berhasil disimpan.', 'success');
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Gagal menyimpan cookie.',
    );
  }
});

cookieClear?.addEventListener('click', () => clearForm(cookieForm));

prtgSettingsForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = getField(prtgSettingsForm, 'loginPassword').value;
  const payload = {
    loginUrl: getField(prtgSettingsForm, 'loginUrl').value.trim(),
    loginUsername: getField(prtgSettingsForm, 'loginUsername').value.trim(),
    privateMessageTemplate: getField(
      prtgSettingsForm,
      'privateMessageTemplate',
    ).value.trim(),
    groupMessageTemplate: getField(
      prtgSettingsForm,
      'groupMessageTemplate',
    ).value.trim(),
  };

  if (password.trim()) {
    payload.loginPassword = password.trim();
  }

  try {
    await savePrtgSettings(payload);
    pushActivity('PRTG automation settings saved', 'saved');
    showToast('Automation settings berhasil disimpan.', 'success');
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Gagal menyimpan settings.',
    );
  }
});

prtgSettingsClear?.addEventListener('click', () => {
  fillPrtgSettingsForm();
});

receiptAddBtn?.addEventListener('click', () => {
  openReceiptModal(null);
});

receiptModalClose?.addEventListener('click', () => closeReceiptModal());

// Clean up form state whenever the dialog closes (any means: button, backdrop, Escape)
receiptModal?.addEventListener('close', () => {
  if (receiptForm) clearForm(receiptForm);
  setSelectedReceiptTarget('');
  if (receiptManualToggle) receiptManualToggle.checked = false;
  updateReceiptManualVisibility();
});

receiptForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const manualInput = getField(receiptForm, 'phoneNumber').value.trim();
  const manualSelected = Boolean(receiptManualToggle?.checked);
  const selectedTarget = getSelectedReceiptTarget();
  const phoneNumber = manualSelected ? manualInput : selectedTarget?.jid || '';
  const targetType = manualSelected
    ? 'manual'
    : selectedTarget?.type || inferTargetType(phoneNumber);

  if (!phoneNumber) {
    pushActivity('Receipt target is required.', 'error');
    return;
  }

  const payload = {
    id: getField(receiptForm, 'id').value
      ? Number(getField(receiptForm, 'id').value)
      : null,
    label: getField(receiptForm, 'label').value.trim(),
    phoneNumber,
    targetType,
    enabled: getField(receiptForm, 'enabled').checked,
    isAdmin: getField(receiptForm, 'isAdmin').checked,
    groupId: receiptGroupSelect?.value
      ? Number(receiptGroupSelect.value)
      : null,
  };

  try {
    await saveReceipt(payload);
    closeReceiptModal();
    showToast('Receipt berhasil disimpan.', 'success');
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Gagal menyimpan receipt.',
    );
  }
});

receiptClear?.addEventListener('click', () => clearForm(receiptForm));

receiptManualToggle?.addEventListener('change', () => {
  if (receiptManualToggle.checked) {
    deselectReceiptTargets(receiptManualToggle);
  }
  updateReceiptManualVisibility();
});

receiptChannelBtn?.addEventListener('click', async () => {
  try {
    await lookupChannel(receiptChannelInput?.value.trim());
  } catch (error) {
    pushActivity('Channel lookup failed', 'error');
  }
});

receiptFilter?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const filter = target.dataset.filter;
  if (!filter) {
    return;
  }

  state.receiptFilter = filter;
  renderReceipts();
  receiptFilter.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('btn-active', button.dataset.filter === filter);
  });
});

scheduleForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const groupIdVal = getField(scheduleForm, 'groupId').value;
  const payload = {
    id: getField(scheduleForm, 'id').value
      ? Number(getField(scheduleForm, 'id').value)
      : null,
    name: getField(scheduleForm, 'name').value.trim(),
    groupId: groupIdVal ? Number(groupIdVal) : null,
    cron: getField(scheduleForm, 'cron').value.trim(),
    targetMode: getField(scheduleForm, 'targetMode').value,
    enabled: getField(scheduleForm, 'enabled').checked,
  };

  try {
    await saveSchedule(payload);
    clearForm(scheduleForm);
    showToast('Schedule berhasil disimpan.', 'success');
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Gagal menyimpan schedule.',
    );
  }
});

scheduleClear?.addEventListener('click', () => clearForm(scheduleForm));

scheduleRunEnabledBtn?.addEventListener('click', async () => {
  try {
    await runEnabledSchedules(scheduleRunEnabledBtn);
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Gagal menjalankan schedule.',
    );
  }
});

groupSendBtn?.addEventListener('click', async () => {
  const id = groupSendSelect?.value || 'ALL';
  try {
    await sendGroup(id);
    showToast(
      `Group ${id === 'ALL' ? 'semua' : id} berhasil dikirim.`,
      'success',
    );
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Gagal mengirim group.');
  }
});

groupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    id: getField(groupForm, 'id').value
      ? Number(getField(groupForm, 'id').value)
      : null,
    name: getField(groupForm, 'name').value.trim(),
    enabled: getField(groupForm, 'enabled').checked,
  };
  try {
    await saveGroup(payload);
    clearForm(groupForm);
    showToast('Group berhasil disimpan.', 'success');
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Gagal menyimpan group.',
    );
  }
});

groupFormClear?.addEventListener('click', () => clearForm(groupForm));

if (state.token) {
  showApp();
  initRouter();
  connectStream();
} else {
  showLogin();
}

if (receiptFilter) {
  receiptFilter.querySelectorAll('button').forEach((button) => {
    button.classList.toggle(
      'btn-active',
      button.dataset.filter === state.receiptFilter,
    );
  });
}

updateReceiptManualVisibility();
