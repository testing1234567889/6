/* ===== GPay v3 — Complete Application Logic ===== */

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
const db = firebase.database();

// ===== SAFE STORAGE (in-memory) =====
const safeStorage = {
  _data: {},
  getItem(key) { return this._data[key] || null; },
  setItem(key, value) { this._data[key] = String(value); },
  removeItem(key) { delete this._data[key]; }
};

// ===== GLOBAL STATE =====
let currentUser = null;
let userData = null;
let balanceHidden = false;
let currentActivityFilter = 'all';
let pageHistory = [];
let promoInterval = null;
let currentPromoSlide = 0;
let selectedRecipientUid = null;
let selectedRequestRecipientUid = null;
let selectedProvider = '';
let allTransactions = [];
let searchDebounce = null;

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
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.classList.add('ripple-effect');
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

// ===== ONLINE/OFFLINE =====
window.addEventListener('online', () => showToast('Koneksi kembali', 'success'));
window.addEventListener('offline', () => showToast('Tidak ada koneksi', 'warning'));

// ===== AUTH STATE =====
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await initApp(user);
  } else {
    currentUser = null;
    userData = null;
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
  // Hide auth, show main
  document.querySelectorAll('.auth-page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  document.getElementById('main-app').classList.remove('hidden');

  // Load or create user data
  const userRef = db.ref('users/' + user.uid);
  const snapshot = await userRef.once('value');

  if (!snapshot.exists()) {
    // Create default user data
    await userRef.set({
      fullName: user.displayName || user.email.split('@')[0],
      email: user.email,
      phone: '',
      balance: 0,
      gplusBalance: 0,
      pin: '',
      isEmailVerified: user.emailVerified,
      isPhoneVerified: false,
      protectionScore: 20,
      createdAt: Date.now(),
      lastCheckin: 0,
      cards: []
    });
  } else {
    // Update email verification status
    await userRef.update({
      isEmailVerified: user.emailVerified
    });
  }

  // Listen for user data changes
  userRef.on('value', (snap) => {
    userData = snap.val();
    if (userData) updateUI();
  });

  // Listen for transactions
  listenTransactions(user.uid);
  // Listen for messages
  listenMessages(user.uid);
  // Listen for topup requests
  listenTopupRequests(user.uid);
  // Listen for bills
  listenBills(user.uid);
  // Listen for promo codes
  listenPromoCodes();
  // Listen for pending requests
  listenPendingRequests(user.uid);

  // Show home
  switchTab('home');
  startPromoSlider();
  generateQRCode(user.uid);
  updateProtection();
}

// ===== UI UPDATE =====
function updateUI() {
  if (!userData) return;

  const name = userData.fullName || 'User';
  const initial = name.charAt(0).toUpperCase();
  const balance = userData.balance || 0;
  const gplus = userData.gplusBalance || 0;

  // Greeting - show small greeting text, prominent username
  const hour = new Date().getHours();
  let greeting = 'Selamat Pagi';
  if (hour >= 11 && hour < 15) greeting = 'Selamat Siang';
  else if (hour >= 15 && hour < 18) greeting = 'Selamat Sore';
  else if (hour >= 18 || hour < 4) greeting = 'Selamat Malam';

  setTextContent('greeting-text', greeting + ' 👋');
  setTextContent('greeting-name', name);

  // Show/hide admin menu item
  const adminMenuItem = document.getElementById('admin-menu-item');
  if (adminMenuItem) {
    adminMenuItem.style.display = (currentUser && currentUser.uid === 'zzfDwQucdycGyVHsM3zq0tx0A9o1') ? 'flex' : 'none';
  }
  setTextContent('home-avatar', initial);
  setTextContent('profile-avatar', initial);
  setTextContent('profile-name', name);
  setTextContent('profile-phone', userData.phone || '-');
  setTextContent('qr-name', name);

  // Balance
  updateBalanceDisplay(balance, gplus);

  // Profile page
  setTextContent('ps-saldo', 'G' + formatNumber(balance));
  setTextContent('ps-gplus', 'G' + formatNumber(gplus));

  // Wallet
  setTextContent('wallet-balance', 'G' + formatNumber(balance));

  // Settings
  const settingsName = document.getElementById('settings-name');
  const settingsEmail = document.getElementById('settings-email');
  const settingsPhone = document.getElementById('settings-phone');
  if (settingsName && !settingsName.matches(':focus')) settingsName.value = name;
  if (settingsEmail) settingsEmail.value = userData.email || '';
  if (settingsPhone && !settingsPhone.matches(':focus')) settingsPhone.value = userData.phone || '';

  // Email verification status
  updateEmailVerificationUI();
  updateProtection();
}

function updateBalanceDisplay(balance, gplus) {
  const amountEl = document.getElementById('balance-amount');
  const gplusEl = document.getElementById('gplus-display');

  if (balanceHidden) {
    amountEl.textContent = '•••••';
    gplusEl.textContent = 'G•••••';
  } else {
    amountEl.textContent = formatNumber(balance);
    gplusEl.textContent = 'G' + formatNumber(gplus);
  }
}

async function updateEmailVerificationUI() {
  // Force reload to get latest email verification status
  if (currentUser) {
    try {
      await currentUser.reload();
      currentUser = auth.currentUser;
    } catch(e) { /* ignore reload errors */ }
  }
  const isVerified = currentUser && currentUser.emailVerified;
  const badge = document.getElementById('settings-email-badge');
  const statusEl = document.getElementById('email-verify-status');
  const verifyBtn = document.getElementById('verify-email-btn');

  if (badge) {
    badge.textContent = isVerified ? 'Terverifikasi' : 'Belum';
    badge.className = 'verify-badge ' + (isVerified ? 'verified' : 'pending');
  }
  if (statusEl) {
    statusEl.textContent = isVerified ? 'Email terverifikasi' : 'Belum diverifikasi';
    statusEl.style.color = isVerified ? '#059669' : '';
  }
  if (verifyBtn) {
    if (isVerified) {
      verifyBtn.textContent = '✓';
      verifyBtn.disabled = true;
      verifyBtn.className = 'btn btn-sm btn-outline ripple';
      verifyBtn.style.color = '#059669';
      verifyBtn.style.borderColor = '#059669';
    } else {
      verifyBtn.textContent = 'Kirim';
      verifyBtn.disabled = false;
    }
  }
}

// ===== NAVIGATION =====
function showPage(pageId) {
  const page = document.getElementById('page-' + pageId);
  if (!page) {
    showToast('Halaman tidak tersedia', 'info');
    return;
  }

  if (page.classList.contains('sub-page')) {
    pageHistory.push(pageId);
    page.style.display = 'flex';
    page.classList.add('active');
    // Trigger entry animation
    page.style.animation = 'none';
    page.offsetHeight; // force reflow
    page.style.animation = '';

    // Force populate settings fields every time settings page is shown
    if (pageId === 'settings' && userData) {
      const settingsName = document.getElementById('settings-name');
      const settingsEmail = document.getElementById('settings-email');
      const settingsPhone = document.getElementById('settings-phone');
      if (settingsName) settingsName.value = userData.fullName || '';
      if (settingsEmail) settingsEmail.value = userData.email || (currentUser && currentUser.email) || '';
      if (settingsPhone) settingsPhone.value = userData.phone || '';
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
    const page = document.getElementById('page-' + pageId);
    if (page) {
      page.style.animation = 'slideOutRight 0.25s ease forwards';
      setTimeout(() => {
        page.classList.remove('active');
        page.style.display = 'none';
        page.style.animation = '';
      }, 250);
    }
  }
}

function switchTab(tab) {
  // Close any open sub-pages
  pageHistory = [];
  document.querySelectorAll('.sub-page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });

  // Switch main page
  document.querySelectorAll('.main-page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + tab);
  if (page) page.classList.add('active');

  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (navItem) navItem.classList.add('active');
}

// ===== AUTH: LOGIN =====
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = e.target.querySelector('.btn');

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
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  const btn = e.target.querySelector('.btn');

  if (password !== confirm) {
    showToast('Password tidak cocok', 'error');
    return;
  }
  if (password.length < 8) {
    showToast('Password minimal 8 karakter', 'error');
    return;
  }

  toggleBtnLoading(btn, true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    await cred.user.sendEmailVerification();

    // Create user in DB
    await db.ref('users/' + cred.user.uid).set({
      fullName: name,
      email: email,
      phone: '',
      balance: 0,
      gplusBalance: 0,
      pin: '',
      isEmailVerified: false,
      isPhoneVerified: false,
      protectionScore: 20,
      createdAt: Date.now(),
      lastCheckin: 0,
      cards: []
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
  const btn = e.target.querySelector('.btn');

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

// ===== LOGOUT =====
function doLogout() {
  if (confirm('Yakin ingin keluar?')) {
    // Remove listeners
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

// ===== EMAIL VERIFICATION CHECK =====
function checkEmailVerified() {
  if (!currentUser) return false;
  // Reload to get latest status
  currentUser.reload().then(() => {
    currentUser = auth.currentUser;
    if (userData) {
      db.ref('users/' + currentUser.uid).update({ isEmailVerified: currentUser.emailVerified });
    }
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
function setTopupAmount(amount) {
  document.getElementById('topup-amount').value = amount;
  document.querySelectorAll('.quick-amt').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}

async function submitTopup() {
  const amount = parseInt(document.getElementById('topup-amount').value);
  if (!amount || amount < 1000) {
    showToast('Minimal isi saldo G1.000', 'error');
    return;
  }

  const btn = event.target;
  toggleBtnLoading(btn, true);
  try {
    await db.ref('topupRequests').push({
      uid: currentUser.uid,
      amount: amount,
      status: 'pending',
      requestDate: Date.now(),
      approvedDate: null
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
    const data = snap.val();
    if (!data) {
      container.innerHTML = '<div class="empty-state small"><i class="fas fa-clock"></i><p>Belum ada permintaan</p></div>';
      return;
    }

    const items = Object.entries(data).sort((a, b) => b[1].requestDate - a[1].requestDate);
    container.innerHTML = items.map(([id, req]) => {
      const statusClass = req.status;
      const statusText = req.status === 'pending' ? 'Menunggu' : req.status === 'approved' ? 'Disetujui' : 'Ditolak';
      const icon = req.status === 'pending' ? 'fa-clock' : req.status === 'approved' ? 'fa-check' : 'fa-times';
      return `
        <div class="topup-item">
          <div class="ti-icon ${statusClass}"><i class="fas ${icon}"></i></div>
          <div class="ti-info">
            <strong>G${formatNumber(req.amount)}</strong>
            <small>${formatDate(req.requestDate)}</small>
          </div>
          <span class="ti-status ${statusClass}">${statusText}</span>
        </div>
      `;
    }).join('');

    // Also listen for approved ones to update balance (realtime)
    items.forEach(([id, req]) => {
      if (req.status === 'approved') {
        // Balance already updated by admin
      }
    });
  });
}

// ===== SEND MONEY =====
function searchRecipient() {
  clearTimeout(searchDebounce);
  const query = document.getElementById('send-search').value.trim().toLowerCase();
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
          resultEl.innerHTML = `
            <div class="avatar-circle">${(u.fullName || 'U').charAt(0).toUpperCase()}</div>
            <div>
              <div class="ri-name">${u.fullName || 'User'}</div>
              <div class="ri-email">${u.email || ''}</div>
            </div>
          `;
          resultEl.classList.remove('hidden');
          return;
        }
      }
      resultEl.innerHTML = '<p style="color:var(--text-secondary);font-size:14px;">Pengguna tidak ditemukan</p>';
      resultEl.classList.remove('hidden');
      resultEl.style.borderColor = 'var(--border)';
      selectedRecipientUid = null;
    });
  }, 400);
}

async function processSendMoney() {
  if (!requireEmailVerified()) return;
  if (!selectedRecipientUid) {
    showToast('Pilih penerima terlebih dahulu', 'error');
    return;
  }

  const amount = parseInt(document.getElementById('send-amount').value);
  const note = document.getElementById('send-note').value.trim();

  if (!amount || amount < 100) {
    showToast('Minimal kirim G100', 'error');
    return;
  }
  if (!userData || userData.balance < amount) {
    showToast('Saldo tidak cukup', 'error');
    return;
  }

  const btn = event.target;
  toggleBtnLoading(btn, true);

  try {
    // Atomic transaction for sender
    await db.ref('users/' + currentUser.uid + '/balance').transaction((current) => {
      if ((current || 0) < amount) return; // abort
      return (current || 0) - amount;
    });

    // Atomic transaction for recipient
    await db.ref('users/' + selectedRecipientUid + '/balance').transaction((current) => {
      return (current || 0) + amount;
    });

    // Record transaction
    await db.ref('transactions').push({
      fromUid: currentUser.uid,
      toUid: selectedRecipientUid,
      type: 'transfer',
      amount: amount,
      status: 'success',
      description: note || 'Kirim uang',
      date: Date.now()
    });

    showToast('Berhasil mengirim G' + formatNumber(amount), 'success');
    document.getElementById('send-amount').value = '';
    document.getElementById('send-note').value = '';
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
  const query = document.getElementById('request-search').value.trim().toLowerCase();
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
          resultEl.innerHTML = `
            <div class="avatar-circle">${(u.fullName || 'U').charAt(0).toUpperCase()}</div>
            <div>
              <div class="ri-name">${u.fullName || 'User'}</div>
              <div class="ri-email">${u.email || ''}</div>
            </div>
          `;
          resultEl.classList.remove('hidden');
          return;
        }
      }
      resultEl.innerHTML = '<p style="color:var(--text-secondary);font-size:14px;">Pengguna tidak ditemukan</p>';
      resultEl.classList.remove('hidden');
      selectedRequestRecipientUid = null;
    });
  }, 400);
}

async function processRequestMoney() {
  if (!selectedRequestRecipientUid) {
    showToast('Pilih pengguna terlebih dahulu', 'error');
    return;
  }

  const amount = parseInt(document.getElementById('request-amount').value);
  const note = document.getElementById('request-note').value.trim();

  if (!amount || amount < 100) {
    showToast('Minimal minta G100', 'error');
    return;
  }

  const btn = event.target;
  toggleBtnLoading(btn, true);

  try {
    await db.ref('pendingRequests').push({
      fromUid: currentUser.uid,
      toUid: selectedRequestRecipientUid,
      amount: amount,
      status: 'pending',
      note: note || '',
      date: Date.now()
    });
    showToast('Permintaan uang terkirim!', 'success');
    document.getElementById('request-amount').value = '';
    document.getElementById('request-note').value = '';
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
    // Show pending requests as notifications
    const pending = Object.entries(data).filter(([id, r]) => r.status === 'pending');
    // We'll display in notifications list
    updateNotifications(pending);
  });
}

function updateNotifications(pendingRequests) {
  const container = document.getElementById('notifications-list');
  if (!pendingRequests || pendingRequests.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i><p>Belum ada notifikasi</p></div>';
    return;
  }

  container.innerHTML = '';
  pendingRequests.forEach(([id, req]) => {
    // Get requester info
    db.ref('users/' + req.fromUid + '/fullName').once('value', (snap) => {
      const name = snap.val() || 'User';
      const item = document.createElement('div');
      item.className = 'message-item';
      item.innerHTML = `
        <div class="msg-icon unread"><i class="fas fa-hand-holding-dollar"></i></div>
        <div class="msg-info">
          <strong>${name} meminta G${formatNumber(req.amount)}</strong>
          <small>${req.note || 'Permintaan uang'} • ${formatDate(req.date)}</small>
        </div>
      `;
      container.appendChild(item);
    });
  });
}

// ===== MESSAGES =====
function listenMessages(uid) {
  db.ref('messages').on('value', (snap) => {
    const data = snap.val();
    const container = document.getElementById('messages-list');
    if (!data) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-envelope-open"></i><p>Belum ada pesan</p></div>';
      updateMailBadge(0);
      return;
    }

    const messages = Object.entries(data)
      .filter(([id, m]) => m.toUid === uid || m.toUid === 'all')
      .sort((a, b) => b[1].date - a[1].date);

    if (messages.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-envelope-open"></i><p>Belum ada pesan</p></div>';
      updateMailBadge(0);
      return;
    }

    let unreadCount = 0;
    container.innerHTML = messages.map(([id, msg]) => {
      const isUnread = !msg.isRead;
      if (isUnread) unreadCount++;
      return `
        <div class="message-item ${isUnread ? 'unread' : ''}" onclick="readMessage('${id}')">
          <div class="msg-icon ${isUnread ? 'unread' : ''}">
            <i class="fas ${msg.type === 'promo' ? 'fa-tag' : msg.type === 'system' ? 'fa-bell' : 'fa-envelope'}"></i>
          </div>
          <div class="msg-info">
            <strong>${msg.title || 'Pesan'}</strong>
            <small>${(msg.body || '').substring(0, 50)}${msg.body && msg.body.length > 50 ? '...' : ''}</small>
          </div>
          <small style="color:var(--text-muted);font-size:11px;">${formatDateShort(msg.date)}</small>
        </div>
      `;
    }).join('');

    updateMailBadge(unreadCount);
  });
}

