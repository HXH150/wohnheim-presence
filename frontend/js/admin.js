(function () {
  const API_BASE = window.WOHNHEIM_API_BASE || 'http://localhost:3001';
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
      const res = await fetch(`${API_BASE}/api/admin/login`, {
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
    const res = await fetch(`${API_BASE}/api/rooms`, { headers: authHeaders() });
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
      const actionBtn = room.status === 'danger' || (room.status === 'warn' && overdue)
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
      const res = await fetch(`${API_BASE}/api/rooms/${btn.dataset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status: 'vacant' }),
      });
      if (res.ok) loadRooms();
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
    el.qrModalImg.src = `${API_BASE}/api/qr/${token}`;
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
    a.href = `${API_BASE}/api/qr/${el.qrModalDownload.dataset.token}`;
    a.download = `zimmer-${el.qrModalDownload.dataset.room}-qr.png`;
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

    const res = await fetch(`${API_BASE}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ room_number }),
    });

    if (res.ok) {
      el.addRoomModal.classList.remove('active');
      loadRooms();
    }
  });

  el.btnDownloadAllQr.addEventListener('click', async () => {
    const res = await fetch(`${API_BASE}/api/qr/all/pdf`, { headers: authHeaders() });
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
