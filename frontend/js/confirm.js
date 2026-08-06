(function () {
  // Base URL of the Supabase Edge Functions (backend). Set
  // window.WOHNHEIM_FUNCTIONS_BASE before this script runs to point at your
  // deployed Supabase project; defaults to the local `supabase functions serve` URL.
  const API_BASE = window.WOHNHEIM_FUNCTIONS_BASE || 'http://localhost:54321/functions/v1';

  const translations = {
    de: {
      locale: 'de-DE',
      title: 'Monatliche Anwesenheitsbestätigung',
      roomPrefix: 'Zimmer',
      question: 'Wohnen Sie noch in Zimmer {room}?',
      sub: 'Bitte bestätigen Sie einmal im Monat, dass Sie noch hier wohnen. Das dauert nur eine Sekunde.',
      btnConfirm: 'Ja, ich wohne noch hier',
      btnMoved: 'Ich bin ausgezogen →',
      confirmMoved: 'Möchten Sie wirklich bestätigen, dass Sie ausgezogen sind?',
      successTitle: 'Danke!',
      successBody: 'Ihre Anwesenheit für <strong>{month}</strong> wurde bestätigt.<br>Sie müssen nichts weiter tun.',
      movedTitle: 'Alles klar.',
      movedBody: 'Das Zimmer wurde als ausgezogen markiert. Danke für Ihre Rückmeldung.',
      errorTitle: 'Ungültiger Link',
      errorBody: 'Dieser QR-Code konnte keinem Zimmer zugeordnet werden. Bitte wenden Sie sich an die Verwaltung.',
      footer: 'Ihre Daten werden sicher gespeichert. Kein Account erforderlich.',
    },
    en: {
      locale: 'en-GB',
      title: 'Monthly Presence Confirmation',
      roomPrefix: 'Room',
      question: 'Do you still live in room {room}?',
      sub: 'Please confirm once a month that you still live here. It only takes a second.',
      btnConfirm: 'Yes, I still live here',
      btnMoved: 'I have moved out →',
      confirmMoved: 'Are you sure you want to confirm that you have moved out?',
      successTitle: 'Thank you!',
      successBody: 'Your presence for <strong>{month}</strong> has been confirmed.<br>You don\'t need to do anything else.',
      movedTitle: 'Got it.',
      movedBody: 'The room has been marked as vacated. Thank you for letting us know.',
      errorTitle: 'Invalid link',
      errorBody: 'This QR code could not be matched to a room. Please contact the building management.',
      footer: 'Your data is stored securely. No account required.',
    },
    ar: {
      locale: 'ar-EG',
      dir: 'rtl',
      title: 'تأكيد الإقامة الشهري',
      roomPrefix: 'الغرفة',
      question: 'هل ما زلت تسكن في الغرفة {room}؟',
      sub: 'يرجى التأكيد مرة واحدة في الشهر أنك ما زلت تسكن هنا. لا يستغرق الأمر سوى ثانية واحدة.',
      btnConfirm: 'نعم، ما زلت أسكن هنا',
      btnMoved: '← لقد انتقلت من السكن',
      confirmMoved: 'هل أنت متأكد أنك تريد تأكيد أنك انتقلت من السكن؟',
      successTitle: 'شكرًا لك!',
      successBody: 'تم تأكيد إقامتك لشهر <strong>{month}</strong>.<br>لا حاجة للقيام بأي شيء آخر.',
      movedTitle: 'تم.',
      movedBody: 'تم تحديد الغرفة على أنها شاغرة. شكرًا لإعلامنا.',
      errorTitle: 'رابط غير صالح',
      errorBody: 'تعذر مطابقة رمز الاستجابة السريعة هذا بغرفة. يرجى التواصل مع إدارة السكن.',
      footer: 'يتم تخزين بياناتك بشكل آمن. لا حاجة لحساب.',
    },
    tr: {
      locale: 'tr-TR',
      title: 'Aylık Oturum Onayı',
      roomPrefix: 'Oda',
      question: 'Hâlâ {room} numaralı odada mı oturuyorsunuz?',
      sub: 'Lütfen ayda bir kez hâlâ burada oturduğunuzu onaylayın. Bu sadece bir saniye sürer.',
      btnConfirm: 'Evet, hâlâ burada oturuyorum',
      btnMoved: 'Taşındım →',
      confirmMoved: 'Taşındığınızı onaylamak istediğinizden emin misiniz?',
      successTitle: 'Teşekkürler!',
      successBody: '<strong>{month}</strong> ayı için oturumunuz onaylandı.<br>Başka bir şey yapmanıza gerek yok.',
      movedTitle: 'Tamamdır.',
      movedBody: 'Oda boşaltılmış olarak işaretlendi. Bize bildirdiğiniz için teşekkürler.',
      errorTitle: 'Geçersiz bağlantı',
      errorBody: 'Bu QR kodu bir odayla eşleştirilemedi. Lütfen yönetimle iletişime geçin.',
      footer: 'Verileriniz güvenli bir şekilde saklanır. Hesap gerekmez.',
    },
  };

  let currentLang = 'de';
  let roomNumber = null;
  let roomStatus = null;

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const el = {
    body: document.getElementById('confirm-body'),
    success: document.getElementById('success-state'),
    error: document.getElementById('error-state'),
    roomNumberEl: document.getElementById('room-number'),
    question: document.getElementById('question'),
    successBody: document.getElementById('success-body'),
    successTitle: document.querySelector('#success-state h2'),
    btnConfirm: document.getElementById('btn-confirm'),
    btnMoved: document.getElementById('btn-moved'),
  };

  function applyLanguage(lang) {
    currentLang = lang;
    const t = translations[lang];
    document.documentElement.dir = t.dir || 'ltr';
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      if (typeof t[key] === 'string') node.textContent = t[key];
    });

    if (roomNumber) {
      el.question.textContent = t.question.replace('{room}', roomNumber);
    }

    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
  }

  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyLanguage(btn.dataset.lang));
  });

  function showError() {
    el.body.style.display = 'none';
    el.error.style.display = 'flex';
  }

  function currentMonthLabel() {
    const t = translations[currentLang];
    const now = new Date();
    return new Intl.DateTimeFormat(t.locale, { month: 'long', year: 'numeric' }).format(now);
  }

  async function loadRoom() {
    if (!token) return showError();
    try {
      const res = await fetch(`${API_BASE}/confirm/${encodeURIComponent(token)}`);
      if (!res.ok) return showError();
      const data = await res.json();
      roomNumber = data.room_number;
      roomStatus = data.status;
      el.roomNumberEl.textContent = roomNumber;
      applyLanguage(currentLang);
    } catch (err) {
      showError();
    }
  }

  el.btnConfirm.addEventListener('click', async () => {
    if (!token) return;
    el.btnConfirm.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'confirm' }),
      });
      if (!res.ok) throw new Error('confirm failed');

      const t = translations[currentLang];
      el.successTitle.textContent = t.successTitle;
      el.successBody.innerHTML = t.successBody.replace('{month}', currentMonthLabel());
      el.body.style.display = 'none';
      el.success.style.display = 'flex';
    } catch (err) {
      el.btnConfirm.disabled = false;
      showError();
    }
  });

  el.btnMoved.addEventListener('click', async () => {
    if (!token) return;
    const t = translations[currentLang];
    if (!window.confirm(t.confirmMoved)) return;

    try {
      const res = await fetch(`${API_BASE}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'moved_out' }),
      });
      if (!res.ok) throw new Error('moved_out failed');

      el.successTitle.textContent = t.movedTitle;
      el.successBody.innerHTML = t.movedBody;
      el.body.style.display = 'none';
      el.success.style.display = 'flex';
    } catch (err) {
      showError();
    }
  });

  loadRoom();
})();
