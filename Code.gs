/**
 * ============================================================================
 *  DASHBOARD & DATABASE KARYAWAN — GFI (Galaxy Food Indonesia)
 * ============================================================================
 *  Google Apps Script Web App yang menjadikan Google Spreadsheet sebagai
 *  DATABASE karyawan (SDM) sekaligus menyajikan DASHBOARD interaktif.
 *
 *  Fitur:
 *    - Google Spreadsheet (sheet "data base SDM") = database utama.
 *    - Dashboard ringkasan (total, aktif/non-aktif, jenis karyawan, SP, dll).
 *    - CRUD penuh (Tambah / Ubah / Hapus karyawan).
 *    - Kolom dinamis (tambah / ganti nama / hapus kolom).
 *    - Pencarian & tabel data.
 *    - REST API JSON (doGet/doPost) untuk integrasi luar (opsional).
 *    - Sinkronisasi Firebase Realtime Database (OPSIONAL, aktif otomatis
 *      hanya bila FIREBASE_DB_URL diisi — inti aplikasi tetap jalan tanpanya).
 *
 *  Cara pakai singkat:
 *    1. Buka Spreadsheet Anda > Extensions > Apps Script.
 *    2. Tempel Code.gs & Index.html (nama HTML persis: "Index").
 *    3. Jalankan fungsi `setup()` SEKALI untuk membuat sheet + header.
 *    4. Deploy > New deployment > Web app (Execute as: Me,
 *       Who has access: Anyone). Buka URL /exec untuk melihat dashboard.
 *
 *  CATATAN PENTING (bug umum Apps Script):
 *    Fungsi yang diakhiri garis bawah "_" bersifat PRIVAT dan TIDAK bisa
 *    dipanggil dari frontend lewat google.script.run. Karena itu semua
 *    fungsi yang dipanggil dari Index.html memakai awalan `api...` TANPA
 *    garis bawah di akhir.
 * ============================================================================
 */

// ------------------------------- KONSTANTA ---------------------------------

var SHEET_NAME = 'data base SDM';

// Nama kolom teknis untuk ID unik (kolom A).
var ID_HEADER = 'ID';

/**
 * Header default kolom B1..V1 (kolom A dipakai untuk ID unik karyawan).
 * Urutan menentukan urutan kolom saat sheet pertama kali dibuat.
 */
var DEFAULT_HEADERS = [
  'NAMA LENGKAP',
  'NIK KTP',
  'NO.NPWP',
  'TEMPAT, TANGGAL LAHIR',
  'STATUS',
  'JUMLAH ANAK',
  'JOINT KERJA DI GFI',
  'JABATAN',
  'E-MAIL',
  'PENDIDIKAN TERAKHIR',
  'REKENING BCA',
  'UPLOUD FOTO',
  'UPLOUD KTP',
  'ALAMAT DOMISILI',
  'Nomor HP yang dapat dihubungi',
  'TANGGAL LAHIR',
  'STATUS AKTIF',
  'JENIS KARYAWAN',
  'STATUS SP',
  'TANGGAL SP',
  'KETERANGAN SP'
];

// ---------------------------- HELPER PROPERTIES ----------------------------

function props_() {
  return PropertiesService.getScriptProperties();
}

function getProp_(key, fallback) {
  var v = props_().getProperty(key);
  return (v === null || v === undefined || v === '') ? (fallback || '') : v;
}

function getSpreadsheet_() {
  var id = getProp_('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  // fallback: spreadsheet yang terikat langsung dengan project (jika ada)
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('SPREADSHEET_ID belum diset. Jalankan fungsi setup() dulu.');
}

function getSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    initSheetHeaders_(sh);
  }
  return sh;
}

// Dijalankan maksimal sekali per eksekusi (variabel modul di-reset tiap run).
var _sheetReady = false;

