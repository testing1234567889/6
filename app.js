/* ===== GPay v3 — Complete Application Logic =====
   FIXED v1.1:
   - setTopupAmount: hapus global event.target → param btn
   - submitTopup: hapus global event.target → param btn
   - processSendMoney: hapus global event.target → param btn
   - processRequestMoney: hapus global event.target → param btn
   - processScanPay: hapus global event.target → param btn
   - payListrik: hapus global event.target + fix from → fromUid
   Semua fungsi backward-compatible (btn opsional)
===================================================== */

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyAu--L2T5_o9xLVT09mXFLIcpPuLLWlL1Q",
  authDomain: "aplikasi-percobaan-dbf84.firebaseapp.com",
  databaseURL: "https://aplikasi-percobaan-dbf84-default-rtdb.firebaseio.com",
  projectId: "aplikasi-percobaan-dbf84",
  storageBucket: "aplikasi-percobaan-dbf84.appspot.com",
  messagingSenderId: "52109851315",
  appId: "1:52109851315:web:ba255b74b4ce0500774ec6"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.database();

// ===== SAFE STORAGE (in-memory) =====
const safeStorage = {
  _data: {},
  getItem(key)        { return this._data[key] || null; },
  setItem(key, value) { this._data[key] = String(value); },
  removeItem(key)     { delete this._data[key]; }
};

// ===== GLOBAL STATE =====
let currentUser                = null;
let userData                   = null;
let balanceHidden              = false;
let currentActivityFilter      = 'all';
let pageHistory                = [];
let promoInterval              = null;
let currentPromoSlide          = 0;
let selectedRecipientUid       = null;
let selectedRequestRecipientUid = null;
let selectedProvider           = '';
let allTransactions            = [];
let searchDebounce             = null;

// ===== SPLASH SCREEN =====
window.addEventListener('load', () => {
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    splash.classList.add('fade-out');
    setTimeout(() => splash.style.display = 'none', 500);
  }, 2200);
});

// ===== RIPPLE EFFECT =====
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.ripple');
  if (!btn) return;
  const rect   = btn.getBoundingClientRect();
  const size   = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.classList.add('ripple-effect');
  ripple.style.width  = ripple.style.height = size + 'px';
  ripple.style.left   = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top    = (e.clientY - rect.top  - size / 2) + 'px';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

// ===== ONLINE/OFFLINE =====
window.addEventListener('online',  () => showToast('Koneksi kembali', 'success'));
window.addEventListener('offline', () => showToast('Tidak ada koneksi', 'warning'));

// ===== AUTH STATE =====
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await initApp(user);
  } else {
    currentUser = null;
    userData    = null;
    showAuthPages();
  }
});

function showAuthPages() {
  document.getElementById('main-app').classList.add('hidden');
  document.querySelectorAll('.auth-page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-login').classList.add('active');
  document.getElementById('page-login').style.display = 'flex';
}

async function initApp(user) {
  document.querySelectorAll('.auth-page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  document.getElementById('main-app').classList.remove('hidden');

  const userRef    = db.ref('users/' + user.uid);
  const snapshot   = await userRef.once('value');
  if (!snapshot.exists()) {
    await userRef.set({
      fullName: user.displayName || user.email.split('@')[0],
      email: user.email, phone: '',
      balance: 0, gplusBalance: 0, pin: '',
      isEmailVerified: user.emailVerified,
      isPhoneVerified: false, protectionScore: 20,
      createdAt: Date.now(), lastCheckin: 0, cards: []
    });
  } else {
    await userRef.update({ isEmailVerified: user.emailVerified });
  }

  userRef.on('value', (snap) => {
    userData = snap.val();
    if (userData) updateUI();
  });

  listenTransactions(user.uid);
  listenMessages(user.uid);
  listenTopupRequests(user.uid);
  listenBills(user.uid);
  listenPromoCodes();
  listenPendingRequests(user.uid);
  switchTab('home');
  startPromoSlider();
  generateQRCode(user.uid);
  updateProtection();
}

// ===== UI UPDATE =====
function updateUI() {
  if (!userData) return;
  const name    = userData.fullName || 'User';
  const initial = name.charAt(0).toUpperCase();
  const balance = userData.balance || 0;
  const gplus   = userData.gplusBalance || 0;

  const hour = new Date().getHours();
  let greeting = 'Selamat Pagi';
  if (hour >= 11 && hour < 15)               greeting = 'Selamat Siang';
  else if (hour >= 15 && hour < 18)          greeting = 'Selamat Sore';
  else if (hour >= 18 || hour < 4)           greeting = 'Selamat Malam';
  setTextContent('greeting-text', greeting + ' 👋');
  setTextContent('greeting-name', name);

  const adminMenuItem = document.getElementById('admin-menu-item');
  if (adminMenuItem) {
    adminMenuItem.style.display = (currentUser && currentUser.uid === 'EsmlqXOnu4VDvCbHp89R0h6ec0R2') ? 'flex' : 'none';
  }

  setTextContent('home-avatar',    initial);
  setTextContent('profile-avatar', initial);
  setTextContent('profile-name',   name);
  setTextContent('profile-phone',  userData.phone || '-');
  setTextContent('qr-name',        name);

  updateBalanceDisplay(balance, gplus);
  setTextContent('ps-saldo',      'G' + formatNumber(balance));
  setTextContent('ps-gplus',      'G' + formatNumber(gplus));
  setTextContent('wallet-balance','G' + formatNumber(balance));

  const settingsName  = document.getElementById('settings-name');
  const settingsEmail = document.getElementById('settings-email');
  const settingsPhone = document.getElementById('settings-phone');
  if (settingsName  && !settingsName.matches(':focus'))  settingsName.value  = name;
  if (settingsEmail)                                     settingsEmail.value = userData.email || '';
  if (settingsPhone && !settingsPhone.matches(':focus')) settingsPhone.value = userData.phone || '';

  updateEmailVerificationUI();
  updateProtection();
}

function updateBalanceDisplay(balance, gplus) {
  const amountEl = document.getElementById('balance-amount');
  const gplusEl  = document.getElementById('gplus-display');
  if (balanceHidden) {
    amountEl.textContent = '•••••';
    gplusEl.textContent  = 'G•••••';
  } else {
    amountEl.textContent = formatNumber(balance);
    gplusEl.textContent  = 'G' + formatNumber(gplus);
  }
}

async function updateEmailVerificationUI() {
  if (currentUser) {
    try { await currentUser.reload(); currentUser = auth.currentUser; } catch(e) {}
  }
  const isVerified = currentUser && currentUser.emailVerified;
  const badge      = document.getElementById('settings-email-badge');
  const statusEl   = document.getElementById('email-verify-status');
  const verifyBtn  = document.getElementById('verify-email-btn');
  if (badge) {
    badge.textContent = isVerified ? 'Terverifikasi' : 'Belum';
    badge.className   = 'verify-badge ' + (isVerified ? 'verified' : 'pending');
  }
  if (statusEl) {
    statusEl.textContent  = isVerified ? 'Email terverifikasi' : 'Belum diverifikasi';
    statusEl.style.color  = isVerified ? '#059669' : '';
  }
  if (verifyBtn) {
    if (isVerified) {
      verifyBtn.textContent    = '✓';
      verifyBtn.disabled       = true;
      verifyBtn.className      = 'btn btn-sm btn-outline ripple';
      verifyBtn.style.color    = '#059669';
      verifyBtn.style.borderColor = '#059669';
    } else {
      verifyBtn.textContent = 'Kirim';
      verifyBtn.disabled    = false;
    }
  }
}

// ===== NAVIGATION =====
function showPage(pageId) {
  const page = document.getElementById('page-' + pageId);
  if (!page) { showToast('Halaman tidak tersedia', 'info'); return; }
  if (page.classList.contains('sub-page')) {
    pageHistory.push(pageId);
    page.style.display = 'flex';
    page.classList.add('active');
    page.style.animation = 'none';
    page.offsetHeight;
    page.style.animation = '';
    if (pageId === 'settings' && userData) {
      const sn = document.getElementById('settings-name');
      const se = document.getElementById('settings-email');
      const sp = document.getElementById('settings-phone');
      if (sn) sn.value = userData.fullName || '';
      if (se) se.value = userData.email || (currentUser && currentUser.email) || '';
      if (sp) sp.value = userData.phone || '';
      updateEmailVerificationUI();
    }
  } else if (page.classList.contains('auth-page')) {
    document.querySelectorAll('.auth-page').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });
    page.classList.add('active');
    page.style.display = 'flex';
  }
}