function readMessage(msgId) {
  db.ref('messages/' + msgId).update({ isRead: true });
  // Show in a simple alert for now
  db.ref('messages/' + msgId).once('value', (snap) => {
    const msg = snap.val();
    if (msg) {
      showToast(msg.title + ': ' + msg.body, 'info');
    }
  });
}

function updateMailBadge(count) {
  const badge = document.getElementById('mail-badge');
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ===== TRANSACTIONS =====
function listenTransactions(uid) {
  db.ref('transactions').on('value', (snap) => {
    const data = snap.val();
    if (!data) {
      allTransactions = [];
      renderTransactions();
      renderHomeActivity();
      renderIncomeExpense();
      return;
    }

    allTransactions = Object.entries(data)
      .filter(([id, tx]) => tx.fromUid === uid || tx.toUid === uid)
      .map(([id, tx]) => ({ id, ...tx }))
      .sort((a, b) => b.date - a.date);

    renderTransactions();
    renderHomeActivity();
    renderIncomeExpense();
  });
}

function renderTransactions() {
  const container = document.getElementById('transaction-list');
  const search = (document.getElementById('activity-search')?.value || '').toLowerCase();

  let filtered = allTransactions;

  // Filter
  if (currentActivityFilter === 'in') {
    filtered = filtered.filter(tx => tx.toUid === currentUser.uid && tx.status === 'success');
  } else if (currentActivityFilter === 'out') {
    filtered = filtered.filter(tx => tx.fromUid === currentUser.uid && tx.status === 'success');
  } else if (currentActivityFilter === 'pending') {
    filtered = filtered.filter(tx => tx.status === 'pending');
  } else if (currentActivityFilter === 'failed') {
    filtered = filtered.filter(tx => tx.status === 'failed');
  }

  // Search
  if (search) {
    filtered = filtered.filter(tx =>
      (tx.description || '').toLowerCase().includes(search) ||
      (tx.type || '').toLowerCase().includes(search)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><p>Belum ada transaksi</p></div>';
    return;
  }

  container.innerHTML = filtered.map(tx => renderTransactionItem(tx)).join('');
}

function renderTransactionItem(tx) {
  const isIncome = tx.toUid === currentUser.uid;
  const iconClass = tx.status === 'pending' ? 'pending' : tx.status === 'failed' ? 'failed' : (isIncome ? 'income' : 'expense');
  const icon = tx.status === 'pending' ? 'fa-clock' : tx.status === 'failed' ? 'fa-times' : (isIncome ? 'fa-arrow-down' : 'fa-arrow-up');
  const amountClass = tx.status === 'pending' ? 'pending-text' : (isIncome ? 'positive' : 'negative');
  const prefix = isIncome ? '+' : '-';
  const typeLabel = getTypeLabel(tx.type);

  return `
    <div class="transaction-item" onclick="showTxDetail('${tx.id}')">
      <div class="tx-icon ${iconClass}"><i class="fas ${icon}"></i></div>
      <div class="tx-info">
        <strong>${tx.description || typeLabel}</strong>
        <small>${formatDate(tx.date)}</small>
      </div>
      <span class="tx-amount ${amountClass}">${prefix}G${formatNumber(tx.amount)}</span>
    </div>
  `;
}

function renderHomeActivity() {
  const container = document.getElementById('home-activity');
  const recent = allTransactions.slice(0, 3);

  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><p>Belum ada aktivitas</p></div>';
    return;
  }

  container.innerHTML = recent.map(tx => renderTransactionItem(tx)).join('');
}

function renderIncomeExpense() {
  let income = 0, expense = 0;
  allTransactions.forEach(tx => {
    if (tx.status !== 'success') return;
    if (tx.toUid === currentUser.uid) income += tx.amount;
    if (tx.fromUid === currentUser.uid) expense += tx.amount;
  });
  setTextContent('ie-income', 'G' + formatNumber(income));
  setTextContent('ie-expense', 'G' + formatNumber(expense));
}

function setActivityFilter(filter, el) {
  currentActivityFilter = filter;
  document.querySelectorAll('#activity-filters .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTransactions();
}

function filterTransactions() {
  renderTransactions();
}

function showTxDetail(txId) {
  const tx = allTransactions.find(t => t.id === txId);
  if (!tx) return;

  const isIncome = tx.toUid === currentUser.uid;
  const statusClass = tx.status === 'success' ? 'success' : tx.status === 'pending' ? 'pending' : 'failed';
  const statusText = tx.status === 'success' ? 'Berhasil' : tx.status === 'pending' ? 'Menunggu' : 'Gagal';

  document.getElementById('tx-detail-body').innerHTML = `
    <div class="tx-detail">
      <div style="text-align:center;margin-bottom:20px;">
        <div class="modal-icon ${isIncome ? 'success' : 'danger'}">
          <i class="fas ${isIncome ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
        </div>
        <h2 style="font-size:28px;font-weight:800;">${isIncome ? '+' : '-'}G${formatNumber(tx.amount)}</h2>
      </div>
      <div class="tx-detail-row">
        <span class="tx-detail-label">Tipe</span>
        <span class="tx-detail-value">${getTypeLabel(tx.type)}</span>
      </div>
      <div class="tx-detail-row">
        <span class="tx-detail-label">Deskripsi</span>
        <span class="tx-detail-value">${tx.description || '-'}</span>
      </div>
      <div class="tx-detail-row">
        <span class="tx-detail-label">Tanggal</span>
        <span class="tx-detail-value">${formatDate(tx.date)}</span>
      </div>
      <div class="tx-detail-row">
        <span class="tx-detail-label">Status</span>
        <span class="tx-detail-status ${statusClass}">${statusText}</span>
      </div>
      ${tx.promoCode ? `<div class="tx-detail-row"><span class="tx-detail-label">Kode Promo</span><span class="tx-detail-value">${tx.promoCode}</span></div>` : ''}
    </div>
  `;
  showModal('tx-detail-modal');
}

// ===== PULSA & DATA =====
function selectProvider(provider, el) {
  selectedProvider = provider;
  document.querySelectorAll('.provider-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function switchPulsaTab(tab, el) {
  document.querySelectorAll('#page-pulsa .tab-btn').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('pulsa-packages').classList.toggle('hidden', tab !== 'pulsa');
  document.getElementById('data-packages').classList.toggle('hidden', tab !== 'data');
}

async function selectPackage(value, name, price) {
  if (!requireEmailVerified()) return;

  const phone = document.getElementById('pulsa-phone').value.trim();
  if (!phone) {
    showToast('Masukkan nomor HP terlebih dahulu', 'error');
    return;
  }
  if (!selectedProvider) {
    showToast('Pilih provider terlebih dahulu', 'error');
    return;
  }

  if (!userData || userData.balance < price) {
    showToast('Saldo tidak cukup', 'error');
    return;
  }

  // Show confirmation
  const cashback = Math.round(price * 0.05);
  document.getElementById('confirm-tx-title').textContent = 'Konfirmasi Pembelian';
  document.getElementById('confirm-tx-body').innerHTML = `
    <div style="text-align:center;">
      <p style="margin-bottom:12px;"><strong>${name}</strong></p>
      <p>Nomor: ${phone}</p>
      <p>Provider: ${selectedProvider}</p>
      <p style="font-size:24px;font-weight:800;margin:16px 0;">G${formatNumber(price)}</p>
      <p style="color:var(--success);font-size:13px;">Cashback 5%: G${formatNumber(cashback)}</p>
    </div>
  `;
  document.getElementById('confirm-tx-btn').onclick = () => executePulsaPurchase(name, price, phone, cashback);
  showModal('confirm-tx-modal');
}

async function executePulsaPurchase(name, price, phone, cashback) {
  hideModal('confirm-tx-modal');

  try {
    // Deduct balance
    await db.ref('users/' + currentUser.uid + '/balance').transaction((current) => {
      if ((current || 0) < price) return;
      return (current || 0) - price;
    });

    // Add cashback to gplus
    await db.ref('users/' + currentUser.uid + '/gplusBalance').transaction((current) => {
      return (current || 0) + cashback;
    });

    // Record transaction
    await db.ref('transactions').push({
      fromUid: currentUser.uid,
      toUid: 'system',
      type: 'pulsa',
      amount: price,
      status: 'success',
      description: name + ' - ' + phone,
      date: Date.now()
    });

    showToast('Pembelian berhasil! Cashback G' + formatNumber(cashback), 'success');
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

// ===== REWARDS / DAILY CHECKIN =====
async function dailyCheckin() {
  if (!currentUser || !userData) return;

  const now = Date.now();
  const lastCheckin = userData.lastCheckin || 0;
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (now - lastCheckin < oneDayMs) {
    showToast('Anda sudah klaim hari ini. Coba lagi besok!', 'warning');
    return;
  }

  try {
    await db.ref('users/' + currentUser.uid).update({
      lastCheckin: now
    });
    await db.ref('users/' + currentUser.uid + '/gplusBalance').transaction((current) => {
      return (current || 0) + 500;
    });
    await db.ref('transactions').push({
      fromUid: 'system',
      toUid: currentUser.uid,
      type: 'reward',
      amount: 500,
      status: 'success',
      description: 'Check-in harian',
      date: now
    });
    showToast('Check-in berhasil! +G500 GPay+', 'success');
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

// ===== PROMO CODES =====
function listenPromoCodes() {
  db.ref('promoCodes').on('value', (snap) => {
    const data = snap.val();
    renderAvailableVouchers(data);
    renderRewardsPromos(data);
  });
}

function renderAvailableVouchers(data) {
  const container = document.getElementById('available-vouchers');
  if (!data) {
    container.innerHTML = '<div class="empty-state small"><i class="fas fa-ticket"></i><p>Belum ada promo</p></div>';
    return;
  }

  const active = Object.entries(data).filter(([id, p]) => {
    return p.isActive && (!p.expiryDate || p.expiryDate > Date.now()) && (p.currentUses < p.maxUses);
  });

  if (active.length === 0) {
    container.innerHTML = '<div class="empty-state small"><i class="fas fa-ticket"></i><p>Belum ada promo</p></div>';
    return;
  }

  container.innerHTML = active.map(([id, p]) => `
    <div class="voucher-card">
      <h4>${p.description || p.code}</h4>
      <p>Diskon ${p.type === 'percent' ? p.discount + '%' : 'G' + formatNumber(p.discount)}</p>
      <span class="vc-code">${p.code}</span>
    </div>
  `).join('');
}

function renderRewardsPromos(data) {
  const container = document.getElementById('rewards-promos');
  if (!data) {
    container.innerHTML = '<div class="empty-state small"><i class="fas fa-ticket"></i><p>Belum ada promo</p></div>';
    return;
  }

  const active = Object.entries(data).filter(([id, p]) => p.isActive);
  if (active.length === 0) {
    container.innerHTML = '<div class="empty-state small"><i class="fas fa-ticket"></i><p>Belum ada promo</p></div>';
    return;
  }

  container.innerHTML = active.map(([id, p]) => `
    <div class="voucher-card">
      <h4>${p.description || p.code}</h4>
      <p>Diskon ${p.type === 'percent' ? p.discount + '%' : 'G' + formatNumber(p.discount)}</p>
      <span class="vc-code">${p.code}</span>
    </div>
  `).join('');
}

async function redeemPromoCode() {
  const code = document.getElementById('promo-code-input').value.trim().toUpperCase();
  if (!code) {
    showToast('Masukkan kode promo', 'error');
    return;
  }

  try {
    const snap = await db.ref('promoCodes').orderByChild('code').equalTo(code).once('value');
    const data = snap.val();
    if (!data) {
      showToast('Kode promo tidak ditemukan', 'error');
      return;
    }

    const [id, promo] = Object.entries(data)[0];
    if (!promo.isActive) {
      showToast('Kode promo sudah tidak aktif', 'error');
      return;
    }
    if (promo.expiryDate && promo.expiryDate < Date.now()) {
      showToast('Kode promo sudah kadaluarsa', 'error');
      return;
    }
    if (promo.currentUses >= promo.maxUses) {
      showToast('Kode promo sudah habis', 'error');
      return;
    }

    // Apply promo
    const amount = promo.type === 'percent' ? Math.round((userData.balance || 0) * promo.discount / 100) : promo.discount;

    await db.ref('users/' + currentUser.uid + '/gplusBalance').transaction((current) => {
      return (current || 0) + amount;
    });
    await db.ref('promoCodes/' + id + '/currentUses').transaction((current) => {
      return (current || 0) + 1;
    });

    showToast('Kode promo berhasil! +G' + formatNumber(amount) + ' GPay+', 'success');
    document.getElementById('promo-code-input').value = '';
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

// ===== QR CODE =====
function generateQRCode(uid) {
  const canvas = document.getElementById('qr-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = 200;

  // Simple QR-like pattern based on UID
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Generate deterministic pattern from UID
  const cellSize = 8;
  const gridSize = Math.floor(size / cellSize);
  const margin = 2;

  ctx.fillStyle = '#1a1a2e';

  // Position markers (top-left, top-right, bottom-left)
  drawQRMarker(ctx, 0, 0, cellSize);
  drawQRMarker(ctx, (gridSize - 7) * cellSize, 0, cellSize);
  drawQRMarker(ctx, 0, (gridSize - 7) * cellSize, cellSize);

  // Data pattern from UID hash
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash) + uid.charCodeAt(i);
    hash |= 0;
  }

  for (let y = margin; y < gridSize - margin; y++) {
    for (let x = margin; x < gridSize - margin; x++) {
      // Skip position markers
      if ((x < 8 && y < 8) || (x >= gridSize - 8 && y < 8) || (x < 8 && y >= gridSize - 8)) continue;

      // Deterministic fill
      const seed = (x * 31 + y * 37 + hash) & 0xff;
      if (seed % 3 === 0) {
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  }

  // Center logo area
  const centerX = (size - 40) / 2;
  const centerY = (size - 40) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(centerX - 4, centerY - 4, 48, 48);
  ctx.fillStyle = '#1a9fff';
  ctx.font = 'bold 24px Plus Jakarta Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('G', size / 2, size / 2);
}

function drawQRMarker(ctx, x, y, cellSize) {
  // Outer
  for (let i = 0; i < 7; i++) {
    ctx.fillRect(x + i * cellSize, y, cellSize, cellSize);
    ctx.fillRect(x + i * cellSize, y + 6 * cellSize, cellSize, cellSize);
    ctx.fillRect(x, y + i * cellSize, cellSize, cellSize);
    ctx.fillRect(x + 6 * cellSize, y + i * cellSize, cellSize, cellSize);
  }
  // Inner
  for (let i = 2; i < 5; i++) {
    for (let j = 2; j < 5; j++) {
      ctx.fillRect(x + i * cellSize, y + j * cellSize, cellSize, cellSize);
    }
  }
}

function switchQRTab(tab, el) {
  document.querySelectorAll('#page-qr .tab-btn').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('qr-myqr').classList.toggle('hidden', tab !== 'myqr');
  document.getElementById('qr-scan').classList.toggle('hidden', tab !== 'scan');
}

async function processScanPay() {
  if (!requireEmailVerified()) return;

  const uidOrEmail = document.getElementById('scan-uid').value.trim();
  const amount = parseInt(document.getElementById('scan-amount').value);
  const note = document.getElementById('scan-note').value.trim();

  if (!uidOrEmail) { showToast('Masukkan UID atau email', 'error'); return; }
  if (!amount || amount < 100) { showToast('Minimal G100', 'error'); return; }
  if (!userData || userData.balance < amount) { showToast('Saldo tidak cukup', 'error'); return; }

  const btn = event.target;
  toggleBtnLoading(btn, true);

  try {
    // Find user by UID or email
    let recipientUid = null;
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};

    for (const [uid, u] of Object.entries(users)) {
      if (uid === uidOrEmail || (u.email && u.email.toLowerCase() === uidOrEmail.toLowerCase())) {
        recipientUid = uid;
        break;
      }
    }

    if (!recipientUid || recipientUid === currentUser.uid) {
      showToast('Pengguna tidak ditemukan', 'error');
      toggleBtnLoading(btn, false);
      return;
    }

    // Transfer
    await db.ref('users/' + currentUser.uid + '/balance').transaction(c => (c || 0) >= amount ? (c || 0) - amount : undefined);
    await db.ref('users/' + recipientUid + '/balance').transaction(c => (c || 0) + amount);

    await db.ref('transactions').push({
      fromUid: currentUser.uid,
      toUid: recipientUid,
      type: 'qr_pay',
      amount,
      status: 'success',
      description: note || 'QR Pay',
      date: Date.now()
    });

    showToast('Pembayaran berhasil! G' + formatNumber(amount), 'success');
    document.getElementById('scan-uid').value = '';
    document.getElementById('scan-amount').value = '';
    document.getElementById('scan-note').value = '';
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
  toggleBtnLoading(btn, false);
}

// ===== G PROTECTION =====
function updateProtection() {
  if (!userData || !currentUser) return;
  let score = 0;
  const checks = [];

  // PIN
  if (userData.pin && userData.pin.length === 6) { score += 20; checks.push('pin'); }
  // Email
  if (currentUser.emailVerified) { score += 20; checks.push('email'); }
  // Phone
  if (userData.isPhoneVerified) { score += 20; checks.push('phone'); }
  // Biometric
  if (safeStorage.getItem('gpay_biometric') === 'true') { score += 20; checks.push('bio'); }
  // Strong password (always true if registered, as min 8 chars)
  score += 20; checks.push('pass');

  // Update circle
  const arc = document.getElementById('protection-arc');
  const circumference = 2 * Math.PI * 54; // 339.292
  const offset = circumference - (score / 100) * circumference;
  if (arc) arc.setAttribute('stroke-dashoffset', offset);

  setTextContent('protection-percent', score + '%');
  setTextContent('home-protection-score', score + '%');

  const homeFill = document.getElementById('home-protection-fill');
  if (homeFill) homeFill.style.width = score + '%';

  // Update protection items
  updateProtectionItem('prot-pin', checks.includes('pin'));
  updateProtectionItem('prot-email', checks.includes('email'));
  updateProtectionItem('prot-phone', checks.includes('phone'));
  updateProtectionItem('prot-bio', checks.includes('bio'));
  updateProtectionItem('prot-pass', checks.includes('pass'));

  // Update toggles
  const phoneToggle = document.getElementById('prot-phone-toggle');
  const bioToggle = document.getElementById('prot-bio-toggle');
  const settingsBioToggle = document.getElementById('settings-bio-toggle');
  const settingsPhoneToggle = document.getElementById('settings-phone-toggle');
  if (phoneToggle) phoneToggle.checked = checks.includes('phone');
  if (bioToggle) bioToggle.checked = checks.includes('bio');
  if (settingsBioToggle) settingsBioToggle.checked = checks.includes('bio');
  if (settingsPhoneToggle) settingsPhoneToggle.checked = checks.includes('phone');

  // Pass badge
  const passBadge = document.getElementById('pass-badge');
  if (passBadge) {
    passBadge.className = 'pi-badge done';
  }
  setTextContent('pass-strength-text', 'Password kuat ✓');

  // PIN button
  const pinItem = document.getElementById('prot-pin');
  if (pinItem && checks.includes('pin')) {
    const btn = pinItem.querySelector('.btn');
    if (btn) { btn.textContent = 'Ubah'; }
  }

  // Save to DB
  db.ref('users/' + currentUser.uid + '/protectionScore').set(score);
}

function updateProtectionItem(id, isDone) {
  const el = document.getElementById(id);
  if (!el) return;
  if (isDone) {
    el.style.borderLeft = '3px solid var(--success)';
  } else {
    el.style.borderLeft = '';
  }
}

function togglePhoneVerify() {
  if (!currentUser) return;
  const isChecked = document.getElementById('prot-phone-toggle')?.checked || document.getElementById('settings-phone-toggle')?.checked;
  db.ref('users/' + currentUser.uid + '/isPhoneVerified').set(!!isChecked);
  showToast(isChecked ? 'Nomor HP diverifikasi' : 'Verifikasi HP dibatalkan', isChecked ? 'success' : 'warning');
}

function toggleBiometric() {
  const isChecked = document.getElementById('prot-bio-toggle')?.checked || document.getElementById('settings-bio-toggle')?.checked;
  safeStorage.setItem('gpay_biometric', isChecked ? 'true' : 'false');
  showToast(isChecked ? 'Biometrik diaktifkan' : 'Biometrik dinonaktifkan', isChecked ? 'success' : 'warning');
  updateProtection();
}

// ===== PIN =====
function pinNext(input) {
  if (input.value && input.nextElementSibling) {
    input.nextElementSibling.focus();
  }
}

function pinPrev(e, input) {
  if (e.key === 'Backspace' && !input.value && input.previousElementSibling) {
    input.previousElementSibling.focus();
  }
}

async function savePin() {
  const inputs = document.querySelectorAll('#set-pin-modal .pin-input');
  let pin = '';
  inputs.forEach(inp => pin += inp.value);

  if (pin.length !== 6) {
    showToast('Masukkan PIN 6 digit', 'error');
    return;
  }

  try {
    await db.ref('users/' + currentUser.uid + '/pin').set(pin);
    showToast('PIN berhasil disimpan', 'success');
    hideModal('set-pin-modal');
    inputs.forEach(inp => inp.value = '');
    updateProtection();
  } catch (err) {
    showToast('Gagal menyimpan PIN', 'error');
  }
}

// ===== CHANGE PASSWORD =====
async function changePassword() {
  const oldPass = document.getElementById('old-password').value;
  const newPass = document.getElementById('new-password').value;
  const confirmPass = document.getElementById('confirm-new-password').value;

  if (!oldPass || !newPass || !confirmPass) {
    showToast('Lengkapi semua field', 'error');
    return;
  }
  if (newPass !== confirmPass) {
    showToast('Password baru tidak cocok', 'error');
    return;
  }
  if (newPass.length < 8) {
    showToast('Password minimal 8 karakter', 'error');
    return;
  }

  try {
    // Re-authenticate
    const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, oldPass);
    await currentUser.reauthenticateWithCredential(credential);
    await currentUser.updatePassword(newPass);
    showToast('Password berhasil diubah', 'success');
    hideModal('change-password-modal');
    document.getElementById('old-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-new-password').value = '';
  } catch (err) {
    showToast(getAuthError(err.code), 'error');
  }
}

// ===== SAVE PROFILE =====
async function saveProfile() {
  const name = document.getElementById('settings-name').value.trim();
  const phone = document.getElementById('settings-phone').value.trim();

  if (!name) {
    showToast('Nama tidak boleh kosong', 'error');
    return;
  }

  try {
    await db.ref('users/' + currentUser.uid).update({
      fullName: name,
      phone: phone
    });
    await currentUser.updateProfile({ displayName: name });
    showToast('Profil berhasil disimpan', 'success');
  } catch (err) {
    showToast('Gagal menyimpan: ' + err.message, 'error');
  }
}

// ===== BILLS =====
function listenBills(uid) {
  db.ref('bills').orderByChild('uid').equalTo(uid).on('value', (snap) => {
    const data = snap.val();
    renderBills(data);
  });
}

let allBills = {};
let currentBillFilter = 'all';

function renderBills(data) {
  allBills = data || {};
  const container = document.getElementById('bills-list');

  const items = Object.entries(allBills).filter(([id, b]) => {
    if (currentBillFilter === 'all') return true;
    return b.category === currentBillFilter;
  });

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-file-invoice"></i><p>Belum ada tagihan</p></div>';
    return;
  }

  container.innerHTML = items.map(([id, bill]) => {
    const iconMap = { listrik: 'fa-bolt', air: 'fa-tint', internet: 'fa-wifi', bpjs: 'fa-hospital' };
    const icon = iconMap[bill.category] || 'fa-file-invoice';
    return `
      <div class="bill-item" onclick="payBill('${id}')">
        <div class="bill-icon-circle"><i class="fas ${icon}"></i></div>
        <div class="bill-info">
          <strong>${bill.name}</strong>
          <small>${bill.category.toUpperCase()} • ${bill.accountNumber}</small>
        </div>
        <span class="tx-amount negative">G${formatNumber(bill.amount)}</span>
      </div>
    `;
  }).join('');
}

function filterBills(category, el) {
  currentBillFilter = category;
  document.querySelectorAll('#page-bills .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderBills(allBills);
}

async function addBill() {
  const category = document.getElementById('bill-category').value;
  const account = document.getElementById('bill-account').value.trim();
  const name = document.getElementById('bill-name').value.trim();
  const amount = parseInt(document.getElementById('bill-amount').value);

  if (!category || !account || !name || !amount) {
    showToast('Lengkapi semua field', 'error');
    return;
  }

  try {
    await db.ref('bills').push({
      uid: currentUser.uid,
      category,
      accountNumber: account,
      name,
      amount
    });
    showToast('Tagihan ditambahkan', 'success');
    hideModal('add-bill-modal');
    document.getElementById('bill-category').value = '';
    document.getElementById('bill-account').value = '';
    document.getElementById('bill-name').value = '';
    document.getElementById('bill-amount').value = '';
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

async function payBill(billId) {
  if (!requireEmailVerified()) return;

  const bill = allBills[billId];
  if (!bill) return;

  if (!userData || userData.balance < bill.amount) {
    showToast('Saldo tidak cukup', 'error');
    return;
  }

  if (!confirm(`Bayar tagihan ${bill.name} sebesar G${formatNumber(bill.amount)}?`)) return;

  try {
    await db.ref('users/' + currentUser.uid + '/balance').transaction(c => {
      if ((c || 0) < bill.amount) return;
      return (c || 0) - bill.amount;
    });

    await db.ref('transactions').push({
      fromUid: currentUser.uid,
      toUid: 'system',
      type: 'bill',
      amount: bill.amount,
      status: 'success',
      description: 'Bayar ' + bill.name + ' (' + bill.category + ')',
      date: Date.now()
    });

    // Remove bill after payment
    await db.ref('bills/' + billId).remove();

    showToast('Tagihan berhasil dibayar!', 'success');
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

// ===== CARDS =====
async function addCard() {
  const number = document.getElementById('card-number').value.trim();
  const exp = document.getElementById('card-exp').value.trim();
  const cvv = document.getElementById('card-cvv').value.trim();
  const name = document.getElementById('card-name').value.trim();

  if (!number || !exp || !cvv || !name) {
    showToast('Lengkapi semua field', 'error');
    return;
  }

  try {
    const cardsRef = db.ref('users/' + currentUser.uid + '/cards');
    const snap = await cardsRef.once('value');
    const cards = snap.val() || [];
    cards.push({
      number: number.replace(/\s/g, '').slice(-4),
      expiry: exp,
      name: name,
      addedAt: Date.now()
    });
    await cardsRef.set(cards);
    showToast('Kartu ditambahkan', 'success');
    hideModal('add-card-modal');

    // Clear form
    document.getElementById('card-number').value = '';
    document.getElementById('card-exp').value = '';
    document.getElementById('card-cvv').value = '';
    document.getElementById('card-name').value = '';

    // Re-render payment methods
    renderPaymentMethods(cards);
  } catch (err) {
    showToast('Gagal: ' + err.message, 'error');
  }
}

function renderPaymentMethods(cards) {
  const container = document.getElementById('payment-methods');
  let html = `
    <div class="payment-method">
      <div class="pm-icon"><i class="fas fa-wallet"></i></div>
      <div class="pm-info">
        <span class="pm-name">GPay Wallet</span>
        <span class="pm-desc">Saldo utama</span>
      </div>
      <i class="fas fa-check-circle pm-check"></i>
    </div>
  `;

  if (cards && cards.length > 0) {
    cards.forEach(card => {
      html += `
        <div class="payment-method">
          <div class="pm-icon" style="background:#fef3c7;color:#f59e0b;"><i class="fas fa-credit-card"></i></div>
          <div class="pm-info">
            <span class="pm-name">•••• ${card.number}</span>
            <span class="pm-desc">${card.name} • ${card.expiry}</span>
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

// ===== DARK MODE =====
function toggleDarkMode() {
  const isDark = document.getElementById('dark-mode-toggle').checked;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  safeStorage.setItem('gpay_dark_mode', isDark ? 'true' : 'false');
}

// Initialize dark mode from storage
(function initDarkMode() {
  const isDark = safeStorage.getItem('gpay_dark_mode') === 'true';
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    setTimeout(() => {
      const toggle = document.getElementById('dark-mode-toggle');
      if (toggle) toggle.checked = true;
    }, 100);
  }
})();

// ===== BALANCE TOGGLE =====
function toggleBalance() {
  balanceHidden = !balanceHidden;
  const icon = document.querySelector('#eye-toggle i');
  icon.className = balanceHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
  if (userData) updateBalanceDisplay(userData.balance || 0, userData.gplusBalance || 0);
}

// ===== PROMO SLIDER =====
function startPromoSlider() {
  const track = document.getElementById('promo-track');
  const slides = track.querySelectorAll('.promo-slide');
  const dotsContainer = document.getElementById('promo-dots');

  // Create dots
  dotsContainer.innerHTML = '';
  slides.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'promo-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => scrollToSlide(i));
    dotsContainer.appendChild(dot);
  });

  // Auto slide
  if (promoInterval) clearInterval(promoInterval);
  promoInterval = setInterval(() => {
    currentPromoSlide = (currentPromoSlide + 1) % slides.length;
    scrollToSlide(currentPromoSlide);
  }, 4000);

  // Detect scroll
  track.addEventListener('scroll', () => {
    const slideWidth = slides[0].offsetWidth + 12; // gap
    const index = Math.round(track.scrollLeft / slideWidth);
    if (index !== currentPromoSlide) {
      currentPromoSlide = index;
      updatePromoDots();
    }
  });
}

function scrollToSlide(index) {
  const track = document.getElementById('promo-track');
  const slides = track.querySelectorAll('.promo-slide');
  if (!slides[index]) return;
  const slideWidth = slides[0].offsetWidth + 12;
  track.scrollTo({ left: slideWidth * index, behavior: 'smooth' });
  currentPromoSlide = index;
  updatePromoDots();
}

function updatePromoDots() {
  document.querySelectorAll('.promo-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === currentPromoSlide);
  });
}

// ===== FAQ =====
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  item.classList.toggle('open');
}

// ===== PASSWORD TOGGLE =====
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
}

// ===== MODALS =====
function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('show');
    // Animate content
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.animation = 'none';
      content.offsetHeight;
      content.style.animation = '';
    }
  }
}

function hideModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('show');
}

// Close modal on backdrop click
document.querySelectorAll('.modal-overlay').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
    }
  });
});

// ===== TOAST =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconMap = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  };

  toast.innerHTML = `
    <i class="fas ${iconMap[type] || iconMap.info}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ===== UTILITY =====
function formatNumber(num) {
  return new Intl.NumberFormat('id-ID').format(num || 0);
}

function formatDate(timestamp) {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  const options = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  return d.toLocaleDateString('id-ID', options);
}

function formatDateShort(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Baru saja';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'j';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function setTextContent(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function toggleBtnLoading(btn, loading) {
  if (!btn) return;
  const loader = btn.querySelector('.btn-loader');
  if (loader) {
    loader.classList.toggle('hidden', !loading);
  }
  btn.disabled = loading;
}

function getTypeLabel(type) {
  const map = {
    transfer: 'Transfer',
    topup: 'Isi Saldo',
    pulsa: 'Pulsa',
    bill: 'Tagihan',
    reward: 'Reward',
    qr_pay: 'QR Pay',
    cashback: 'Cashback'
  };
  return map[type] || type || 'Transaksi';
}

function getAuthError(code) {
  const errors = {
    'auth/user-not-found': 'Email tidak terdaftar',
    'auth/wrong-password': 'Password salah',
    'auth/email-already-in-use': 'Email sudah terdaftar',
    'auth/weak-password': 'Password terlalu lemah',
    'auth/invalid-email': 'Email tidak valid',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti',
    'auth/network-request-failed': 'Gagal terhubung ke server',
    'auth/invalid-credential': 'Email atau password salah',
    'auth/requires-recent-login': 'Silakan login ulang untuk operasi ini'
  };
  return errors[code] || 'Terjadi kesalahan. Silakan coba lagi.';
}

// ===== KEYBOARD HANDLING =====
// Prevent zoom on double tap for inputs on iOS
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, false);

// ===== SERVICE WORKER (if needed) =====
// For offline support, we'd register a SW here

// ===== LISTRIK PAGE =====
let selectedListrikAmount = 0;
let selectedListrikType = 'prepaid';

function selectListrikType(type, el) {
  selectedListrikType = type;
  if (el) el.parentElement.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  const pkgSection = document.getElementById('listrik-packages');
  if (pkgSection) {
    pkgSection.style.display = type === 'prepaid' ? 'block' : 'none';
  }
}

function selectListrikPackage(amount) {
  selectedListrikAmount = amount;
  document.querySelectorAll('#listrik-packages .package-card').forEach(c => c.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
}

async function payListrik() {
  if (!requireEmailVerified()) return;
  const meterId = document.getElementById('listrik-meter-id').value.trim();
  if (!meterId) { showToast('Masukkan nomor meter/ID pelanggan', 'error'); return; }
  if (selectedListrikType === 'prepaid' && !selectedListrikAmount) {
    showToast('Pilih nominal token', 'error'); return;
  }
  const amount = selectedListrikType === 'prepaid' ? selectedListrikAmount : 0;
  if (amount > 0 && (userData.balance || 0) < amount) {
    showToast('Saldo tidak cukup', 'error'); return;
  }
  if (amount > 0) {
    const newBalance = (userData.balance || 0) - amount;
    await db.ref('users/' + currentUser.uid + '/balance').set(newBalance);
    const txId = db.ref('transactions').push().key;
    await db.ref('transactions/' + txId).set({
      type: 'payment',
      from: currentUser.uid,
      amount: amount,
      description: 'Listrik ' + selectedListrikType + ' - ' + meterId,
      status: 'completed',
      timestamp: Date.now()
    });
    showToast('Pembayaran listrik berhasil! Token: ' + Math.random().toString().substring(2, 22), 'success');
    goBack();
  } else {
    showToast('Tagihan akan dicek. Fitur sedang dalam pengembangan.', 'info');
  }
}

console.log('GPay v3 initialized');