/**
 * Rapikan sheet agar bisa dibaca sebagai database:
 *  1. Jika kolom A bukan "ID" (mis. data ditempel mulai dari NAMA LENGKAP),
 *     sisipkan kolom "ID" di paling kiri.
 *  2. Isi otomatis ID untuk setiap baris yang sudah berdata tapi ID-nya kosong.
 * Aman & idempoten — jika sheet sudah rapi, tidak ada yang diubah.
 */
function ensureSheetReady_() {
  if (_sheetReady) return getSheet_();
  var sh = getSheet_();
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();

  if (lastRow < 1 || lastCol < 1) { initSheetHeaders_(sh); _sheetReady = true; return sh; }

  // (1) Pastikan ada kolom ID di posisi A.
  var a1 = String(sh.getRange(1, 1).getValue()).trim();
  if (a1.toUpperCase() !== ID_HEADER) {
    sh.insertColumnBefore(1);
    sh.getRange(1, 1).setValue(ID_HEADER)
      .setFontWeight('bold').setBackground('#065f46').setFontColor('#ffffff');
  }

  // (2) Backfill ID untuk baris berdata yang belum punya ID.
  lastRow = sh.getLastRow();
  lastCol = sh.getLastColumn();
  if (lastRow >= 2) {
    var rng = sh.getRange(2, 1, lastRow - 1, lastCol);
    var vals = rng.getValues();
    var changed = false;
    for (var i = 0; i < vals.length; i++) {
      var row = vals[i];
      var hasData = false;
      for (var c = 1; c < row.length; c++) {
        if (String(row[c]).trim() !== '') { hasData = true; break; }
      }
      if (hasData && String(row[0]).trim() === '') {
        row[0] = newId_() + '-' + (i + 2); // + nomor baris => pasti unik
        changed = true;
      }
    }
    if (changed) rng.setValues(vals);
  }

  _sheetReady = true;
  return sh;
}

function initSheetHeaders_(sh) {
  var headers = [ID_HEADER].concat(DEFAULT_HEADERS);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold').setBackground('#065f46').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
}

// ------------------------------- ROUTER ------------------------------------

/**
 * Entry point GET.
 * - Tanpa parameter `action` -> menyajikan dashboard (Index.html).
 * - Dengan `action` -> berperilaku sebagai REST API JSON.
 */
