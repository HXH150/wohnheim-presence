(function () {
  // Base URL of the Supabase Edge Functions (backend). Set
  // window.WOHNHEIM_FUNCTIONS_BASE before this script runs to point at your
  // deployed Supabase project; defaults to the local `supabase functions serve` URL.
  const API_BASE = window.WOHNHEIM_FUNCTIONS_BASE || 'http://localhost:54321/functions/v1';
  const STORAGE_KEY = 'wohnheim_admin_password';
  const STORAGE_KEY_USERNAME = 'wohnheim_admin_username';

  let rooms = [];
  let activeFilter = 'all';
  let searchTerm = '';
  let currentPage = 1;
  const PAGE_SIZE = 30;

  const el = {
    loginWrap: document.getElementById('login-wrap'),
    dashboard: document.getElementById('dashboard'),
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    loginBtn: document.getElementById('login-btn'),
    loginError: document.getElementById('login-error'),
    periodLabel: document.getElementById('period-label'),
    sectionTitle: document.getElementById('section-title'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanels: document.querySelectorAll('.tab-panel'),
    kpiTotal: document.getElementById('kpi-total'),
    kpiOk: document.getElementById('kpi-ok'),
    kpiWarn: document.getElementById('kpi-warn'),
    kpiDanger: document.getElementById('kpi-danger'),
    roomRows: document.getElementById('room-rows'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    btnAddRoom: document.getElementById('btn-add-room'),
    addRoomModal: document.getElementById('add-room-modal'),
    newRoomNumber: document.getElementById('new-room-number'),
    addRoomCancel: document.getElementById('add-room-cancel'),
    addRoomConfirm: document.getElementById('add-room-confirm'),
    qrModal: document.getElementById('qr-modal'),
    qrModalTitle: document.getElementById('qr-modal-title'),
    qrModalImg: document.getElementById('qr-modal-img'),
    qrModalClose: document.getElementById('qr-modal-close'),
    qrModalDownload: document.getElementById('qr-modal-download'),
    btnDownloadAllQr: document.getElementById('btn-download-all-qr'),
    btnBulkAddRoom: document.getElementById('btn-bulk-add-room'),
    bulkAddRoomModal: document.getElementById('bulk-add-room-modal'),
    bulkRoomInput: document.getElementById('bulk-room-input'),
    bulkRoomPreview: document.getElementById('bulk-room-preview'),
    bulkRoomProgress: document.getElementById('bulk-room-progress'),
    bulkRoomResult: document.getElementById('bulk-room-result'),
    bulkAddRoomCancel: document.getElementById('bulk-add-room-cancel'),
    bulkAddRoomConfirm: document.getElementById('bulk-add-room-confirm'),
    roomSearch: document.getElementById('room-search'),
    paginationRow: document.getElementById('pagination-row'),
    pagePrev: document.getElementById('page-prev'),
    pageNext: document.getElementById('page-next'),
    pageInfo: document.getElementById('page-info'),
    reportMonth: document.getElementById('report-month'),
    btnExportXlsx: document.getElementById('btn-export-xlsx'),
    btnExportPdf: document.getElementById('btn-export-pdf'),
    adminList: document.getElementById('admin-list'),
    btnAddAdmin: document.getElementById('btn-add-admin'),
    addAdminModal: document.getElementById('add-admin-modal'),
    newAdminUsername: document.getElementById('new-admin-username'),
    newAdminPassword: document.getElementById('new-admin-password'),
    addAdminError: document.getElementById('add-admin-error'),
    addAdminCancel: document.getElementById('add-admin-cancel'),
    addAdminConfirm: document.getElementById('add-admin-confirm'),
  };

  function adminUsername() {
    return sessionStorage.getItem(STORAGE_KEY_USERNAME);
  }

  function adminPassword() {
    return sessionStorage.getItem(STORAGE_KEY);
  }

  function authHeaders() {
    return { 'x-admin-username': adminUsername(), 'x-admin-password': adminPassword() };
  }

  function statusLabel(status) {
    if (status === 'ok') return { text: 'Bestätigt', cls: 'ok' };
    if (status === 'warn') return { text: 'Ausstehend', cls: 'warn' };
    if (status === 'blocked') return { text: 'Gesperrt', cls: 'blocked' };
    return { text: 'Ausgezogen', cls: 'danger' };
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function daysLabel(days) {
    if (days === null || days === undefined) return '—';
    if (days === 0) return 'Heute';
    return `${days} Tage`;
  }

  function daysColor(status, days) {
    if (status === 'danger') return 'var(--danger)';
    if (status === 'warn') return 'var(--warn)';
    return 'var(--ok)';
  }

  async function login() {
    const username = el.loginUsername.value.trim();
    const password = el.loginPassword.value;
    el.loginError.style.display = 'none';
    el.loginBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error('bad credentials');

      sessionStorage.setItem(STORAGE_KEY_USERNAME, username);
      sessionStorage.setItem(STORAGE_KEY, password);
      el.loginWrap.style.display = 'none';
      el.dashboard.style.display = 'block';
      loadRooms();
      loadAdmins();
    } catch (err) {
      el.loginError.style.display = 'block';
    } finally {
      el.loginBtn.disabled = false;
    }
  }

  el.loginBtn.addEventListener('click', login);
  el.loginUsername.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });
  el.loginPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });

  const TAB_TITLES = { rooms: 'Zimmer-Übersicht', settings: 'Einstellungen' };

  el.tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      el.tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
      el.tabPanels.forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
      el.sectionTitle.textContent = TAB_TITLES[tab] || '';
    });
  });

  function setPeriodLabel() {
    const now = new Date();
    const label = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(now);
    el.periodLabel.textContent = `📅 ${label}`;
  }

  async function loadRooms() {
    setPeriodLabel();
    const res = await fetch(`${API_BASE}/rooms`, { headers: authHeaders() });
    if (res.status === 401) {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY_USERNAME);
      el.dashboard.style.display = 'none';
      el.loginWrap.style.display = 'flex';
      return;
    }
    if (!res.ok) {
      rooms = [];
      renderKpis();
      el.roomRows.innerHTML = '<div class="empty-state">Zimmer konnten nicht geladen werden. Ist das Supabase-Schema eingerichtet?</div>';
      return;
    }
    rooms = await res.json();
    renderKpis();
    renderRows();
  }

  function renderKpis() {
    el.kpiTotal.textContent = rooms.length;
    el.kpiOk.textContent = rooms.filter((r) => r.status === 'ok').length;
    el.kpiWarn.textContent = rooms.filter((r) => r.status === 'warn').length;
    el.kpiDanger.textContent = rooms.filter((r) => r.status === 'danger').length;
  }

  function renderRows() {
    let filtered = activeFilter === 'all' ? rooms : rooms.filter((r) => r.status === activeFilter);
    if (searchTerm) {
      const needle = searchTerm.toLowerCase();
      filtered = filtered.filter((r) => r.room_number.toLowerCase().includes(needle));
    }

    if (filtered.length === 0) {
      el.roomRows.innerHTML = '<div class="empty-state">Keine Zimmer gefunden.</div>';
      el.paginationRow.style.display = 'none';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRooms = filtered.slice(start, start + PAGE_SIZE);

    el.paginationRow.style.display = totalPages > 1 ? 'flex' : 'none';
    const rangeEnd = Math.min(start + PAGE_SIZE, filtered.length);
    el.pageInfo.textContent = `Zimmer ${start + 1}–${rangeEnd} von ${filtered.length}`;
    el.pagePrev.disabled = currentPage <= 1;
    el.pageNext.disabled = currentPage >= totalPages;

    el.roomRows.innerHTML = pageRooms.map((room) => {
      const label = statusLabel(room.status);
      const overdue = room.days_since !== null && room.days_since >= 30;
      // "Abrechnung stoppen" only makes sense for a still-active room that's
      // overdue. A room already marked vacant (status "danger") keeps the QR
      // button — the Hausverwalter may need to reprint it for a new Bewohner.
      const actionBtn = room.status === 'warn' && overdue
        ? `<button class="action-btn red" data-action="stop-billing" data-id="${room.id}">Abrechnung stoppen</button>`
        : `<button class="action-btn" data-action="qr" data-token="${room.token}" data-room="${room.room_number}">QR</button>`;

      const lastConfirmedCell = room.raw_status === 'vacant'
        ? `Ausgezogen am ${formatDate(room.status_changed_at)}`
        : formatDate(room.last_confirmation);

      return `
        <div class="room-row" data-status="${room.status}">
          <div class="room-num">Zi. ${room.room_number}</div>
          <div>
            <span class="status-pill ${label.cls}">${label.text}</span>
            <select class="status-select" data-id="${room.id}">
              <option value="active" ${room.raw_status === 'active' ? 'selected' : ''}>Aktiv</option>
              <option value="vacant" ${room.raw_status === 'vacant' ? 'selected' : ''}>Ausgezogen</option>
              <option value="blocked" ${room.raw_status === 'blocked' ? 'selected' : ''}>Gesperrt</option>
            </select>
          </div>
          <div style="color:var(--ink-soft)">${lastConfirmedCell}</div>
          <div style="color:${daysColor(room.status, room.days_since)};font-weight:700">${daysLabel(room.days_since)}</div>
          <div>${actionBtn}</div>
        </div>`;
    }).join('');
  }

  el.roomRows.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'qr') {
      openQrModal(btn.dataset.token, btn.dataset.room);
    } else if (btn.dataset.action === 'stop-billing') {
      if (!window.confirm('Abrechnung für dieses Zimmer wirklich stoppen? Das Zimmer wird als ausgezogen markiert.')) return;
      const res = await fetch(`${API_BASE}/rooms/${btn.dataset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status: 'vacant' }),
      });
      if (res.ok) {
        loadRooms();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(`Abrechnung stoppen fehlgeschlagen: ${body.error || `HTTP ${res.status}`}`);
      }
    }
  });

  el.roomRows.addEventListener('change', async (e) => {
    const select = e.target.closest('select.status-select');
    if (!select) return;

    const newStatus = select.value;
    select.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/rooms/${select.dataset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        loadRooms();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(`Status ändern fehlgeschlagen: ${body.error || `HTTP ${res.status}`}`);
        select.disabled = false;
      }
    } catch (err) {
      alert(`Status ändern fehlgeschlagen: ${err.message}`);
      select.disabled = false;
    }
  });

  el.filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      el.filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      currentPage = 1;
      renderRows();
    });
  });

  el.roomSearch.addEventListener('input', () => {
    searchTerm = el.roomSearch.value.trim();
    currentPage = 1;
    renderRows();
  });

  el.pagePrev.addEventListener('click', () => {
    currentPage--;
    renderRows();
    el.roomRows.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  el.pageNext.addEventListener('click', () => {
    currentPage++;
    renderRows();
    el.roomRows.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function openQrModal(token, roomNumber) {
    el.qrModalTitle.textContent = `Zimmer ${roomNumber}`;
    el.qrModalImg.src = `${API_BASE}/qr/${token}`;
    el.qrModalDownload.dataset.token = token;
    el.qrModalDownload.dataset.room = roomNumber;
    el.qrModal.classList.add('active');
  }

  el.qrModalClose.addEventListener('click', () => el.qrModal.classList.remove('active'));
  el.qrModal.addEventListener('click', (e) => {
    if (e.target === el.qrModal) el.qrModal.classList.remove('active');
  });

  el.qrModalDownload.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = `${API_BASE}/qr/${el.qrModalDownload.dataset.token}`;
    a.download = `zimmer-${el.qrModalDownload.dataset.room}-qr.svg`;
    a.click();
  });

  el.btnAddRoom.addEventListener('click', () => {
    el.newRoomNumber.value = '';
    el.addRoomModal.classList.add('active');
    el.newRoomNumber.focus();
  });

  el.addRoomCancel.addEventListener('click', () => el.addRoomModal.classList.remove('active'));
  el.addRoomModal.addEventListener('click', (e) => {
    if (e.target === el.addRoomModal) el.addRoomModal.classList.remove('active');
  });

  el.addRoomConfirm.addEventListener('click', async () => {
    const room_number = el.newRoomNumber.value.trim();
    if (!room_number) return;

    const res = await fetch(`${API_BASE}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ room_number }),
    });

    if (res.ok) {
      el.addRoomModal.classList.remove('active');
      loadRooms();
    }
  });

  // --- Bulk room creation ---
  // Accepts either a single-line range ("Zimmer 1 bis Zimmer 20", "Zimmer 1 to
  // Zimmer 20", "Zimmer 1-20") or a newline/comma-separated list of room names.
  function parseRoomNames(rawText) {
    const text = rawText.trim();
    if (!text) return [];

    if (!text.includes('\n')) {
      const rangeMatch = text.match(/^([^\d]*)(\d+)\s*(?:bis|to|-|–)\s*(?:\1)?\s*(\d+)[^\d]*$/i);
      if (rangeMatch) {
        const prefix = rangeMatch[1];
        let start = parseInt(rangeMatch[2], 10);
        let end = parseInt(rangeMatch[3], 10);
        if (start > end) [start, end] = [end, start];
        const names = [];
        for (let n = start; n <= end; n++) {
          names.push(`${prefix}${n}`.trim());
        }
        return names;
      }
    }

    return text
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function updateBulkPreview() {
    const names = parseRoomNames(el.bulkRoomInput.value);
    if (names.length === 0) {
      el.bulkRoomPreview.textContent = '';
    } else if (names.length === 1) {
      el.bulkRoomPreview.textContent = `1 Zimmer wird erstellt: ${names[0]}`;
    } else {
      const preview = names.slice(0, 3).join(', ');
      const more = names.length > 3 ? ` … (${names.length} insgesamt)` : '';
      el.bulkRoomPreview.textContent = `${names.length} Zimmer werden erstellt: ${preview}${more}`;
    }
  }

  el.bulkRoomInput.addEventListener('input', updateBulkPreview);

  el.btnBulkAddRoom.addEventListener('click', () => {
    el.bulkRoomInput.value = '';
    el.bulkRoomPreview.textContent = '';
    el.bulkRoomProgress.style.display = 'none';
    el.bulkRoomResult.style.display = 'none';
    el.bulkAddRoomModal.classList.add('active');
    el.bulkRoomInput.focus();
  });

  el.bulkAddRoomCancel.addEventListener('click', () => {
    el.bulkAddRoomModal.classList.remove('active');
  });

  el.bulkAddRoomConfirm.addEventListener('click', async () => {
    const names = parseRoomNames(el.bulkRoomInput.value);
    if (names.length === 0) return;

    if (names.length > 500) {
      alert('Bitte maximal 500 Zimmer auf einmal erstellen.');
      return;
    }
    if (names.length > 50 && !window.confirm(`${names.length} Zimmer werden erstellt. Fortfahren?`)) {
      return;
    }

    el.bulkAddRoomConfirm.disabled = true;
    el.bulkAddRoomCancel.disabled = true;
    el.bulkRoomResult.style.display = 'none';
    el.bulkRoomProgress.style.display = 'block';

    let erfolgreich = 0;
    const fehlgeschlagen = [];

    for (let i = 0; i < names.length; i++) {
      el.bulkRoomProgress.textContent = `${i + 1} von ${names.length} wird erstellt...`;
      try {
        const res = await fetch(`${API_BASE}/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ room_number: names[i] }),
        });
        if (res.ok) {
          erfolgreich++;
        } else {
          const body = await res.json().catch(() => ({}));
          fehlgeschlagen.push({ name: names[i], fehler: body.error || `HTTP ${res.status}` });
        }
      } catch (err) {
        fehlgeschlagen.push({ name: names[i], fehler: err.message });
      }
    }

    el.bulkRoomProgress.style.display = 'none';
    el.bulkRoomResult.style.display = 'block';
    let resultHtml = `<strong style="color:var(--ok)">${erfolgreich} von ${names.length} Zimmer erstellt.</strong>`;
    if (fehlgeschlagen.length > 0) {
      resultHtml += `<div style="color:var(--danger);margin-top:6px;">${fehlgeschlagen.length} fehlgeschlagen:</div>`;
      resultHtml += '<ul style="margin:4px 0 0 18px;color:var(--danger);font-size:12px;">';
      resultHtml += fehlgeschlagen.map((f) => `<li>${f.name}: ${f.fehler}</li>`).join('');
      resultHtml += '</ul>';
    }
    el.bulkRoomResult.innerHTML = resultHtml;

    el.bulkAddRoomConfirm.disabled = false;
    el.bulkAddRoomCancel.disabled = false;
    el.bulkRoomInput.value = '';
    el.bulkRoomPreview.textContent = '';

    if (erfolgreich > 0) loadRooms();
  });

  el.btnDownloadAllQr.addEventListener('click', async () => {
    el.btnDownloadAllQr.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/qr/all/pdf`, { headers: authHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`QR-Export fehlgeschlagen: ${body.error || `HTTP ${res.status}`}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qr-codes.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`QR-Export fehlgeschlagen: ${err.message}`);
    } finally {
      el.btnDownloadAllQr.disabled = false;
    }
  });

  // --- Admin account management ---

  async function loadAdmins() {
    const res = await fetch(`${API_BASE}/admins`, { headers: authHeaders() });
    if (!res.ok) {
      el.adminList.innerHTML = '<div class="empty-state">Admins konnten nicht geladen werden.</div>';
      return;
    }
    const admins = await res.json();
    renderAdminList(admins);
  }

  function renderAdminList(admins) {
    if (admins.length === 0) {
      el.adminList.innerHTML = '<div class="empty-state">Keine Admins gefunden.</div>';
      return;
    }
    const canDelete = admins.length > 1;
    el.adminList.innerHTML = admins.map((admin) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);">
        <span style="font-weight:600;font-size:13px;">${escapeHtml(admin.username)}</span>
        <button
          class="action-btn red"
          data-action="delete-admin"
          data-id="${admin.id}"
          data-username="${escapeHtml(admin.username)}"
          ${canDelete ? '' : 'disabled title="Der letzte Admin kann nicht gelöscht werden"'}
        >Löschen</button>
      </div>`).join('');
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  el.adminList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action="delete-admin"]');
    if (!btn || btn.disabled) return;

    if (!window.confirm(`Admin „${btn.dataset.username}“ wirklich löschen?`)) return;

    const res = await fetch(`${API_BASE}/admins/${btn.dataset.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.ok) {
      loadAdmins();
    } else {
      const body = await res.json().catch(() => ({}));
      alert(`Admin löschen fehlgeschlagen: ${body.error || `HTTP ${res.status}`}`);
    }
  });

  el.btnAddAdmin.addEventListener('click', () => {
    el.newAdminUsername.value = '';
    el.newAdminPassword.value = '';
    el.addAdminError.style.display = 'none';
    el.addAdminModal.classList.add('active');
    el.newAdminUsername.focus();
  });

  el.addAdminCancel.addEventListener('click', () => el.addAdminModal.classList.remove('active'));
  el.addAdminModal.addEventListener('click', (e) => {
    if (e.target === el.addAdminModal) el.addAdminModal.classList.remove('active');
  });

  el.addAdminConfirm.addEventListener('click', async () => {
    const username = el.newAdminUsername.value.trim();
    const password = el.newAdminPassword.value;
    el.addAdminError.style.display = 'none';
    if (!username || !password) return;

    el.addAdminConfirm.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        el.addAdminModal.classList.remove('active');
        loadAdmins();
      } else {
        el.addAdminError.textContent = body.error || `HTTP ${res.status}`;
        el.addAdminError.style.display = 'block';
      }
    } finally {
      el.addAdminConfirm.disabled = false;
    }
  });

  // --- Monthly report export ---

  function currentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  el.reportMonth.value = currentMonthValue();

  async function downloadReport(kind, button, filename) {
    const month = el.reportMonth.value;
    if (!month) {
      alert('Bitte einen Monat auswählen.');
      return;
    }
    button.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/reports/${kind}?month=${encodeURIComponent(month)}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Export fehlgeschlagen: ${body.error || `HTTP ${res.status}`}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}-${month}.${kind}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export fehlgeschlagen: ${err.message}`);
    } finally {
      button.disabled = false;
    }
  }

  el.btnExportXlsx.addEventListener('click', () => downloadReport('xlsx', el.btnExportXlsx, 'bericht'));
  el.btnExportPdf.addEventListener('click', () => downloadReport('pdf', el.btnExportPdf, 'bericht'));

  // Resume session if credentials already verified this tab
  if (adminUsername() && adminPassword()) {
    el.loginWrap.style.display = 'none';
    el.dashboard.style.display = 'block';
    loadRooms();
    loadAdmins();
  }
})();