function goBack() {
  if (pageHistory.length > 0) {
    const pageId = pageHistory.pop();
    const page   = document.getElementById('page-' + pageId);
    if (page) {
      page.style.animation = 'slideOutRight 0.25s ease forwards';
      setTimeout(() => {
        page.classList.remove('active');
        page.style.display   = 'none';
        page.style.animation = '';
      }, 250);
    }
  }
}

function switchTab(tab) {
  pageHistory = [];
  document.querySelectorAll('.sub-page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  document.querySelectorAll('.main-page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + tab);
  if (page) page.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (navItem) navItem.classList.add('active');
}

// ===== AUTH: LOGIN =====
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = e.target.querySelector('.btn');
  toggleBtnLoading(btn, true);
  try {
    await auth.signInWithEmailAndPassword(email, password);
    showToast('Berhasil masuk!', 'success');
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
  }
  toggleBtnLoading(btn, false);
});

// ===== AUTH: REGISTER =====
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm  = document.getElementById('reg-confirm').value;
  const btn      = e.target.querySelector('.btn');
  if (password !== confirm) { showToast('Password tidak cocok', 'error'); return; }
  if (password.length < 8)  { showToast('Password minimal 8 karakter', 'error'); return; }
  toggleBtnLoading(btn, true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    await cred.user.sendEmailVerification();
    await db.ref('users/' + cred.user.uid).set({
      fullName: name, email, phone: '',
      balance: 0, gplusBalance: 0, pin: '',
      isEmailVerified: false, isPhoneVerified: false,
      protectionScore: 20, createdAt: Date.now(), lastCheckin: 0, cards: []
    });
    showToast('Akun berhasil dibuat! Verifikasi email telah dikirim.', 'success');
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
  }
  toggleBtnLoading(btn, false);
});

// ===== AUTH: FORGOT PASSWORD =====
document.getElementById('forgot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  const btn   = e.target.querySelector('.btn');
  toggleBtnLoading(btn, true);
  try {
    await auth.sendPasswordResetEmail(email);
    showToast('Link reset password telah dikirim ke email Anda', 'success');
    setTimeout(() => showPage('login'), 1500);
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
  }
  toggleBtnLoading(btn, false);
});

function togglePassword(inputId, iconEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const show   = input.type === 'password';
  input.type   = show ? 'text' : 'password';
  if (iconEl) iconEl.className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
}

// ===== LOGOUT =====
function doLogout() {
  if (confirm('Yakin ingin keluar?')) {
    if (currentUser) {
      db.ref('users/' + currentUser.uid).off();
      db.ref('transactions').off();
      db.ref('messages').off();
      db.ref('topupRequests').off();
      db.ref('bills').off();
      db.ref('promoCodes').off();
      db.ref('pendingRequests').off();
    }
    auth.signOut();
    showToast('Berhasil keluar', 'success');
  }
}

// ===== EMAIL VERIFICATION =====
function checkEmailVerified() {
  if (!currentUser) return false;
  currentUser.reload().then(() => {
    currentUser = auth.currentUser;
    if (userData) db.ref('users/' + currentUser.uid).update({ isEmailVerified: currentUser.emailVerified });
    updateEmailVerificationUI();
  });
  return currentUser.emailVerified;
}

function requireEmailVerified() {
  if (!currentUser || !currentUser.emailVerified) {
    showModal('verify-email-modal');
    return false;
  }
  return true;
}

async function resendVerification() {
  try {
    await currentUser.sendEmailVerification();
    showToast('Email verifikasi telah dikirim', 'success');
  } catch (err) {
    showToast('Gagal mengirim email: ' + err.message, 'error');
  }
}

// ===== TOP UP =====
// FIX: btn sebagai parameter (backward-compat: fallback ke event.target jika ada)
function setTopupAmount(amount, btn) {
  document.getElementById('topup-amount').value = amount;
  document.querySelectorAll('.quick-amt').forEach(b => b.classList.remove('active'));
  // Terima btn dari onclick="setTopupAmount(x, this)" ATAU fallback ke event
  const activeBtn = btn || (typeof event !== 'undefined' && event.target);
  if (activeBtn) activeBtn.classList.add('active');
}

// FIX: btn sebagai parameter → HTML: onclick="submitTopup(this)"
async function submitTopup(btn) {
  const amount = parseInt(document.getElementById('topup-amount').value);
  if (!amount || amount < 1000) { showToast('Minimal isi saldo G1.000', 'error'); return; }
  // Fallback: cari tombol submit di halaman topup
  if (!btn) btn = document.querySelector('#page-topup .btn-primary');
  toggleBtnLoading(btn, true);
  try {
    await db.ref('topupRequests').push({
      uid: currentUser.uid, amount,
      status: 'pending', requestDate: Date.now(), approvedDate: null
    });
    showToast('Permintaan isi saldo terkirim! Menunggu persetujuan admin.', 'success');
    document.getElementById('topup-amount').value = '';
    document.querySelectorAll('.quick-amt').forEach(b => b.classList.remove('active'));
  } catch (err) {
    showToast('Gagal mengajukan: ' + err.message, 'error');
  }
  toggleBtnLoading(btn, false);
}