function doGet(e) {
  e = e || {};
  var params = e.parameter || {};

  if (!params.action) {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Dashboard SDM — GFI')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return handleRequest_(params.action, params, null);
}

/**
 * Entry point POST. Body dikirim sebagai JSON (Content-Type text/plain agar
 * menghindari CORS preflight dari browser).
 */
function doPost(e) {
  e = e || {};
  var params = e.parameter || {};
  var body = {};
  try {
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Body JSON tidak valid: ' + err.message });
  }
  var action = body.action || params.action;
  return handleRequest_(action, params, body);
}

/**
 * Router REST API. Menggabungkan parameter GET dan body POST.
 */
function handleRequest_(action, params, body) {
  var input = {};
  var k;
  for (k in params) { if (params.hasOwnProperty(k)) input[k] = params[k]; }
  if (body) { for (k in body) { if (body.hasOwnProperty(k)) input[k] = body[k]; } }

  try {
    // Proteksi API sederhana (opsional).
    var requiredKey = getProp_('API_KEY');
    if (requiredKey && input.apiKey !== requiredKey) {
      return jsonOut_({ ok: false, error: 'Unauthorized: API key salah/absen.' });
    }

    switch (action) {
      case 'ping':        return jsonOut_({ ok: true, message: 'pong', time: new Date().toISOString() });
      case 'dashboard':   return jsonOut_({ ok: true, data: computeDashboard_() });
      case 'list':        return jsonOut_({ ok: true, data: listEmployees_() });
      case 'get':         return jsonOut_({ ok: true, data: getEmployee_(input.id) });
      case 'create':      return jsonOut_({ ok: true, data: createEmployee_(input.record || input.data || {}) });
      case 'update':      return jsonOut_({ ok: true, data: updateEmployee_(input.id, input.record || input.data || {}) });
      case 'delete':      return jsonOut_({ ok: true, data: deleteEmployee_(input.id) });
      case 'getColumns':  return jsonOut_({ ok: true, data: getHeaders_() });
      case 'addColumn':   return jsonOut_({ ok: true, data: addColumn_(input.name) });
      case 'renameColumn':return jsonOut_({ ok: true, data: renameColumn_(input.oldName, input.newName) });
      case 'deleteColumn':return jsonOut_({ ok: true, data: deleteColumn_(input.name) });
      case 'getConfig':   return jsonOut_({ ok: true, data: getConfig_() });
      case 'repair':      return jsonOut_({ ok: true, data: (ensureSheetReady_(), { columns: getHeaders_(), count: listEmployees_().length }) });
      case 'syncAll':     return jsonOut_({ ok: true, data: syncAllToFirebase_() });
      default:
        return jsonOut_({ ok: false, error: 'Action tidak dikenal: ' + action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message, stack: err.stack });
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
//  API PUBLIK UNTUK FRONTEND (google.script.run)
//  Wajib TANPA garis bawah di akhir agar bisa dipanggil dari Index.html.
//  Selalu mengembalikan objek { ok, data } / { ok:false, error }.
// ============================================================================

/** Muat semua yang dibutuhkan dashboard sekaligus (kolom + data + statistik). */
function apiBootstrap() {
  return wrap_(function () {
    return {
      columns: getHeaders_(),
      rows: listEmployees_(),
      stats: computeDashboard_(),
      config: getConfig_()
    };
  });
}

function apiDashboard()               { return wrap_(function () { return computeDashboard_(); }); }
function apiListEmployees()           { return wrap_(function () { return listEmployees_(); }); }
function apiGetColumns()              { return wrap_(function () { return getHeaders_(); }); }
function apiGetEmployee(id)           { return wrap_(function () { return getEmployee_(id); }); }
function apiCreateEmployee(record)    { return wrap_(function () { return createEmployee_(record || {}); }); }
function apiUpdateEmployee(id, rec)   { return wrap_(function () { return updateEmployee_(id, rec || {}); }); }
function apiDeleteEmployee(id)        { return wrap_(function () { return deleteEmployee_(id); }); }
function apiAddColumn(name)           { return wrap_(function () { return addColumn_(name); }); }
function apiRenameColumn(o, n)        { return wrap_(function () { return renameColumn_(o, n); }); }
function apiDeleteColumn(name)        { return wrap_(function () { return deleteColumn_(name); }); }
function apiSyncFirebase()            { return wrap_(function () { return syncAllToFirebase_(); }); }
function apiRepair()                  { return wrap_(function () { ensureSheetReady_(); return { columns: getHeaders_(), count: listEmployees_().length }; }); }

/** Bungkus pemanggilan agar error selalu terkirim rapi ke frontend. */
function wrap_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// --------------------------- HELPER DATA SHEET -----------------------------

function getHeaders_() {
  var sh = ensureSheetReady_();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) { initSheetHeaders_(sh); lastCol = sh.getLastColumn(); }
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim();
  });
}

/** Konversi baris array menjadi object {header: value}. */
function rowToObject_(headers, row) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (!h) continue;
    var v = row[i];
    if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    obj[h] = v;
  }
  return obj;
}

function listEmployees_() {
  var sh = ensureSheetReady_();
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var obj = rowToObject_(headers, values[r]);
    if (!obj[ID_HEADER]) continue; // lewati baris kosong
    out.push(obj);
  }
  return out;
}

function findRowById_(id) {
  var sh = getSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // nomor baris di sheet
  }
  return -1;
}

function getEmployee_(id) {
  if (!id) throw new Error('Parameter id wajib diisi.');
  var sh = getSheet_();
  var rowNum = findRowById_(id);
  if (rowNum < 0) throw new Error('Data dengan id ' + id + ' tidak ditemukan.');
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var row = sh.getRange(rowNum, 1, 1, lastCol).getValues()[0];
  return rowToObject_(headers, row);
}

function newId_() {
  return 'EMP-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') +
    '-' + Math.floor(Math.random() * 1000);
}

