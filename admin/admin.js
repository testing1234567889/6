/* ============================================================
   GPay v3 — Admin Dashboard — Complete JavaScript
   All Firebase functions, CRUD, approvals, modals, themes
   [FIXED]: promo field names, tx type filter, active field
============================================================ */

// ========== FIREBASE INIT ==========
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
const ADMIN_UID = "EsmlqXOnu4VDvCbHp89R0h6ec0R2";

// ========== STATE ==========
let allUsers = {};
let allTransactions = {};
let allMessages = {};
let allPromos = {};
let allTopupRequests = {};
let allBills = {};
let currentTopupFilter = 'pending';
let currentUser = null;
let listeners = [];

// ========== AUTH ==========
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

auth.onAuthStateChanged(user => {
  if (user) {
    if (user.uid === ADMIN_UID) {
      currentUser = user;
      document.getElementById('login-page').style.display = 'none';
      document.getElementById('denied-page').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      initDashboard();
    } else {
      document.getElementById('login-page').style.display = 'none';
      document.getElementById('denied-page').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
    }
  } else {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('denied-page').style.display = 'none';
    document.getElementById('app').style.display = 'none';
    detachListeners();
  }
});

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn   = document.getElementById('loginBtn');
  if (!email || !pass) { showLoginError('Email dan password harus diisi'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Masuk...';
  errEl.style.display = 'none';
  auth.signInWithEmailAndPassword(email, pass)
    .catch(e => showLoginError(translateError(e.code)))
    .finally(() => { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Masuk'; });
}

function doRegister() {
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPassword').value;
  const btn   = document.getElementById('regBtn');
  if (!email || !pass) { showLoginError('Email dan password harus diisi'); return; }
  if (pass.length < 6) { showLoginError('Password minimal 6 karakter'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Mendaftar...';
  document.getElementById('loginError').style.display = 'none';
  auth.createUserWithEmailAndPassword(email, pass)
    .catch(e => showLoginError(translateError(e.code)))
    .finally(() => { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> Daftar & Masuk'; });
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.style.display = 'block';
}

function translateError(code) {
  const map = {
    'auth/user-not-found': 'Akun tidak ditemukan',
    'auth/wrong-password': 'Password salah',
    'auth/invalid-email': 'Format email tidak valid',
    'auth/email-already-in-use': 'Email sudah terdaftar',
    'auth/weak-password': 'Password terlalu lemah',
    'auth/invalid-credential': 'Email atau password salah',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
  };
  return map[code] || 'Terjadi kesalahan. Coba lagi.';
}

function toggleRegister(show) {
  document.getElementById('loginForm').style.display    = show ? 'none'  : 'block';
  document.getElementById('registerForm').style.display = show ? 'block' : 'none';
  document.getElementById('loginError').style.display   = 'none';
}

function forceSignOut() { auth.signOut().then(() => location.reload()); }

function doLogout() {
  showConfirm('Logout', 'Yakin ingin keluar dari dashboard admin?', () => auth.signOut());
}

function changePassword() {
  const pass = document.getElementById('newPassword').value;
  if (!pass || pass.length < 6) { toast('Password minimal 6 karakter', 'error'); return; }
  currentUser.updatePassword(pass)
    .then(() => { toast('Password berhasil diubah', 'success'); document.getElementById('newPassword').value = ''; })
    .catch(e => toast('Gagal: ' + e.message, 'error'));
}

// ========== INIT DASHBOARD ==========
function initDashboard() {
  const email   = currentUser.email || 'Admin';
  const initial = email.charAt(0).toUpperCase();
  const el = id => document.getElementById(id);
  if (el('sidebarAvatar'))    el('sidebarAvatar').textContent    = initial;
  if (el('headerAvatar'))     el('headerAvatar').textContent     = initial;
  if (el('sidebarName'))      el('sidebarName').textContent      = email.split('@')[0];
  if (el('settingsEmail'))    el('settingsEmail').textContent    = email;
  if (el('settingsUid'))      el('settingsUid').textContent      = currentUser.uid;
  if (el('settingsLastLogin')) el('settingsLastLogin').textContent =
    currentUser.metadata.lastSignInTime
      ? new Date(currentUser.metadata.lastSignInTime).toLocaleString('id-ID')
      : '-';
  attachListeners();
}

function attachListeners() {
  detachListeners();
  const refs = [
    { path: 'users',          key: 'allUsers' },
    { path: 'transactions',   key: 'allTransactions' },
    { path: 'messages',       key: 'allMessages' },
    { path: 'promoCodes',     key: 'allPromos' },
    { path: 'topupRequests',  key: 'allTopupRequests' },
    { path: 'bills',          key: 'allBills' },
  ];
  refs.forEach(({ path, key }) => {
    const ref = db.ref(path);
    ref.on('value', snap => {
      window[key] = snap.val() || {};
      if (key === 'allUsers')         allUsers         = window[key];
      if (key === 'allTransactions')  allTransactions  = window[key];
      if (key === 'allMessages')      allMessages      = window[key];
      if (key === 'allPromos')        allPromos        = window[key];
      if (key === 'allTopupRequests') allTopupRequests = window[key];
      if (key === 'allBills')         allBills         = window[key];
      onDataUpdate();
    });
    listeners.push({ ref, event: 'value' });
  });
}

function detachListeners() { listeners.forEach(l => l.ref.off(l.event)); listeners = []; }

function refreshAllData() { toast('Memperbarui data...', 'info'); attachListeners(); }

// ========== DATA UPDATE HANDLER ==========
function onDataUpdate() {
  try {
    updateStats(); renderChart(); renderActivity();
    renderUsers(); renderTopup(); renderTransactions();
    renderPromos(); renderBroadcastHistory(); renderBills();
    updatePendingBadge(); updateBroadcastUserSelect();
  } catch (e) { console.error('Data update error:', e); }
}

// ========== NAVIGATION ==========
function navigateTo(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('sec-' + section);
  if (sec) sec.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (nav) nav.classList.add('active');
  if (window.innerWidth <= 1024) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}

function handleGlobalSearch(e) {
  if (e.key === 'Enter') {
    const q = e.target.value.trim();
    if (q) { document.getElementById('userSearch').value = q; navigateTo('users'); renderUsers(); }
  }
}

// ========== STATS ==========
function updateStats() {
  const usersArr = Object.values(allUsers);
  const txArr    = Object.values(allTransactions);
  const msgArr   = Object.values(allMessages);
  const promoArr = Object.values(allPromos);
  const topupArr = Object.values(allTopupRequests);

  animateCount('statUsers', usersArr.length);
  const totalBalance = usersArr.reduce((s, u) => s + parseFloat(u.balance || u.saldo || 0), 0);
  animateCountCurrency('statBalance', totalBalance);
  const pendingCount = topupArr.filter(t => (t.status || '').toLowerCase() === 'pending').length;
  animateCount('statPending', pendingCount);
  animateCount('statTransactions', txArr.length);
  animateCount('statMessages', msgArr.length);
  // FIX: gunakan isActive (sesuai app.js)
  const activePromos = promoArr.filter(p => p.isActive !== false).length;
  animateCount('statPromos', activePromos);
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  if (start === target) { el.textContent = target; return; }
  const duration = 600, startTime = performance.now();
  function tick(now) {
    const p    = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * ease);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateCountCurrency(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = parseCurrency(el.textContent);
  if (current === target) { el.textContent = formatRp(target); return; }
  const duration = 600, startTime = performance.now();
  function tick(now) {
    const p    = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = formatRp(Math.round(current + (target - current) * ease));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function parseCurrency(str) { return parseInt((str || '0').replace(/[^\d]/g, '')) || 0; }

// ========== CHART ==========
function renderChart() {
  const container = document.getElementById('chartBars');
  if (!container) return;
  const txArr = Object.values(allTransactions);
  const days = {}, labels = [];
  for (let i = 6; i >= 0; i--) {
    const d       = new Date();
    d.setDate(d.getDate() - i);
    const key     = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('id-ID', { weekday: 'short' });
    days[key] = 0;
    labels.push({ key, label: dayName });
  }
  txArr.forEach(tx => {
    const d   = tx.date || tx.timestamp || tx.createdAt || '';
    const key = typeof d === 'number' ? new Date(d).toISOString().split('T')[0] : String(d).split('T')[0];
    if (days[key] !== undefined) days[key]++;
  });
  const max = Math.max(...Object.values(days), 1);
  container.innerHTML = labels.map(l => {
    const h = Math.max((days[l.key] / max) * 180, 4);
    return `<div class="chart-bar-wrapper">
      <div class="chart-bar" style="--bar-h:${h}px;height:${h}px">
        <span class="chart-bar-value">${days[l.key]}</span>
      </div>
      <span class="chart-label">${l.label}</span>
    </div>`;
  }).join('');
}

// ========== ACTIVITY FEED ==========
function renderActivity() {
  const list = document.getElementById('activityList');
  if (!list) return;
  const txArr = Object.entries(allTransactions).map(([id, tx]) => ({ id, ...tx }));
  txArr.sort((a, b) => getTimestamp(b) - getTimestamp(a));
  const recent = txArr.slice(0, 10);
  if (!recent.length) {
    list.innerHTML = '<li class="empty-state"><i class="fas fa-inbox"></i><h3>Belum ada aktivitas</h3></li>';
    return;
  }
  list.innerHTML = recent.map(tx => {
    const type      = (tx.type || 'send').toLowerCase();
    const iconClass = type === 'send' ? 'send' : type === 'receive' ? 'receive' : type === 'topup' ? 'topup' : 'payment';
    const icon      = type === 'transfer' ? 'fa-paper-plane' : type === 'topup' ? 'fa-wallet' : type === 'reward' ? 'fa-trophy' : type === 'pulsa' ? 'fa-mobile-screen-button' : 'fa-credit-card';
    const fromName  = getUserName(tx.fromUid || tx.from);
    const toName    = getUserName(tx.toUid   || tx.to);
    const desc      = type === 'topup'    ? `<strong>${fromName}</strong> topup ${formatRp(tx.amount||0)}`
                    : type === 'transfer' ? `<strong>${fromName}</strong> kirim ${formatRp(tx.amount||0)} ke <strong>${toName}</strong>`
                    : type === 'reward'   ? `<strong>${toName}</strong> dapat reward ${formatRp(tx.amount||0)}`
                    : `${tx.description || type} ${formatRp(tx.amount||0)}`;
    return `<li class="activity-item">
      <div class="activity-icon ${iconClass}"><i class="fas ${icon}"></i></div>
      <div class="activity-text">${desc}</div>
      <span class="activity-time">${formatTimeAgo(getTimestamp(tx))}</span>
    </li>`;
  }).join('');
}

// ========== USERS ==========
function renderUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  const search = (document.getElementById('userSearch')?.value || '').toLowerCase();
  let arr = Object.entries(allUsers).map(([uid, u]) => ({ uid, ...u }));
  if (search) arr = arr.filter(u => {
    const name  = (u.name || u.displayName || u.fullName || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    return name.includes(search) || email.includes(search);
  });
  if (!arr.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-users"></i><h3>Tidak ada user ditemukan</h3></div></td></tr>';
    return;
  }
  tbody.innerHTML = arr.map(u => {
    const name     = u.name || u.displayName || u.fullName || 'No Name';
    const email    = u.email || '-';
    const phone    = u.phone || u.phoneNumber || '-';
    const balance  = formatRp(u.balance || u.saldo || 0);
    const verified = u.verified || u.emailVerified || u.isEmailVerified;
    const joined   = u.createdAt || u.joinDate || u.registeredAt;
    const joinStr  = joined ? formatDate(joined) : '-';
    const color    = stringToColor(name);
    return `<tr>
      <td data-label="User"><div class="user-cell"><div class="user-avatar" style="background:${color}">${name.charAt(0).toUpperCase()}</div><div><div class="fw-600">${esc(name)}</div></div></div></td>
      <td data-label="Email">${esc(email)}</td>
      <td data-label="Telepon">${esc(phone)}</td>
      <td data-label="Saldo" class="fw-600">${balance}</td>
      <td data-label="Status"><span class="badge-status ${verified ? 'badge-success' : 'badge-neutral'}">${verified ? '<i class="fas fa-check-circle"></i> Verified' : 'Unverified'}</span></td>
      <td data-label="Bergabung">${joinStr}</td>
      <td data-label="Aksi">
        <button class="btn btn-outline btn-xs" onclick="showUserDetail('${u.uid}')"><i class="fas fa-eye"></i></button>
        <button class="btn btn-outline btn-xs" onclick="adjustBalanceModal('${u.uid}')"><i class="fas fa-coins"></i></button>
        <button class="btn btn-outline btn-xs" onclick="sendMessageToUserModal('${u.uid}')"><i class="fas fa-envelope"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function showUserDetail(uid) {
  const u = allUsers[uid];
  if (!u) return;
  const name   = u.name || u.displayName || u.fullName || 'No Name';
  const panel  = document.getElementById('userDetailPanel');
  const body   = document.getElementById('userDetailBody');
  const userTx = Object.entries(allTransactions)
    .filter(([, tx]) => tx.fromUid===uid || tx.toUid===uid || tx.from===uid || tx.to===uid)
    .map(([id, tx]) => ({ id, ...tx }))
    .sort((a, b) => getTimestamp(b) - getTimestamp(a))
    .slice(0, 20);
  body.innerHTML = `
    <div style="text-align:center;margin-bottom:24px">
      <div class="user-avatar" style="width:64px;height:64px;font-size:1.5rem;margin:0 auto 12px;background:${stringToColor(name)}">${name.charAt(0).toUpperCase()}</div>
      <h3 style="font-size:1.1rem;font-weight:700">${esc(name)}</h3>
      <p class="text-muted" style="font-size:.85rem">${esc(u.email||'')||''}</p>
    </div>
    <div class="detail-section"><h4>Informasi</h4>
      <div class="detail-row"><span class="label">UID</span><span class="value" style="font-size:.7rem;word-break:break-all">${uid}</span></div>
      <div class="detail-row"><span class="label">Telepon</span><span class="value">${esc(u.phone||u.phoneNumber||'-')}</span></div>
      <div class="detail-row"><span class="label">Saldo</span><span class="value fw-700 text-success">${formatRp(u.balance||u.saldo||0)}</span></div>
      <div class="detail-row"><span class="label">Verified</span><span class="value">${(u.verified||u.emailVerified||u.isEmailVerified) ? '<span class="badge-status badge-success">Ya</span>' : '<span class="badge-status badge-neutral">Tidak</span>'}</span></div>
      <div class="detail-row"><span class="label">Bergabung</span><span class="value">${formatDate(u.createdAt||u.joinDate||u.registeredAt)}</span></div>
    </div>
    <div class="detail-section"><h4>Riwayat Transaksi (${userTx.length})</h4>
      ${userTx.length ? userTx.map(tx => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:.8rem">
          <span><span class="badge-status ${tx.type==='transfer'?'badge-info':tx.type==='topup'?'badge-warning':'badge-success'}">${tx.type||'tx'}</span></span>
          <span class="fw-600">${formatRp(tx.amount||0)}</span>
          <span class="text-muted">${formatDate(getTimestamp(tx))}</span>
        </div>`).join('') : '<p class="text-muted" style="font-size:.85rem">Belum ada transaksi</p>'}
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary btn-sm" style="flex:1" onclick="adjustBalanceModal('${uid}')"><i class="fas fa-coins"></i> Adjust Saldo</button>
      <button class="btn btn-outline btn-sm" style="flex:1" onclick="sendMessageToUserModal('${uid}')"><i class="fas fa-envelope"></i> Kirim Pesan</button>
    </div>`;
  panel.classList.add('open');
}

function closeUserDetail() { document.getElementById('userDetailPanel').classList.remove('open'); }

function adjustBalanceModal(uid) {
  const u = allUsers[uid];
  if (!u) return;
  const name = u.name || u.displayName || u.fullName || 'User';
  document.getElementById('uaTitle').textContent = 'Adjust Saldo - ' + name;
  document.getElementById('uaBody').innerHTML = `
    <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:16px">Saldo saat ini: <strong>${formatRp(u.balance||u.saldo||0)}</strong></p>
    <div class="form-group-inline"><label>Saldo Baru</label>
      <input type="number" id="newBalanceInput" value="${u.balance||u.saldo||0}">
    </div>`;
  document.getElementById('uaFooter').innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="closeModal('userActionModal')">Batal</button>
    <button class="btn btn-primary btn-sm" onclick="doAdjustBalance('${uid}')">Simpan</button>`;
  openModal('userActionModal');
}

function doAdjustBalance(uid) {
  const newBal = parseInt(document.getElementById('newBalanceInput').value) || 0;
  const u = allUsers[uid];
  const updates = { balance: newBal };
  if (u && u.saldo !== undefined) updates.saldo = newBal;
  db.ref(`users/${uid}`).update(updates)
    .then(() => { toast('Saldo berhasil diperbarui', 'success'); closeModal('userActionModal'); })
    .catch(e => toast('Gagal: ' + e.message, 'error'));
}

function sendMessageToUserModal(uid) {
  const u = allUsers[uid];
  if (!u) return;
  const name = u.name || u.displayName || u.fullName || 'User';
  document.getElementById('uaTitle').textContent = 'Kirim Pesan ke ' + name;
  document.getElementById('uaBody').innerHTML = `
    <div class="form-group-inline"><label>Judul</label><input type="text" id="dmTitle" placeholder="Judul pesan..."></div>
    <div class="form-group-inline"><label>Pesan</label><textarea id="dmBody" placeholder="Tulis pesan..."></textarea></div>`;
  document.getElementById('uaFooter').innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="closeModal('userActionModal')">Batal</button>
    <button class="btn btn-primary btn-sm" onclick="doSendDM('${uid}')">Kirim</button>`;
  openModal('userActionModal');
}

function doSendDM(uid) {
  const title = document.getElementById('dmTitle').value.trim();
  const body  = document.getElementById('dmBody').value.trim();
  if (!title || !body) { toast('Judul dan pesan harus diisi', 'error'); return; }
  const msgId = db.ref('messages').push().key;
  db.ref('messages/' + msgId).set({ title, body, type: 'info', targetUid: uid, toUid: uid, from: 'admin', timestamp: Date.now(), date: Date.now(), isRead: false })
    .then(() => { toast('Pesan terkirim', 'success'); closeModal('userActionModal'); })
    .catch(e => toast('Gagal: ' + e.message, 'error'));
}

// ========== TOPUP APPROVALS ==========
function setTopupFilter(filter) {
  currentTopupFilter = filter;
  document.querySelectorAll('#topupTabs .tab-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  renderTopup();
}

function renderTopup() {
  const tbody = document.getElementById('topupTableBody');
  if (!tbody) return;
  let arr = Object.entries(allTopupRequests).map(([id, t]) => ({ id, ...t }));
  if (currentTopupFilter !== 'all') arr = arr.filter(t => (t.status || 'pending').toLowerCase() === currentTopupFilter);
  arr.sort((a, b) => getTimestamp(b) - getTimestamp(a));
  if (!arr.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><i class="fas fa-inbox"></i><h3>Tidak ada permintaan topup</h3></div></td></tr>';
    return;
  }
  tbody.innerHTML = arr.map(t => {
    const userName   = getUserName(t.uid || t.userId);
    const status     = (t.status || 'pending').toLowerCase();
    const badgeClass = status === 'approved' ? 'badge-success' : status === 'rejected' ? 'badge-danger' : 'badge-warning';
    const actions    = status === 'pending'
      ? `<button class="btn btn-success btn-xs" onclick="approveTopup('${t.id}')"><i class="fas fa-check"></i> Approve</button>
         <button class="btn btn-danger btn-xs" onclick="rejectTopup('${t.id}')"><i class="fas fa-times"></i> Reject</button>`
      : '<span class="text-muted" style="font-size:.8rem">Selesai</span>';
    return `<tr>
      <td data-label="User" class="fw-600">${esc(userName)}</td>
      <td data-label="Jumlah" class="fw-700">G${formatNumber(t.amount||0)}</td>
      <td data-label="Tanggal">${formatDate(getTimestamp(t))}</td>
      <td data-label="Status"><span class="badge-status ${badgeClass}">${capitalize(status)}</span></td>
      <td data-label="Aksi">${actions}</td>
    </tr>`;
  }).join('');
}

function approveTopup(id) {
  const t = allTopupRequests[id];
  if (!t) { toast('Data topup tidak ditemukan', 'error'); return; }
  const uid      = t.uid || t.userId;
  const amount   = parseInt(t.amount) || 0;
  const userName = getUserName(uid);
  showConfirm('Approve Topup', `Approve topup G${formatNumber(amount)} untuk ${userName}?`, async () => {
    try {
      await db.ref(`users/${uid}/balance`).transaction(current => (current || 0) + amount);
      await db.ref(`topupRequests/${id}`).update({ status: 'approved', approvedDate: Date.now(), approvedBy: ADMIN_UID });
      await db.ref('transactions').push({ fromUid: 'system', toUid: uid, type: 'topup', amount, status: 'success', description: 'Isi Saldo - Admin Approved', date: Date.now() });
      toast(`Topup G${formatNumber(amount)} untuk ${userName} berhasil di-approve!`, 'success');
    } catch(e) { console.error(e); toast('Gagal approve: ' + e.message, 'error'); }
  });
}

function rejectTopup(id) {
  const t = allTopupRequests[id];
  if (!t) { toast('Data topup tidak ditemukan', 'error'); return; }
  showConfirm('Reject Topup', `Reject topup G${formatNumber(t.amount||0)}?`, async () => {
    try {
      await db.ref(`topupRequests/${id}`).update({ status: 'rejected', approvedDate: Date.now(), approvedBy: ADMIN_UID });
      toast('Topup ditolak', 'success');
    } catch(e) { toast('Gagal reject: ' + e.message, 'error'); }
  });
}

function updatePendingBadge() {
  const count = Object.values(allTopupRequests).filter(t => (t.status || '').toLowerCase() === 'pending').length;
  const badge = document.getElementById('pendingBadge');
  const dot   = document.getElementById('notifDot');
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline' : 'none'; }
  if (dot)   dot.style.display = count > 0 ? 'block' : 'none';
}

// ========== TRANSACTIONS ==========
function renderTransactions() {
  const tbody      = document.getElementById('txTableBody');
  if (!tbody) return;
  const search     = (document.getElementById('txSearch')?.value || '').toLowerCase();
  // FIX: filter values sesuai tipe yang dipakai app.js
  const typeFilter = document.getElementById('txTypeFilter')?.value || 'all';
  const dateFrom   = document.getElementById('txDateFrom')?.value;
  const dateTo     = document.getElementById('txDateTo')?.value;

  let arr = Object.entries(allTransactions).map(([id, tx]) => ({ id, ...tx }));
  if (typeFilter !== 'all') arr = arr.filter(tx => (tx.type || '').toLowerCase() === typeFilter);
  if (search) arr = arr.filter(tx => {
    const id   = (tx.id || '').toLowerCase();
    const from = getUserName(tx.fromUid || tx.from || tx.senderUid).toLowerCase();
    const to   = getUserName(tx.toUid || tx.to || tx.receiverUid).toLowerCase();
    return id.includes(search) || from.includes(search) || to.includes(search);
  });
  if (dateFrom) { const df = new Date(dateFrom).getTime(); arr = arr.filter(tx => getTimestamp(tx) >= df); }
  if (dateTo)   { const dt = new Date(dateTo).getTime() + 86400000; arr = arr.filter(tx => getTimestamp(tx) <= dt); }
  arr.sort((a, b) => getTimestamp(b) - getTimestamp(a));

  if (!arr.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-exchange-alt"></i><h3>Tidak ada transaksi</h3></div></td></tr>';
    return;
  }
  tbody.innerHTML = arr.slice(0, 100).map(tx => {
    const from      = getUserName(tx.fromUid || tx.from || tx.senderUid);
    const to        = getUserName(tx.toUid || tx.to || tx.receiverUid);
    const type      = tx.type || '-';
    const status    = tx.status || 'completed';
    const badgeClass = (status === 'completed' || status === 'success') ? 'badge-success' : status === 'pending' ? 'badge-warning' : 'badge-danger';
    return `<tr onclick="showTxDetail('${tx.id}')" style="cursor:pointer">
      <td data-label="ID" style="font-size:.75rem;font-family:monospace">${esc((tx.id||''). substring(0,10))}...</td>
      <td data-label="Dari" class="fw-600">${esc(from)}</td>
      <td data-label="Ke" class="fw-600">${esc(to)}</td>
      <td data-label="Tipe"><span class="badge-status badge-info">${capitalize(type)}</span></td>
      <td data-label="Jumlah" class="fw-700">G${formatNumber(tx.amount||0)}</td>
      <td data-label="Status"><span class="badge-status ${badgeClass}">${capitalize(status)}</span></td>
      <td data-label="Tanggal">${formatDate(getTimestamp(tx))}</td>
    </tr>`;
  }).join('');
}

function showTxDetail(txId) {
  const tx = allTransactions[txId];
  if (!tx) return;
  const body = document.getElementById('txDetailBody');
  body.innerHTML = `
    <div class="detail-section"><h4>Informasi Transaksi</h4>
      <div class="detail-row"><span class="label">ID</span><span class="value" style="font-size:.75rem;word-break:break-all">${txId}</span></div>
      <div class="detail-row"><span class="label">Tipe</span><span class="value"><span class="badge-status badge-info">${capitalize(tx.type||'-')}</span></span></div>
      <div class="detail-row"><span class="label">Dari</span><span class="value">${esc(getUserName(tx.fromUid||tx.from||tx.senderUid))}</span></div>
      <div class="detail-row"><span class="label">Ke</span><span class="value">${esc(getUserName(tx.toUid||tx.to||tx.receiverUid))}</span></div>
      <div class="detail-row"><span class="label">Jumlah</span><span class="value fw-700 text-success">G${formatNumber(tx.amount||0)}</span></div>
      <div class="detail-row"><span class="label">Status</span><span class="value">${capitalize(tx.status||'completed')}</span></div>
      <div class="detail-row"><span class="label">Tanggal</span><span class="value">${formatDate(getTimestamp(tx))}</span></div>
      ${tx.description ? `<div class="detail-row"><span class="label">Deskripsi</span><span class="value">${esc(tx.description)}</span></div>` : ''}
    </div>`;
  openModal('txDetailModal');
}

// ========== PROMO CODES ==========
// FIX: semua field sekarang pakai nama yang sama dengan app.js
// (isActive, discount, expiryDate)

function renderPromos() {
  const container = document.getElementById('promoList');
  if (!container) return;
  const arr = Object.entries(allPromos).map(([id, p]) => ({ id, ...p }));
  if (!arr.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-ticket"></i><h3>Belum ada promo</h3><p>Buat promo baru dari form di samping</p></div>';
    return;
  }
  container.innerHTML = arr.map(p => {
    // FIX: gunakan isActive (bukan active)
    const active       = p.isActive !== false;
    // FIX: gunakan discount (bukan value), expiryDate (bukan expiry)
    const discountText = p.type === 'percent' ? `${p.discount}%` : `G${formatNumber(p.discount||0)}`;
    const uses         = `${p.currentUses||0}/${p.maxUses||0}`;
    const expiry       = p.expiryDate ? formatDate(p.expiryDate) : 'Tidak ada';
    return `<div style="padding:14px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-weight:700;font-size:.95rem">
          <span style="background:var(--accent-light);color:var(--accent);padding:2px 10px;border-radius:4px;font-family:monospace">${esc(p.code||p.id)}</span>
          <span class="badge-status ${active ? 'badge-success' : 'badge-neutral'}" style="margin-left:8px">${active ? 'Aktif' : 'Nonaktif'}</span>
        </div>
        <div style="font-size:.8rem;color:var(--text-secondary);margin-top:4px">${esc(p.description||'-')} · Diskon ${discountText} · ${uses} digunakan · Exp ${expiry}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-outline btn-xs" onclick="editPromoModal('${p.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-outline btn-xs" onclick="togglePromoActive('${p.id}',${!active})" title="${active ? 'Nonaktifkan' : 'Aktifkan'}"><i class="fas fa-${active ? 'pause' : 'play'}"></i></button>
        <button class="btn btn-outline btn-xs" style="color:var(--danger)" onclick="deletePromo('${p.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function createPromo() {
  const code    = document.getElementById('promoCode')?.value.trim().toUpperCase();
  const desc    = document.getElementById('promoDesc')?.value.trim();
  const type    = document.getElementById('promoType')?.value || 'percent';
  // FIX: simpan sebagai 'discount' bukan 'value'
  const discount = parseFloat(document.getElementById('promoValue')?.value) || 0;
  const maxUses = parseInt(document.getElementById('promoMaxUses')?.value) || 0;
  // FIX: simpan sebagai 'expiryDate' bukan 'expiry'
  const expiryDate = document.getElementById('promoExpiry')?.value;
  // FIX: simpan sebagai 'isActive' bukan 'active'
  const isActive = document.getElementById('promoActive')?.checked !== false;

  if (!code)    { toast('Kode promo harus diisi', 'error'); return; }
  if (!discount){ toast('Nilai diskon harus diisi', 'error'); return; }

  const promoId = db.ref('promoCodes').push().key;
  db.ref('promoCodes/' + promoId).set({
    code, description: desc, type,
    discount, maxUses, expiryDate: expiryDate || null,
    isActive, currentUses: 0, createdAt: Date.now()
  }).then(() => {
    toast('Promo berhasil dibuat', 'success');
    ['promoCode','promoDesc','promoValue','promoMaxUses','promoExpiry'].forEach(id => {
      if (document.getElementById(id)) document.getElementById(id).value = '';
    });
  }).catch(e => toast('Gagal: ' + e.message, 'error'));
}

function editPromoModal(id) {
  const p = allPromos[id];
  if (!p) return;
  // FIX: baca field dengan nama yang benar
  document.getElementById('editPromoBody').innerHTML = `
    <div class="form-group-inline"><label>Kode</label><input type="text" id="editPromoCode" value="${esc(p.code||'')}"></div>
    <div class="form-group-inline"><label>Deskripsi</label><input type="text" id="editPromoDesc" value="${esc(p.description||'')}"></div>
    <div class="form-row">
      <div class="form-group-inline"><label>Tipe</label>
        <select id="editPromoType">
          <option value="percent" ${p.type==='percent'?'selected':''}>Persen</option>
          <option value="fixed"   ${p.type==='fixed'  ?'selected':''}>Fixed</option>
        </select>
      </div>
      <div class="form-group-inline"><label>Nilai Diskon</label><input type="number" id="editPromoDiscount" value="${p.discount||0}"></div>
    </div>
    <div class="form-row">
      <div class="form-group-inline"><label>Maks. Penggunaan</label><input type="number" id="editPromoMax" value="${p.maxUses||0}"></div>
      <div class="form-group-inline"><label>Kedaluwarsa</label><input type="date" id="editPromoExpiry" value="${p.expiryDate||''}"></div>
    </div>`;
  document.getElementById('editPromoSave').onclick = () => {
    // FIX: simpan dengan field name yang benar
    db.ref('promoCodes/' + id).update({
      code:        document.getElementById('editPromoCode').value.trim().toUpperCase(),
      description: document.getElementById('editPromoDesc').value.trim(),
      type:        document.getElementById('editPromoType').value,
      discount:    parseFloat(document.getElementById('editPromoDiscount').value) || 0,
      maxUses:     parseInt(document.getElementById('editPromoMax').value) || 0,
      expiryDate:  document.getElementById('editPromoExpiry').value || null,
    }).then(() => { toast('Promo diperbarui', 'success'); closeModal('editPromoModal'); })
      .catch(e => toast('Gagal: ' + e.message, 'error'));
  };
  openModal('editPromoModal');
}

function togglePromoActive(id, isActive) {
  // FIX: update field 'isActive' bukan 'active'
  db.ref('promoCodes/' + id).update({ isActive })
    .then(() => toast(isActive ? 'Promo diaktifkan' : 'Promo dinonaktifkan', 'success'))
    .catch(e => toast('Gagal: ' + e.message, 'error'));
}

function deletePromo(id) {
  showConfirm('Hapus Promo', 'Yakin ingin menghapus promo ini?', () => {
    db.ref('promoCodes/' + id).remove()
      .then(() => toast('Promo dihapus', 'success'))
      .catch(e => toast('Gagal: ' + e.message, 'error'));
  });
}

// ========== BROADCAST ==========
function toggleBcUser() {
  const target = document.getElementById('bcTarget')?.value;
  const group  = document.getElementById('bcUserGroup');
  if (group) group.style.display = target === 'specific' ? 'block' : 'none';
}

function updateBroadcastUserSelect() {
  const sel = document.getElementById('bcUserSelect');
  if (!sel) return;
  sel.innerHTML = Object.entries(allUsers).map(([uid, u]) => {
    const name = u.name || u.displayName || u.fullName || u.email || uid;
    return `<option value="${uid}">${esc(name)}</option>`;
  }).join('');
}

function sendBroadcast() {
  const title  = document.getElementById('bcTitle')?.value.trim();
  const body   = document.getElementById('bcBody')?.value.trim();
  const type   = document.getElementById('bcType')?.value || 'info';
  const target = document.getElementById('bcTarget')?.value || 'all';
  if (!title || !body) { toast('Judul dan isi harus diisi', 'error'); return; }

  const msgData = { title, body, type, from: 'admin', timestamp: Date.now(), date: Date.now(), isRead: false };

  if (target === 'all') {
    const uids     = Object.keys(allUsers);
    const promises = uids.map(uid => {
      const msgId = db.ref('messages').push().key;
      return db.ref('messages/' + msgId).set({ ...msgData, targetUid: uid, toUid: uid, broadcast: true });
    });
    Promise.all(promises)
      .then(() => { toast(`Broadcast terkirim ke ${uids.length} user`, 'success'); clearBroadcastForm(); })
      .catch(e => toast('Gagal: ' + e.message, 'error'));
  } else {
    const uid   = document.getElementById('bcUserSelect')?.value;
    if (!uid) { toast('Pilih user', 'error'); return; }
    const msgId = db.ref('messages').push().key;
    db.ref('messages/' + msgId).set({ ...msgData, targetUid: uid, toUid: uid })
      .then(() => { toast('Pesan terkirim', 'success'); clearBroadcastForm(); })
      .catch(e => toast('Gagal: ' + e.message, 'error'));
  }
}

function clearBroadcastForm() {
  ['bcTitle', 'bcBody'].forEach(id => { if (document.getElementById(id)) document.getElementById(id).value = ''; });
}

function renderBroadcastHistory() {
  const container = document.getElementById('broadcastHistory');
  if (!container) return;
  const arr = Object.entries(allMessages)
    .map(([id, m]) => ({ id, ...m }))
    .filter(m => m.from === 'admin')
    .sort((a, b) => (b.timestamp||0) - (a.timestamp||0))
    .slice(0, 30);
  if (!arr.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-bullhorn"></i><h3>Belum ada broadcast</h3></div>';
    return;
  }
  container.innerHTML = arr.map(m => {
    const typeColor  = m.type === 'warning' ? 'var(--warning)' : m.type === 'promo' ? 'var(--success)' : 'var(--info)';
    const targetName = m.broadcast ? 'Semua User' : getUserName(m.targetUid || m.toUid);
    return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span class="fw-700" style="font-size:.9rem">${esc(m.title||'-')}</span>
        <span style="font-size:.7rem;color:${typeColor};font-weight:600;text-transform:uppercase">${m.type||'info'}</span>
      </div>
      <p style="font-size:.8rem;color:var(--text-secondary);margin-bottom:4px">${esc((m.body||'').substring(0,100))}</p>
      <div style="font-size:.7rem;color:var(--text-muted)">Ke: ${esc(targetName)} · ${formatTimeAgo(m.timestamp)}</div>
    </div>`;
  }).join('');
}

// ========== BILLS ==========
function renderBills() {
  const tbody   = document.getElementById('billsTableBody');
  if (!tbody) return;
  const arr     = Object.entries(allBills).map(([id, b]) => ({ id, ...b }));
  const totalEl = document.getElementById('billsTotal');
  const amtEl   = document.getElementById('billsAmount');
  const catEl   = document.getElementById('billsCategories');
  if (totalEl) totalEl.textContent = arr.length;
  const totalAmt = arr.reduce((s, b) => s + parseFloat(b.amount||0), 0);
  if (amtEl) amtEl.textContent = 'G' + formatNumber(totalAmt);
  const categories = new Set(arr.map(b => b.category || b.type || 'other'));
  if (catEl) catEl.textContent = categories.size;

  if (!arr.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-file-invoice-dollar"></i><h3>Tidak ada tagihan</h3></div></td></tr>';
    return;
  }
  arr.sort((a, b) => getTimestamp(b) - getTimestamp(a));
  tbody.innerHTML = arr.slice(0, 100).map(b => {
    const user      = getUserName(b.uid || b.userId);
    const status    = (b.status || 'unpaid').toLowerCase();
    const badgeClass = status === 'paid' ? 'badge-success' : status === 'overdue' ? 'badge-danger' : 'badge-warning';
    return `<tr>
      <td data-label="ID" style="font-size:.75rem;font-family:monospace">${esc((b.id||''). substring(0,10))}...</td>
      <td data-label="User" class="fw-600">${esc(user)}</td>
      <td data-label="Kategori"><span class="badge-status badge-info">${capitalize(b.category||b.type||'other')}</span></td>
      <td data-label="Jumlah" class="fw-700">G${formatNumber(b.amount||0)}</td>
      <td data-label="Status"><span class="badge-status ${badgeClass}">${capitalize(status)}</span></td>
      <td data-label="Jatuh Tempo">${formatDate(b.dueDate||b.due||getTimestamp(b))}</td>
    </tr>`;
  }).join('');
}

// ========== MODALS & CONFIRM ==========
function openModal(id)  { const el = document.getElementById(id); if (el) el.classList.add('show'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); }

let confirmCallback = null;
function showConfirm(title, msg, cb) {
  document.getElementById('confirmTitle').textContent   = title;
  document.getElementById('confirmMessage').textContent = msg;
  confirmCallback = cb;
  document.getElementById('confirmAction').onclick = () => {
    const fn = confirmCallback; confirmCallback = null; closeModal('confirmModal'); if (fn) fn();
  };
  openModal('confirmModal');
}
function closeConfirm() { closeModal('confirmModal'); confirmCallback = null; }

// ========== TOASTS ==========
function toast(message, type = 'info', title) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const icons  = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  const titles = { success: 'Berhasil', error: 'Error', info: 'Info', warning: 'Perhatian' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fas ${icons[type]||icons.info} toast-icon"></i>
    <div class="toast-content">
      <div class="toast-title">${title || titles[type] || 'Info'}</div>
      <div class="toast-message">${esc(message)}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.classList.add('removing');setTimeout(()=>this.parentElement.remove(),300)"><i class="fas fa-times"></i></button>`;
  container.appendChild(el);
  setTimeout(() => { if (el.parentElement) { el.classList.add('removing'); setTimeout(() => el.remove(), 300); } }, 4000);
}

// ========== RIPPLE ==========
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn-primary,.btn-success,.btn-danger');
  if (!btn) return;
  btn.classList.add('ripple-container');
  const r    = document.createElement('span');
  r.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
  btn.appendChild(r);
  setTimeout(() => r.remove(), 600);
});

// ========== HELPERS ==========
function formatRp(n)     { return 'Rp ' + (parseInt(n)||0).toLocaleString('id-ID'); }
function formatNumber(n) { return (parseInt(n)||0).toLocaleString('id-ID'); }

function formatDate(d) {
  if (!d) return '-';
  const date = typeof d === 'number' ? new Date(d) : new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTimeAgo(ts) {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  if (diff < 60000)    return 'Baru saja';
  if (diff < 3600000)  return Math.floor(diff/60000) + ' m lalu';
  if (diff < 86400000) return Math.floor(diff/3600000) + ' j lalu';
  if (diff < 604800000)return Math.floor(diff/86400000) + ' h lalu';
  return formatDate(ts);
}

function getTimestamp(obj) {
  const t = obj.timestamp || obj.createdAt || obj.date || obj.requestDate || 0;
  if (typeof t === 'number') return t;
  const d = new Date(t);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function getUserName(uid) {
  if (!uid) return '-';
  if (uid === 'system') return 'System';
  const u = allUsers[uid];
  if (u) return u.name || u.displayName || u.fullName || u.email || uid;
  return uid.substring(0, 8) + '...';
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ['#1a9fff','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4','#6366f1','#ef4444'];
  return colors[Math.abs(hash) % colors.length];
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ========== DARK/LIGHT MODE ==========
function toggleAdminTheme() {
  const html  = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? '' : 'dark');
  const icon = document.getElementById('themeToggleIcon');
  if (icon) icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
}

try {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
    const icon = document.getElementById('themeToggleIcon');
    if (icon) icon.className = 'fas fa-sun';
  }
} catch(e) {}

// ========== KEYBOARD SHORTCUTS ==========
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const loginPage = document.getElementById('login-page');
    if (loginPage && loginPage.style.display !== 'none') {
      const regForm = document.getElementById('registerForm');
      if (regForm && regForm.style.display !== 'none') doRegister();
      else doLogin();
    }
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeUserDetail();
    closeConfirm();
    closeModal('userActionModal');
    closeModal('txDetailModal');
    closeModal('editPromoModal');
  }
});

console.log('GPay Admin Dashboard JS loaded — FIXED v1.1');