function listenTopupRequests(uid) {
  db.ref('topupRequests').orderByChild('uid').equalTo(uid).on('value', (snap) => {
    const container = document.getElementById('topup-history');
    const data      = snap.val();
    if (!data) {
      container.innerHTML = `<div class="empty-state small"><i class="fas fa-clock"></i><p>Belum ada permintaan</p></div>`;
      return;
    }
    const items = Object.entries(data).sort((a, b) => (b[1].requestDate||0) - (a[1].requestDate||0));
    container.innerHTML = items.map(([id, t]) => {
      const statusColor = t.status === 'approved' ? 'var(--success)' : t.status === 'rejected' ? 'var(--danger)' : 'var(--warning)';
      const statusText  = t.status === 'approved' ? 'Disetujui' : t.status === 'rejected' ? 'Ditolak' : 'Menunggu';
      return `<div class="topup-item">
        <div class="topup-item-left">
          <i class="fas fa-wallet" style="color:var(--primary)"></i>
          <div><div class="topup-amount">G${formatNumber(t.amount)}</div>
            <div class="topup-date">${formatDate(t.requestDate)}</div></div>
        </div>
        <span class="topup-status" style="color:${statusColor}">${statusText}</span>
      </div>`;
    }).join('');
  });
}

// ===== SEND MONEY =====
function searchRecipient() {
  clearTimeout(searchDebounce);
  const query    = document.getElementById('send-search').value.trim().toLowerCase();
  const resultEl = document.getElementById('recipient-result');
  if (query.length < 3) {
    resultEl.classList.add('hidden');
    selectedRecipientUid = null;
    return;
  }
  searchDebounce = setTimeout(() => {
    db.ref('users').once('value', (snap) => {
      const users = snap.val();
      if (!users) return;
      for (const [uid, u] of Object.entries(users)) {
        if (uid === currentUser.uid) continue;
        if ((u.email && u.email.toLowerCase().includes(query)) ||
            (u.phone && u.phone.includes(query))) {
          selectedRecipientUid = uid;
          const name = u.fullName || u.email || 'User';
          resultEl.innerHTML = `<div class="ri-item" onclick="confirmRecipient('${uid}','${name.replace(/'/g,"\\'")}')">
            <div class="ri-avatar">${name.charAt(0).toUpperCase()}</div>
            <div><div class="ri-name">${name}</div><div class="ri-email">${u.email||''}</div></div>
          </div>`;
          resultEl.classList.remove('hidden');
          resultEl.style.borderColor = 'var(--primary)';
          return;
        }
      }
      resultEl.innerHTML = `<div class="ri-item text-muted"><i class="fas fa-user-slash"></i> Pengguna tidak ditemukan</div>`;
      resultEl.classList.remove('hidden');
      resultEl.style.borderColor = 'var(--border)';
      selectedRecipientUid = null;
    });
  }, 400);
}

function confirmRecipient(uid, name) {
  selectedRecipientUid = uid;
  document.getElementById('send-search').value = name;
  document.getElementById('recipient-result').classList.add('hidden');
}

// FIX: btn sebagai parameter → HTML: onclick="processSendMoney(this)"
async function processSendMoney(btn) {
  if (!requireEmailVerified()) return;
  if (!selectedRecipientUid) { showToast('Pilih penerima terlebih dahulu', 'error'); return; }
  const amount = parseInt(document.getElementById('send-amount').value);
  const note   = document.getElementById('send-note').value.trim();
  if (!amount || amount < 100)            { showToast('Minimal kirim G100', 'error'); return; }
  if (!userData || userData.balance < amount) { showToast('Saldo tidak cukup', 'error'); return; }
  if (!btn) btn = document.querySelector('#page-send-money .btn-primary');
  toggleBtnLoading(btn, true);
  try {
    await db.ref('users/' + currentUser.uid + '/balance').transaction(cur => {
      if ((cur || 0) < amount) return;
      return (cur || 0) - amount;
    });
    await db.ref('users/' + selectedRecipientUid + '/balance').transaction(cur => (cur || 0) + amount);
    await db.ref('transactions').push({
      fromUid: currentUser.uid, toUid: selectedRecipientUid,
      type: 'transfer', amount, status: 'success',
      description: note || 'Kirim uang', date: Date.now()
    });
    showToast('Berhasil mengirim G' + formatNumber(amount), 'success');
    document.getElementById('send-amount').value = '';
    document.getElementById('send-note').value   = '';
    document.getElementById('send-search').value = '';
    document.getElementById('recipient-result').classList.add('hidden');
    selectedRecipientUid = null;
    goBack();
  } catch (err) {
    showToast('Gagal mengirim: ' + err.message, 'error');
  }
  toggleBtnLoading(btn, false);
}

// ===== REQUEST MONEY =====
function searchRequestRecipient() {
  clearTimeout(searchDebounce);
  const query    = document.getElementById('request-search').value.trim().toLowerCase();
  const resultEl = document.getElementById('request-recipient-result');
  if (query.length < 3) {
    resultEl.classList.add('hidden');
    selectedRequestRecipientUid = null;
    return;
  }
  searchDebounce = setTimeout(() => {
    db.ref('users').once('value', (snap) => {
      const users = snap.val();
      if (!users) return;
      for (const [uid, u] of Object.entries(users)) {
        if (uid === currentUser.uid) continue;
        if ((u.email && u.email.toLowerCase().includes(query)) ||
            (u.phone && u.phone.includes(query))) {
          selectedRequestRecipientUid = uid;
          const name = u.fullName || u.email || 'User';
          resultEl.innerHTML = `<div class="ri-item" onclick="confirmRequestRecipient('${uid}','${name.replace(/'/g,"\\'")}')">
            <div class="ri-avatar">${name.charAt(0).toUpperCase()}</div>
            <div><div class="ri-name">${name}</div><div class="ri-email">${u.email||''}</div></div>
          </div>`;
          resultEl.classList.remove('hidden');
          return;
        }
      }
      resultEl.innerHTML = `<div class="ri-item text-muted"><i class="fas fa-user-slash"></i> Pengguna tidak ditemukan</div>`;
      resultEl.classList.remove('hidden');
      selectedRequestRecipientUid = null;
    });
  }, 400);
}