function createEmployee_(record) {
  var sh = getSheet_();
  var headers = getHeaders_();
  var id = record[ID_HEADER] || newId_();
  record[ID_HEADER] = id;

  var row = headers.map(function (h) {
    return record.hasOwnProperty(h) ? record[h] : '';
  });
  sh.appendRow(row);

  var saved = getEmployee_(id);
  firebaseSafeSet_('employees/' + firebaseKeySafe_(id), saved);
  touchMeta_();
  return saved;
}

function updateEmployee_(id, record) {
  if (!id) throw new Error('Parameter id wajib diisi.');
  var sh = getSheet_();
  var rowNum = findRowById_(id);
  if (rowNum < 0) throw new Error('Data dengan id ' + id + ' tidak ditemukan.');

  var headers = getHeaders_();
  var lastCol = headers.length;
  var current = sh.getRange(rowNum, 1, 1, lastCol).getValues()[0];

  var newRow = headers.map(function (h, idx) {
    if (h === ID_HEADER) return id; // ID tidak boleh berubah
    return record.hasOwnProperty(h) ? record[h] : current[idx];
  });
  sh.getRange(rowNum, 1, 1, lastCol).setValues([newRow]);

  var saved = getEmployee_(id);
  firebaseSafeSet_('employees/' + firebaseKeySafe_(id), saved);
  touchMeta_();
  return saved;
}

function deleteEmployee_(id) {
  if (!id) throw new Error('Parameter id wajib diisi.');
  var sh = getSheet_();
  var rowNum = findRowById_(id);
  if (rowNum < 0) throw new Error('Data dengan id ' + id + ' tidak ditemukan.');
  sh.deleteRow(rowNum);
  firebaseSafeDelete_('employees/' + firebaseKeySafe_(id));
  touchMeta_();
  return { id: id, deleted: true };
}

// --------------------------- MANAJEMEN KOLOM -------------------------------

function addColumn_(name) {
  if (!name) throw new Error('Nama kolom wajib diisi.');
  name = String(name).trim();
  var headers = getHeaders_();
  if (headers.indexOf(name) >= 0) throw new Error('Kolom "' + name + '" sudah ada.');

  var sh = getSheet_();
  var newColIndex = sh.getLastColumn() + 1;
  sh.getRange(1, newColIndex).setValue(name)
    .setFontWeight('bold').setBackground('#065f46').setFontColor('#ffffff');

  syncColumnsToFirebase_();
  return getHeaders_();
}

function renameColumn_(oldName, newName) {
  if (!oldName || !newName) throw new Error('oldName dan newName wajib diisi.');
  if (oldName === ID_HEADER) throw new Error('Kolom ID tidak boleh diubah.');
  var headers = getHeaders_();
  var idx = headers.indexOf(oldName);
  if (idx < 0) throw new Error('Kolom "' + oldName + '" tidak ditemukan.');
  if (headers.indexOf(newName) >= 0) throw new Error('Kolom "' + newName + '" sudah ada.');

  var sh = getSheet_();
  sh.getRange(1, idx + 1).setValue(newName);
  syncColumnsToFirebase_();
  return getHeaders_();
}

function deleteColumn_(name) {
  if (!name) throw new Error('Nama kolom wajib diisi.');
  if (name === ID_HEADER) throw new Error('Kolom ID tidak boleh dihapus.');
  var headers = getHeaders_();
  var idx = headers.indexOf(name);
  if (idx < 0) throw new Error('Kolom "' + name + '" tidak ditemukan.');

  var sh = getSheet_();
  sh.deleteColumn(idx + 1);
  syncColumnsToFirebase_();
  return getHeaders_();
}

// =========================== STATISTIK DASHBOARD ===========================

