
function bukaTab(tabId) {
  document.querySelectorAll('.tab-buttons button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
}

function parseTanggal(dateStr) {
  return new Date(dateStr.replace(" ", "T"));
}

function isTokenAktif() {
  const nama = localStorage.getItem("vipNama");
  const expDate = parseTanggal(localStorage.getItem("expDate") || "2000-01-01 00:00:00");
  const now = new Date();
  return nama && now < expDate;
}

function aturTampilanAwal() {
  const aktif = isTokenAktif();
  document.getElementById("btnAktivasi").style.display = aktif ? "inline-block" : "none";
  document.getElementById("btnStatus").style.display = aktif ? "inline-block" : "none";
  bukaTab(aktif ? "aktivasi" : "loginNama");
}

function cekTokenNama() {
  const nama = document.getElementById("namaInput").value.trim().toLowerCase();
  const output = document.getElementById("hasilLogin");

  if (!nama) {
    output.innerHTML = '<span style="color:red">❌ Nama tidak boleh kosong</span>';
    return;
  }

  output.innerHTML = '🔄 Mengecek database...';

  firebase.database().ref('VipUser/' + nama).once('value').then(snapshot => {
    const data = snapshot.val();
    if (!data) throw new Error("Nama tidak ditemukan di database.");
    if (!data.aktif) throw new Error("Akses tidak aktif.");
    const now = new Date();
    const exp = parseTanggal(data.expDate);
    if (now > exp) throw new Error("Masa aktif sudah habis.");

    localStorage.setItem("vipNama", nama);
    localStorage.setItem("expDate", data.expDate);
    localStorage.setItem("vipLevel", data.vipLevel);

    output.innerHTML = `<span style="color:green">✅ Login sukses sebagai VIP Level ${data.vipLevel}</span>`;
    bukaTab('aktivasi');
  }).catch(err => {
    output.innerHTML = '<span style="color:red">❌ ' + err.message + '</span>';
  });
}

function logoutVIP() {
  localStorage.clear();
  alert("🚪 Kamu telah logout.");
  bukaTab("loginNama");
}

function prosesVip() {
  alert("✅ VIP berhasil diaktifkan (simulasi).");
}

function cekStatus() {
  const nama = localStorage.getItem("vipNama");
  const exp = localStorage.getItem("expDate");
  const level = localStorage.getItem("vipLevel");

  document.getElementById("hasilStatus").innerHTML = `
    <table>
      <tr><th>Nama</th><td>${nama}</td></tr>
      <tr><th>VIP Level</th><td>${level}</td></tr>
      <tr><th>Kedaluwarsa</th><td>${exp}</td></tr>
    </table>`;
}

function salinStatus() {
  const teks = document.getElementById('hasilStatus').innerText;
  navigator.clipboard.writeText(teks).then(() => {
    alert('📋 Status berhasil disalin!');
  }).catch(err => {
    alert('❌ Gagal menyalin: ' + err);
  });
}