function confirmRequestRecipient(uid, name) {
  selectedRequestRecipientUid = uid;
  document.getElementById('request-search').value = name;
  document.getElementById('request-recipient-result').classList.add('hidden');
}

// FIX: btn sebagai parameter → HTML: onclick="processRequestMoney(this)"
async function processRequestMoney(btn) {
  if (!selectedRequestRecipientUid) { showToast('Pilih pengguna terlebih dahulu', 'error'); return; }
  const amount = parseInt(document.getElementById('request-amount').value);
  const note   = document.getElementById('request-note').value.trim();
  if (!amount || amount < 100) { showToast('Minimal minta G100', 'error'); return; }
  if (!btn) btn = document.querySelector('#page-request-money .btn-primary');
  toggleBtnLoading(btn, true);
  try {
    await db.ref('pendingRequests').push({
      fromUid: currentUser.uid, toUid: selectedRequestRecipientUid,
      amount, status: 'pending', note: note || '', date: Date.now()
    });
    showToast('Permintaan uang terkirim!', 'success');
    document.getElementById('request-amount').value = '';
    document.getElementById('request-note').value   = '';
    document.getElementById('request-search').value = '';
    document.getElementById('request-recipient-result').classList.add('hidden');
    selectedRequestRecipientUid = null;
    goBack();
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
  toggleBtnLoading(btn, false);
}

function listenPendingRequests(uid) {
  db.ref('pendingRequests').orderByChild('toUid').equalTo(uid).on('value', (snap) => {
    const data = snap.val();
    if (!data) return;
    const pending = Object.entries(data).filter(([, r]) => r.status === 'pending');
    updateNotifications(pending);
  });
}

function updateNotifications(pendingRequests) {
  const container = document.getElementById('notifications-list');
  if (!pendingRequests || pendingRequests.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-bell-slash"></i><p>Belum ada notifikasi</p></div>`;
    return;
  }
  container.innerHTML = pendingRequests.map(([id, r]) => {
    const senderName = r.fromName || 'Seseorang';
    return `<div class="notif-item">
      <div class="notif-icon"><i class="fas fa-hand-holding-dollar"></i></div>
      <div class="notif-body">
        <div class="notif-title">${senderName} minta G${formatNumber(r.amount)}</div>
        <div class="notif-desc">${r.note || ''}</div>
        <div class="notif-actions">
          <button class="btn btn-sm btn-primary ripple" onclick="acceptRequest('${id}',${r.amount},'${r.fromUid}')">Bayar</button>
          <button class="btn btn-sm btn-outline ripple" onclick="declineRequest('${id}')">Tolak</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function acceptRequest(requestId, amount, fromUid) {
  if (!userData || userData.balance < amount) { showToast('Saldo tidak cukup', 'error'); return; }
  try {
    await db.ref('users/' + currentUser.uid + '/balance').transaction(cur => {
      if ((cur || 0) < amount) return;
      return (cur || 0) - amount;
    });
    await db.ref('users/' + fromUid + '/balance').transaction(cur => (cur || 0) + amount);
    await db.ref('pendingRequests/' + requestId).update({ status: 'paid' });
    await db.ref('transactions').push({
      fromUid: currentUser.uid, toUid: fromUid,
      type: 'transfer', amount, status: 'success',
      description: 'Bayar permintaan uang', date: Date.now()
    });
    showToast('Pembayaran berhasil', 'success');
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

async function declineRequest(requestId) {
  try {
    await db.ref('pendingRequests/' + requestId).update({ status: 'declined' });
    showToast('Permintaan ditolak', 'info');
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

// ===== MESSAGES =====
function listenMessages(uid) {
  db.ref('messages').orderByChild('toUid').equalTo(uid).on('value', (snap) => {
    const data      = snap.val();
    const container = document.getElementById('messages-list');
    const badge     = document.getElementById('mail-badge');
    const mailBtn   = document.getElementById('mail-btn');
    if (!data) {
      container.innerHTML = `<div class="empty-state"><i class="fas fa-envelope-open"></i><p>Belum ada pesan</p></div>`;
      if (badge) { badge.textContent = '0'; badge.classList.add('hidden'); }
      return;
    }
    const items   = Object.entries(data).sort((a, b) => (b[1].timestamp||0) - (a[1].timestamp||0));
    const unread  = items.filter(([, m]) => !m.isRead).length;
    if (badge) {
      badge.textContent = unread;
      badge.classList.toggle('hidden', unread === 0);
    }
    if (mailBtn) mailBtn.classList.toggle('has-notif', unread > 0);
    container.innerHTML = items.map(([id, m]) => {
      const typeColor = m.type === 'warning' ? 'var(--warning)' : m.type === 'promo' ? 'var(--success)' : 'var(--primary)';
      const typeIcon  = m.type === 'warning' ? 'fa-exclamation-triangle' : m.type === 'promo' ? 'fa-tag' : 'fa-info-circle';
      return `<div class="message-item ${m.isRead ? '' : 'unread'}" onclick="markMessageRead('${id}')">
        <div class="msg-icon" style="background:${typeColor}20;color:${typeColor}"><i class="fas ${typeIcon}"></i></div>
        <div class="msg-body">
          <div class="msg-title">${m.title || 'Pesan'}</div>
          <div class="msg-text">${m.body || ''}</div>
          <div class="msg-time">${formatTimeAgo(m.timestamp || m.date)}</div>
        </div>
        ${!m.isRead ? '<span class="unread-dot"></span>' : ''}
      </div>`;
    }).join('');
  });
}

function markMessageRead(msgId) {
  db.ref('messages/' + msgId).update({ isRead: true });
}

// ===== TRANSACTIONS =====
function listenTransactions(uid) {
  db.ref('transactions').on('value', (snap) => {
    const data = snap.val();
    if (!data) { allTransactions = []; renderTransactions(); return; }
    allTransactions = Object.entries(data)
      .map(([id, tx]) => ({ id, ...tx }))
      .filter(tx => tx.fromUid === uid || tx.toUid === uid)
      .sort((a, b) => (b.date||0) - (a.date||0));
    renderTransactions();
    renderHomeActivity();
    renderIncomeExpense();
  });
}

function renderTransactions() {
  const listEl   = document.getElementById('transaction-list');
  const searchQ  = (document.getElementById('activity-search')?.value || '').toLowerCase();
  let txs        = [...allTransactions];
  if (currentActivityFilter !== 'all') {
    if (currentActivityFilter === 'in')      txs = txs.filter(tx => tx.toUid === currentUser?.uid);
    else if (currentActivityFilter === 'out') txs = txs.filter(tx => tx.fromUid === currentUser?.uid);
    else txs = txs.filter(tx => tx.status === currentActivityFilter);
  }
  if (searchQ) txs = txs.filter(tx =>
    (tx.description || '').toLowerCase().includes(searchQ) ||
    (tx.type || '').toLowerCase().includes(searchQ)
  );
  if (!txs.length) {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-receipt"></i><p>Belum ada transaksi</p></div>`;
    return;
  }
  listEl.innerHTML = txs.map(tx => renderTxItem(tx)).join('');
}

function renderTxItem(tx) {
  const isOut     = tx.fromUid === currentUser?.uid;
  const typeIcon  = { transfer:'fa-paper-plane', topup:'fa-wallet', reward:'fa-trophy', pulsa:'fa-mobile-screen-button', bill:'fa-file-invoice', qrpay:'fa-qrcode', payment:'fa-credit-card' };
  const icon      = typeIcon[tx.type] || 'fa-exchange-alt';
  const sign      = isOut ? '-' : '+';
  const amtColor  = isOut ? 'var(--danger)' : 'var(--success)';
  const statusBadge = tx.status === 'pending' ? '<span class="tx-badge pending">Pending</span>' : tx.status === 'failed' ? '<span class="tx-badge failed">Gagal</span>' : '';
  return `<div class="tx-item" onclick="showTransactionDetail('${tx.id}')">
    <div class="tx-icon ${isOut ? 'out' : 'in'}"><i class="fas ${icon}"></i></div>
    <div class="tx-info">
      <div class="tx-desc">${tx.description || tx.type || 'Transaksi'} ${statusBadge}</div>
      <div class="tx-date">${formatDate(tx.date)}</div>
    </div>
    <div class="tx-amount" style="color:${amtColor}">${sign}G${formatNumber(tx.amount)}</div>
  </div>`;
}

function renderHomeActivity() {
  const container = document.getElementById('home-activity');
  if (!container) return;
  const recent = allTransactions.slice(0, 5);
  if (!recent.length) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-receipt"></i><p>Belum ada aktivitas</p></div>`;
    return;
  }
  container.innerHTML = recent.map(tx => renderTxItem(tx)).join('');
}

function renderIncomeExpense() {
  if (!currentUser) return;
  let income = 0, expense = 0;
  allTransactions.forEach(tx => {
    if (tx.status === 'failed') return;
    if (tx.toUid === currentUser.uid)   income  += (tx.amount || 0);
    if (tx.fromUid === currentUser.uid) expense += (tx.amount || 0);
  });
  setTextContent('ie-income',  'G' + formatNumber(income));
  setTextContent('ie-expense', 'G' + formatNumber(expense));
}

function setActivityFilter(filter, el) {
  currentActivityFilter = filter;
  document.querySelectorAll('#activity-filters .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTransactions();
}

function filterTransactions() { renderTransactions(); }

function showTransactionDetail(txId) {
  const tx = allTransactions.find(t => t.id === txId);
  if (!tx) return;
  const isOut = tx.fromUid === currentUser?.uid;
  const modal = document.getElementById('tx-detail-modal') || createTxDetailModal();
  modal.querySelector('.tx-detail-content').innerHTML = `
    <div class="tx-detail">
      <div class="tx-detail-amount" style="color:${isOut?'var(--danger)':'var(--success)'}">
        ${isOut?'-':'+'}G${formatNumber(tx.amount)}
      </div>
      <div class="tx-detail-row"><span class="tx-detail-label">Tipe</span><span class="tx-detail-value">${tx.type||'-'}</span></div>
      <div class="tx-detail-row"><span class="tx-detail-label">Status</span><span class="tx-detail-value">${tx.status||'success'}</span></div>
      <div class="tx-detail-row"><span class="tx-detail-label">Deskripsi</span><span class="tx-detail-value">${tx.description||'-'}</span></div>
      <div class="tx-detail-row"><span class="tx-detail-label">Tanggal</span><span class="tx-detail-value">${formatDate(tx.date)}</span></div>
      <div class="tx-detail-row"><span class="tx-detail-label">ID</span><span class="tx-detail-value" style="font-size:.7rem;word-break:break-all">${tx.id}</span></div>
    </div>`;
  showModal('tx-detail-modal');
}

function createTxDetailModal() {
  const el = document.createElement('div');
  el.id    = 'tx-detail-modal';
  el.className = 'modal-overlay';
  el.innerHTML = `<div class="modal-content slide-up">
    <div class="modal-header"><h3>Detail Transaksi</h3>
      <button class="modal-close" onclick="hideModal('tx-detail-modal')"><i class="fas fa-times"></i></button></div>
    <div class="modal-body tx-detail-content"></div>
  </div>`;
  document.body.appendChild(el);
  return el;
}

// ===== QR PAY =====
function generateQRCode(uid) {
  const canvas = document.getElementById('qr-canvas');
  if (!canvas || typeof QRCode === 'undefined') return;
  try {
    QRCode.toCanvas(canvas, uid, { width: 200, margin: 2, color: { dark: '#1a1d2e', light: '#ffffff' } });
  } catch(e) { console.warn('QR generation failed:', e); }
}

function switchQRTab(tab, el) {
  document.querySelectorAll('.qr-section').forEach(s => s.classList.add('hidden'));
  document.getElementById('qr-' + tab).classList.remove('hidden');
  document.querySelectorAll('#page-qr .tab-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
}

// FIX: btn sebagai parameter → HTML: onclick="processScanPay(this)"
async function processScanPay(btn) {
  if (!requireEmailVerified()) return;
  const uidOrEmail = document.getElementById('scan-uid').value.trim();
  const amount     = parseInt(document.getElementById('scan-amount').value);
  const note       = document.getElementById('scan-note').value.trim();
  if (!uidOrEmail) { showToast('Masukkan UID atau email penerima', 'error'); return; }
  if (!amount || amount < 100) { showToast('Minimal bayar G100', 'error'); return; }
  if (!userData || userData.balance < amount) { showToast('Saldo tidak cukup', 'error'); return; }
  if (!btn) btn = document.querySelector('#qr-scan .btn-primary');
  toggleBtnLoading(btn, true);
  try {
    const snap  = await db.ref('users').orderByChild('email').equalTo(uidOrEmail).once('value');
    let toUid   = null;
    if (snap.exists()) {
      toUid = Object.keys(snap.val())[0];
    } else {
      const direct = await db.ref('users/' + uidOrEmail).once('value');
      if (direct.exists()) toUid = uidOrEmail;
    }
    if (!toUid || toUid === currentUser.uid) {
      showToast('Penerima tidak ditemukan', 'error');
      toggleBtnLoading(btn, false);
      return;
    }
    await db.ref('users/' + currentUser.uid + '/balance').transaction(cur => {
      if ((cur || 0) < amount) return;
      return (cur || 0) - amount;
    });
    await db.ref('users/' + toUid + '/balance').transaction(cur => (cur || 0) + amount);
    await db.ref('transactions').push({
      fromUid: currentUser.uid, toUid,
      type: 'qrpay', amount, status: 'success',
      description: note || 'QR Pay', date: Date.now()
    });
    showToast('Pembayaran berhasil G' + formatNumber(amount), 'success');
    document.getElementById('scan-uid').value    = '';
    document.getElementById('scan-amount').value = '';
    document.getElementById('scan-note').value   = '';
    goBack();
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
  toggleBtnLoading(btn, false);
}

// ===== PULSA & DATA =====
function selectProvider(name, el) {
  selectedProvider = name;
  document.querySelectorAll('.provider-chips .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
}

function switchPulsaTab(tab, el) {
  document.querySelectorAll('.packages-grid').forEach(g => g.classList.add('hidden'));
  document.getElementById(tab + '-packages').classList.remove('hidden');
  document.querySelectorAll('#page-pulsa .tab-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
}

function selectPackage(quota, name, price) {
  const phone = document.getElementById('pulsa-phone').value.trim();
  if (!phone) { showToast('Masukkan nomor HP terlebih dahulu', 'error'); return; }
  if (!requireEmailVerified()) return;
  if (!userData || userData.balance < price) { showToast('Saldo tidak cukup', 'error'); return; }
  const cashback = Math.floor(price * 0.05);
  if (!confirm(`Beli ${name} untuk ${phone}\nProvider: ${selectedProvider||'Otomatis'}\nHarga: G${formatNumber(price)}\nCashback: G${formatNumber(cashback)}`)) return;
  processPulsaPurchase(phone, name, price, cashback);
}

async function processPulsaPurchase(phone, name, price, cashback) {
  try {
    await db.ref('users/' + currentUser.uid + '/balance').transaction(cur => {
      if ((cur || 0) < price) return;
      return (cur || 0) - price;
    });
    const net = price - cashback;
    await db.ref('users/' + currentUser.uid + '/gplusBalance').transaction(cur => (cur || 0) + cashback);
    await db.ref('transactions').push({
      fromUid: currentUser.uid, toUid: 'system',
      type: 'pulsa', amount: net, status: 'success',
      description: `${name} - ${phone}`, date: Date.now()
    });
    showToast(`Berhasil beli ${name}! Cashback G${formatNumber(cashback)}`, 'success');
    goBack();
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

// ===== LISTRIK =====
let selectedListrikPackage = null;
let currentListrikType     = 'prepaid';

function selectListrikType(type, el) {
  currentListrikType = type;
  document.querySelectorAll('#page-listrik .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('listrik-packages').style.display = type === 'prepaid' ? 'block' : 'none';
  selectedListrikPackage = null;
}

function selectListrikPackage(amount) {
  selectedListrikPackage = amount;
  document.querySelectorAll('#page-listrik .package-card').forEach(c => c.classList.remove('active'));
  event && event.currentTarget && event.currentTarget.classList.add('active');
  const payBtn = document.getElementById('listrik-pay-btn');
  if (payBtn) payBtn.style.background = 'var(--primary)';
}

// FIX: btn sebagai parameter → HTML: onclick="payListrik(this)"
// FIX: from → fromUid untuk konsistensi dengan app.js lainnya
async function payListrik(btn) {
  const meterId = document.getElementById('listrik-meter-id').value.trim();
  if (!meterId) { showToast('Masukkan nomor meter / ID pelanggan', 'error'); return; }
  if (!requireEmailVerified()) return;
  const amount = currentListrikType === 'postpaid'
    ? parseInt(prompt('Masukkan jumlah tagihan:') || '0')
    : selectedListrikPackage;
  if (!amount || amount < 1) { showToast('Pilih nominal token terlebih dahulu', 'error'); return; }
  if (!userData || userData.balance < amount) { showToast('Saldo tidak cukup', 'error'); return; }
  if (!btn) btn = document.getElementById('listrik-pay-btn');
  toggleBtnLoading(btn, true);
  try {
    await db.ref('users/' + currentUser.uid + '/balance').transaction(cur => {
      if ((cur || 0) < amount) return;
      return (cur || 0) - amount;
    });
    // FIX: pakai fromUid (bukan from) supaya admin dashboard bisa baca
    await db.ref('transactions').push({
      fromUid: currentUser.uid, toUid: 'system',
      type: 'bill', amount, status: 'success',
      description: `Listrik ${currentListrikType === 'prepaid' ? 'Token' : 'Tagihan'} - ${meterId}`,
      date: Date.now()
    });
    showToast(`Pembayaran listrik G${formatNumber(amount)} berhasil!`, 'success');
    document.getElementById('listrik-meter-id').value = '';
    selectedListrikPackage = null;
    goBack();
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
  toggleBtnLoading(btn, false);
}

// ===== REWARDS =====
async function dailyCheckin() {
  if (!currentUser) return;
  const today     = new Date().toDateString();
  const lastCheck = userData?.lastCheckin ? new Date(userData.lastCheckin).toDateString() : '';
  if (lastCheck === today) { showToast('Sudah check-in hari ini!', 'info'); return; }
  const reward = 500;
  try {
    await db.ref('users/' + currentUser.uid).update({ lastCheckin: Date.now() });
    await db.ref('users/' + currentUser.uid + '/gplusBalance').transaction(cur => (cur || 0) + reward);
    await db.ref('transactions').push({
      fromUid: 'system', toUid: currentUser.uid,
      type: 'reward', amount: reward, status: 'success',
      description: 'Check-in harian', date: Date.now()
    });
    document.getElementById('checkin-btn').textContent = 'Sudah Klaim ✓';
    document.getElementById('checkin-btn').disabled    = true;
    showToast('Check-in berhasil! +G500', 'success');
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

// ===== PROMO CODES =====
function listenPromoCodes() {
  db.ref('promoCodes').on('value', (snap) => {
    const data = snap.val();
    renderAvailableVouchers(data);
  });
}

function renderAvailableVouchers(promosData) {
  const container = document.getElementById('available-vouchers');
  if (!container) return;
  if (!promosData) {
    container.innerHTML = `<div class="empty-state small"><i class="fas fa-ticket"></i><p>Belum ada promo</p></div>`;
    return;
  }
  // FIX: filter pakai isActive (field name baru dari admin.js)
  const actives = Object.entries(promosData).filter(([, p]) => p.isActive !== false);
  if (!actives.length) {
    container.innerHTML = `<div class="empty-state small"><i class="fas fa-ticket"></i><p>Belum ada promo</p></div>`;
    return;
  }
  container.innerHTML = actives.map(([id, p]) => {
    const discountText = p.type === 'percent'
      ? `Diskon ${p.discount}%`
      : `Diskon G${formatNumber(p.discount)}`;
    return `<div class="voucher-card" onclick="copyPromoCode('${p.code}')">
      <div class="vc-badge">${discountText}</div>
      <div class="vc-code">${p.code}</div>
      <div class="vc-desc">${p.description || ''}</div>
      ${p.expiryDate ? `<div class="vc-expiry">Exp: ${p.expiryDate}</div>` : ''}
    </div>`;
  }).join('');
}

function copyPromoCode(code) {
  navigator.clipboard?.writeText(code).then(() => showToast(`Kode ${code} disalin!`, 'success'))
    .catch(() => { document.getElementById('promo-code-input').value = code; showToast('Kode disalin ke kolom input', 'info'); });
}

async function redeemPromoCode() {
  const code = (document.getElementById('promo-code-input')?.value || '').trim().toUpperCase();
  if (!code) { showToast('Masukkan kode promo', 'error'); return; }
  if (!requireEmailVerified()) return;
  const snap = await db.ref('promoCodes').orderByChild('code').equalTo(code).once('value');
  if (!snap.exists()) { showToast('Kode promo tidak valid', 'error'); return; }
  const [id, p] = Object.entries(snap.val())[0];
  // FIX: cek isActive
  if (p.isActive === false) { showToast('Promo sudah tidak aktif', 'error'); return; }
  if (p.maxUses && (p.currentUses || 0) >= p.maxUses) { showToast('Kuota promo habis', 'error'); return; }
  if (p.expiryDate && new Date(p.expiryDate) < new Date()) { showToast('Promo sudah kedaluwarsa', 'error'); return; }
  const usedSnap = await db.ref('users/' + currentUser.uid + '/usedPromos/' + id).once('value');
  if (usedSnap.exists()) { showToast('Anda sudah menggunakan promo ini', 'error'); return; }
  // FIX: baca field discount (bukan value)
  const reward = p.type === 'percent'
    ? Math.floor((userData?.balance || 0) * p.discount / 100)
    : (p.discount || 0);
  try {
    await db.ref('users/' + currentUser.uid + '/balance').transaction(cur => (cur || 0) + reward);
    await db.ref('users/' + currentUser.uid + '/usedPromos/' + id).set(true);
    await db.ref('promoCodes/' + id + '/currentUses').transaction(cur => (cur || 0) + 1);
    await db.ref('transactions').push({
      fromUid: 'system', toUid: currentUser.uid,
      type: 'reward', amount: reward, status: 'success',
      description: `Promo ${code}`, date: Date.now()
    });
    showToast(`Promo berhasil! +G${formatNumber(reward)}`, 'success');
    if (document.getElementById('promo-code-input')) document.getElementById('promo-code-input').value = '';
    renderMyVouchers();
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

function renderMyVouchers() {
  const container = document.getElementById('my-vouchers');
  if (!container || !userData?.usedPromos) return;
  const usedIds = Object.keys(userData.usedPromos);
  if (!usedIds.length) return;
  container.innerHTML = usedIds.map(id => {
    return `<div class="voucher-card used"><div class="vc-code">${id}</div><div class="vc-badge used">Sudah digunakan</div></div>`;
  }).join('');
}

// ===== BILLS =====
function listenBills(uid) {
  db.ref('bills').orderByChild('uid').equalTo(uid).on('value', (snap) => {
    const data      = snap.val();
    const container = document.getElementById('bills-list');
    if (!data) {
      container.innerHTML = `<div class="empty-state"><i class="fas fa-file-invoice"></i><p>Belum ada tagihan</p></div>`;
      return;
    }
    renderBillsList(data);
  });
}

function renderBillsList(data, filterType = 'all') {
  const container = document.getElementById('bills-list');
  let items = Object.entries(data).map(([id, b]) => ({ id, ...b }));
  if (filterType !== 'all') items = items.filter(b => (b.category || b.type) === filterType);
  container.innerHTML = items.map(b => {
    const status = b.status || 'unpaid';
    const color  = status === 'paid' ? 'var(--success)' : status === 'overdue' ? 'var(--danger)' : 'var(--warning)';
    return `<div class="bill-item">
      <div class="bill-icon"><i class="fas fa-file-invoice"></i></div>
      <div class="bill-info">
        <div class="bill-name">${b.name || b.category || 'Tagihan'}</div>
        <div class="bill-due">Jatuh tempo: ${formatDate(b.dueDate || b.due)}</div>
      </div>
      <div class="bill-right">
        <div class="bill-amount">G${formatNumber(b.amount)}</div>
        <span class="bill-status" style="color:${color}">${status}</span>
      </div>
    </div>`;
  }).join('');
}

function filterBills(type, el) {
  document.querySelectorAll('#page-bills .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  db.ref('bills').orderByChild('uid').equalTo(currentUser?.uid).once('value', snap => {
    if (snap.exists()) renderBillsList(snap.val(), type);
  });
}

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) { modal.classList.add('active'); modal.style.display = 'flex'; }
}
function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
}

// ===== G PROTECTION =====
function updateProtection() {
  if (!userData) return;
  let score    = 20;
  const pItems = {
    pin:   !!userData.pin,
    email: !!(currentUser && currentUser.emailVerified),
    phone: !!userData.isPhoneVerified,
    bio:   !!userData.biometric,
    pass:  !!(userData.password && userData.password.length >= 8)
  };
  if (pItems.pin)   score += 20;
  if (pItems.email) score += 20;
  if (pItems.phone) score += 15;
  if (pItems.bio)   score += 15;
  if (pItems.pass)  score += 10;
  score = Math.min(score, 100);
  db.ref('users/' + currentUser?.uid).update({ protectionScore: score });

  setTextContent('home-protection-score', score);
  setTextContent('protection-percent',    score);
  const fillEl = document.getElementById('home-protection-fill');
  const arcEl  = document.getElementById('protection-arc');
  if (fillEl) fillEl.style.width = score + '%';
  if (arcEl) {
    const circ   = 2 * Math.PI * 54;
    const offset = circ - (circ * score / 100);
    arcEl.style.strokeDashoffset = offset;
    arcEl.style.stroke = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  }

  const pId = document.getElementById('prot-pin');
  const pEm = document.getElementById('prot-email');
  if (pId) pId.classList.toggle('done', pItems.pin);
  if (pEm) pEm.classList.toggle('done', pItems.email);

  const passText  = document.getElementById('pass-strength-text');
  const passBadge = document.getElementById('pass-badge');
  if (userData.pin && passText)  passText.textContent  = 'PIN sudah diatur';
  if (userData.pin && passBadge) passBadge.style.display = 'inline';
}

async function savePin() {
  const inputs = document.querySelectorAll('#set-pin-modal .pin-input');
  const pin    = [...inputs].map(i => i.value).join('');
  if (pin.length !== 6) { showToast('PIN harus 6 digit', 'error'); return; }
  try {
    await db.ref('users/' + currentUser.uid).update({ pin });
    showToast('PIN berhasil disimpan', 'success');
    hideModal('set-pin-modal');
    inputs.forEach(i => i.value = '');
  } catch (err) {
    showToast('Gagal menyimpan PIN: ' + err.message, 'error');
  }
}

function pinNext(input) {
  if (input.value.length === 1) {
    const next = input.nextElementSibling;
    if (next && next.classList.contains('pin-input')) next.focus();
  }
}

function pinPrev(e, input) {
  if (e.key === 'Backspace' && !input.value) {
    const prev = input.previousElementSibling;
    if (prev && prev.classList.contains('pin-input')) { prev.focus(); prev.value = ''; }
  }
}

function togglePhoneVerify() {
  showToast('Verifikasi HP akan segera hadir', 'info');
  const toggle = document.getElementById('prot-phone-toggle');
  if (toggle) toggle.checked = false;
}

function toggleBiometric() {
  showToast('Biometrik akan segera hadir', 'info');
  const toggle = document.getElementById('prot-bio-toggle');
  if (toggle) toggle.checked = false;
}

// ===== SETTINGS =====
async function saveProfile() {
  const name  = document.getElementById('settings-name').value.trim();
  const phone = document.getElementById('settings-phone').value.trim();
  if (!name) { showToast('Nama tidak boleh kosong', 'error'); return; }
  try {
    await db.ref('users/' + currentUser.uid).update({ fullName: name, phone });
    await currentUser.updateProfile({ displayName: name });
    showToast('Profil berhasil disimpan', 'success');
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

async function changePassword() {
  const oldPass     = document.getElementById('old-password').value;
  const newPass     = document.getElementById('new-password').value;
  const confirmPass = document.getElementById('confirm-new-password').value;
  if (!oldPass || !newPass) { showToast('Isi semua field password', 'error'); return; }
  if (newPass !== confirmPass) { showToast('Konfirmasi password tidak cocok', 'error'); return; }
  if (newPass.length < 8) { showToast('Password minimal 8 karakter', 'error'); return; }
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, oldPass);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(newPass);
    showToast('Password berhasil diubah', 'success');
    hideModal('change-password-modal');
  } catch (err) {
    showToast('Gagal: ' + (err.code === 'auth/wrong-password' ? 'Password lama salah' : err.message), 'error');
  }
}

function toggleDarkMode() {
  const html  = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? '' : 'dark');
  safeStorage.setItem('darkMode', isDark ? '0' : '1');
}

// Init dark mode
try {
  if (safeStorage.getItem('darkMode') === '1' ||
    (!safeStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme:dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
    const t = document.getElementById('dark-mode-toggle');
    if (t) t.checked = true;
  }
} catch(e) {}

// ===== PROMO SLIDER =====
function startPromoSlider() {
  const track = document.getElementById('promo-track');
  const dots  = document.getElementById('promo-dots');
  if (!track) return;
  const slides = track.children.length;
  if (!slides) return;
  if (dots) {
    dots.innerHTML = [...Array(slides)].map((_, i) =>
      `<span class="promo-dot ${i===0?'active':''}" onclick="goToSlide(${i})"></span>`
    ).join('');
  }
  clearInterval(promoInterval);
  promoInterval = setInterval(() => {
    currentPromoSlide = (currentPromoSlide + 1) % slides;
    track.style.transform = `translateX(-${currentPromoSlide * 100}%)`;
    document.querySelectorAll('.promo-dot').forEach((d, i) => d.classList.toggle('active', i === currentPromoSlide));
  }, 3000);
}

function goToSlide(index) {
  const track = document.getElementById('promo-track');
  if (!track) return;
  currentPromoSlide           = index;
  track.style.transform       = `translateX(-${index * 100}%)`;
  document.querySelectorAll('.promo-dot').forEach((d, i) => d.classList.toggle('active', i === index));
}

// ===== FAQ =====
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  if (!item) return;
  item.classList.toggle('open');
}

// ===== TOAST =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast     = document.createElement('div');
  const icons     = { success:'fa-check-circle', error:'fa-times-circle', warning:'fa-exclamation-triangle', info:'fa-info-circle' };
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fas ${icons[type]||icons.info}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 400); }, 3000);
}

function createToastContainer() {
  const el    = document.createElement('div');
  el.id       = 'toast-container';
  el.className = 'toast-container';
  document.body.appendChild(el);
  return el;
}

// ===== BUTTON LOADING =====
function toggleBtnLoading(btn, loading) {
  if (!btn) return;
  const loaderEl = btn.querySelector('.btn-loader');
  const spanEl   = btn.querySelector('span');
  btn.disabled   = loading;
  if (loaderEl)  loaderEl.classList.toggle('hidden', !loading);
  if (spanEl)    spanEl.style.opacity = loading ? '0' : '1';
}

// ===== HELPERS =====
function setTextContent(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatNumber(n) {
  return (parseInt(n) || 0).toLocaleString('id-ID');
}

function formatDate(d) {
  if (!d) return '-';
  const date = typeof d === 'number' ? new Date(d) : new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTimeAgo(ts) {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  if (diff < 60000)     return 'Baru saja';
  if (diff < 3600000)   return Math.floor(diff / 60000) + ' menit lalu';
  if (diff < 86400000)  return Math.floor(diff / 3600000) + ' jam lalu';
  if (diff < 604800000) return Math.floor(diff / 86400000) + ' hari lalu';
  return formatDate(ts);
}

function getAuthError(code) {
  const map = {
    'auth/user-not-found':    'Akun tidak ditemukan',
    'auth/wrong-password':    'Password salah',
    'auth/invalid-email':     'Format email tidak valid',
    'auth/email-already-in-use': 'Email sudah terdaftar',
    'auth/weak-password':     'Password terlalu lemah',
    'auth/invalid-credential': 'Email atau password salah',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
    'auth/network-request-failed': 'Gagal terhubung. Periksa koneksi internet.'
  };
  return map[code] || 'Terjadi kesalahan. Coba lagi.';
}

function toggleBalance() {
  balanceHidden = !balanceHidden;
  const eyeBtn  = document.getElementById('eye-toggle');
  if (eyeBtn) eyeBtn.querySelector('i').className = balanceHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
  updateBalanceDisplay(userData?.balance || 0, userData?.gplusBalance || 0);
}

console.log('GPay v3 app.js loaded — FIXED v1.1');