/** Samakan teks: uppercase + rapikan spasi, agar cocok walau beda kapital. */
function norm_(v) {
  return String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Tebak apakah nilai "STATUS AKTIF" berarti aktif. */
function isAktif_(val) {
  var s = norm_(val);
  if (!s) return false;
  if (s.indexOf('NON') >= 0 || s.indexOf('TIDAK') >= 0 || s.indexOf('RESIGN') >= 0 ||
      s.indexOf('KELUAR') >= 0 || s.indexOf('BERHENTI') >= 0) return false;
  return s.indexOf('AKTIF') >= 0;
}

/** Hitung distribusi sebuah kolom -> [{label, count}] terurut menurun. */
function distribution_(rows, colName) {
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var raw = rows[i][colName];
    var label = (raw == null || String(raw).trim() === '') ? '(Kosong)' : String(raw).trim();
    map[label] = (map[label] || 0) + 1;
  }
  var arr = [];
  for (var k in map) { if (map.hasOwnProperty(k)) arr.push({ label: k, count: map[k] }); }
  arr.sort(function (a, b) { return b.count - a.count; });
  return arr;
}

/**
 * Ringkasan untuk kartu & grafik dashboard.
 */
function computeDashboard_() {
  var headers = getHeaders_();
  var rows = listEmployees_();
  var total = rows.length;

  var aktif = 0, nonAktif = 0;
  var kawin = 0;
  var denganSP = 0;
  var totalAnak = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (isAktif_(r['STATUS AKTIF'])) aktif++; else nonAktif++;
    if (norm_(r['STATUS']).indexOf('KAWIN') >= 0) kawin++;
    var sp = String(r['STATUS SP'] == null ? '' : r['STATUS SP']).trim();
    if (sp) denganSP++;
    var anak = parseInt(r['JUMLAH ANAK'], 10);
    if (!isNaN(anak)) totalAnak += anak;
  }

  var has = function (name) { return headers.indexOf(name) >= 0; };

  return {
    total: total,
    aktif: aktif,
    nonAktif: nonAktif,
    kawin: kawin,
    belumKawin: total - kawin,
    denganSP: denganSP,
    totalAnak: totalAnak,
    columnsCount: headers.length,
    byJenisKaryawan: has('JENIS KARYAWAN') ? distribution_(rows, 'JENIS KARYAWAN') : [],
    byJabatan:       has('JABATAN')        ? distribution_(rows, 'JABATAN').slice(0, 8) : [],
    byPendidikan:    has('PENDIDIKAN TERAKHIR') ? distribution_(rows, 'PENDIDIKAN TERAKHIR') : [],
    byStatusAktif:   has('STATUS AKTIF')   ? distribution_(rows, 'STATUS AKTIF') : [],
    generatedAt: new Date().toISOString()
  };
}

// ------------------------------ KONFIGURASI --------------------------------

/**
 * Konfigurasi frontend. Bila Firebase aktif, gabungkan config dari RTDB.
 * Selalu menyertakan daftar kolom & nama sheet (dari Spreadsheet).
 */
function getConfig_() {
  var cfg = {};
  if (firebaseEnabled_()) {
    try {
      var remote = firebaseGet_('config');
      if (remote && typeof remote === 'object') cfg = remote;
    } catch (e) { /* abaikan; dashboard tetap jalan tanpa Firebase */ }
  }
  cfg.columns = getHeaders_();
  cfg.sheetName = SHEET_NAME;
  cfg.firebaseEnabled = firebaseEnabled_();
  cfg.appName = cfg.appName || 'Dashboard SDM — GFI';
  return cfg;
}

// --------------------- INTEGRASI FIREBASE (OPSIONAL) -----------------------
// Semua pemanggilan Firebase di sini "aman": bila FIREBASE_DB_URL kosong atau
// terjadi error jaringan, inti aplikasi (Spreadsheet) tetap berjalan normal.

/** Firebase dianggap aktif hanya bila FIREBASE_DB_URL diisi. */
function firebaseEnabled_() {
  return !!getProp_('FIREBASE_DB_URL');
}

