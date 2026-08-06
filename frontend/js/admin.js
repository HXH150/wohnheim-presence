(function () {
  // Base URL of the Supabase Edge Functions (backend). Set
  // window.WOHNHEIM_FUNCTIONS_BASE before this script runs to point at your
  // deployed Supabase project; defaults to the local `supabase functions serve` URL.
  const API_BASE = window.WOHNHEIM_FUNCTIONS_BASE || 'http://localhost:54321/functions/v1';
  const STORAGE_KEY = 'wohnheim_admin_password';

  let rooms = [];
  let activeFilter = 'all';

  const el = {
    loginWrap: document.getElementById('login-wrap'),
    dashboard: document.getElementById('dashboard'),
    loginPassword: document.getElementById('login-password'),
    loginBtn: document.getElementById('login-btn'),
    loginError: document.getElementById('login-error'),
    periodLabel: document.getElementById('period-label'),
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
  };

  function adminPassword() {
    return sessionStorage.getItem(STORAGE_KEY);
  }

  function authHeaders() {
    return { 'x-admin-password': adminPassword() };
  }

  function statusLabel(status) {
    if (status === 'ok') return { text: 'Bestätigt', cls: 'ok' };
    if (status === 'warn') return { text: 'Ausstehend', cls: 'warn' };
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
    const password = el.loginPassword.value;
    el.loginError.style.display = 'none';
    el.loginBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error('bad password');

      sessionStorage.setItem(STORAGE_KEY, password);
      el.loginWrap.style.display = 'none';
      el.dashboard.style.display = 'block';
      loadRooms();
    } catch (err) {
      el.loginError.style.display = 'block';
    } finally {
      el.loginBtn.disabled = false;
    }
  }

  el.loginBtn.addEventListener('click', login);
  el.loginPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
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
    const filtered = activeFilter === 'all' ? rooms : rooms.filter((r) => r.status === activeFilter);

    if (filtered.length === 0) {
      el.roomRows.innerHTML = '<div class="empty-state">Keine Zimmer gefunden.</div>';
      return;
    }

    el.roomRows.innerHTML = filtered.map((room) => {
      const label = statusLabel(room.status);
      const overdue = room.days_since !== null && room.days_since >= 30;
      // "Abrechnung stoppen" only makes sense for a still-active room that's
      // overdue. A room already marked vacant (status "danger") keeps the QR
      // button — the Hausverwalter may need to reprint it for a new Bewohner.
      const actionBtn = room.status === 'warn' && overdue
        ? `<button class="action-btn red" data-action="stop-billing" data-id="${room.id}">Abrechnung stoppen</button>`
        : `<button class="action-btn" data-action="qr" data-token="${room.token}" data-room="${room.room_number}">QR</button>`;

      return `
        <div class="room-row" data-status="${room.status}">
          <div class="room-num">Zi. ${room.room_number}</div>
          <div><span class="status-pill ${label.cls}">${label.text}</span></div>
          <div style="color:var(--ink-soft)">${formatDate(room.last_confirmation)}</div>
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

  el.filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      el.filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderRows();
    });
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
    const res = await fetch(`${API_BASE}/qr/all/pdf`, { headers: authHeaders() });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qr-codes.pdf';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Resume session if password already verified this tab
  if (adminPassword()) {
    el.loginWrap.style.display = 'none';
    el.dashboard.style.display = 'block';
    loadRooms();
  }
})();