/** Wrapper aman untuk firebaseKey_ (Firebase.gs mungkin tidak dipakai). */
function firebaseKeySafe_(raw) {
  if (typeof firebaseKey_ === 'function') return firebaseKey_(raw);
  return String(raw).replace(/[.$#\[\]\/]/g, '_');
}

function firebaseSafeSet_(path, value) {
  if (!firebaseEnabled_() || typeof firebaseSet_ !== 'function') return;
  try { firebaseSet_(path, value); } catch (e) { Logger.log('Firebase set gagal: ' + e); }
}

function firebaseSafeDelete_(path) {
  if (!firebaseEnabled_() || typeof firebaseDelete_ !== 'function') return;
  try { firebaseDelete_(path); } catch (e) { Logger.log('Firebase delete gagal: ' + e); }
}

function touchMeta_() {
  if (!firebaseEnabled_() || typeof firebaseSet_ !== 'function') return;
  try { firebaseSet_('meta/lastUpdate', new Date().toISOString()); } catch (e) { /* diabaikan */ }
}

function syncColumnsToFirebase_() {
  if (!firebaseEnabled_() || typeof firebaseGet_ !== 'function') return;
  try {
    var current = firebaseGet_('config') || {};
    current.columns = getHeaders_();
    current.sheetName = SHEET_NAME;
    current.updatedAt = new Date().toISOString();
    firebaseSet_('config', current);
  } catch (e) { Logger.log('Sync kolom gagal: ' + e); }
}

/** Sinkronkan seluruh sheet -> Firebase (hanya bila Firebase aktif). */
function syncAllToFirebase_() {
  if (!firebaseEnabled_()) {
    return { synced: false, reason: 'Firebase nonaktif (FIREBASE_DB_URL kosong).' };
  }
  var employees = listEmployees_();
  var map = {};
  for (var i = 0; i < employees.length; i++) {
    var id = employees[i][ID_HEADER];
    if (!id) continue;
    map[firebaseKeySafe_(id)] = employees[i];
  }
  firebaseSet_('employees', map);
  syncColumnsToFirebase_();
  touchMeta_();
  return { synced: true, count: employees.length };
}

// =========================== FUNGSI SETUP AWAL =============================

/**
 * Jalankan SEKALI dari editor Apps Script untuk inisialisasi database.
 * Aman dijalankan berulang (idempoten). Firebase TIDAK wajib.
 */
function setup() {
  var p = props_();

  var spreadsheetId = p.getProperty('SPREADSHEET_ID') || '';
  if (!spreadsheetId) {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) spreadsheetId = active.getId();
  }
  if (spreadsheetId) p.setProperty('SPREADSHEET_ID', spreadsheetId);

  // Inisialisasi sheet + header (database).
  var sh = getSheet_();
  if (sh.getLastRow() < 1 || String(sh.getRange(1, 1).getValue()).trim() === '') {
    initSheetHeaders_(sh);
  }

  // Rapikan bila data sudah terlanjur ditempel tanpa kolom ID.
  ensureSheetReady_();

  // Bila Firebase diaktifkan (FIREBASE_DB_URL terisi), sinkronkan sekali.
  if (firebaseEnabled_()) {
    try { syncAllToFirebase_(); } catch (e) { Logger.log('Sync awal gagal: ' + e); }
  }

  Logger.log('Setup selesai. SPREADSHEET_ID=' + spreadsheetId +
    ' | Firebase=' + (firebaseEnabled_() ? 'AKTIF' : 'nonaktif'));
}

/**
 * (Opsional) Isi contoh 1 baris data agar dashboard tidak kosong saat demo.
 */
function seedContoh() {
  createEmployee_({
    'NAMA LENGKAP': 'KHOTIB',
    'NIK KTP': '3523154502960001',
    'NO.NPWP': '944381133649000',
    'TEMPAT, TANGGAL LAHIR': '28/02/1996',
    'STATUS': 'KAWIN',
    'JUMLAH ANAK': '1',
    'JOINT KERJA DI GFI': '14/04/2025',
    'JABATAN': 'ADMIN HR',
    'E-MAIL': 'prayogo0620@gmail.com',
    'PENDIDIKAN TERAKHIR': 'S1',
    'REKENING BCA': '8241256618',
    'STATUS AKTIF': 'AKTIF'
  });
}
