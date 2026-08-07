/**
 * ============================================================================
 *  SERVER API - DATABASE SDM / KARYAWAN GFI
 * ============================================================================
 *  Google Apps Script Web App yang berfungsi sebagai REST API untuk:
 *    - Mengelola data karyawan di Google Spreadsheet (sheet "data base SDM")
 *    - Sinkronisasi otomatis ke Firebase Realtime Database (realtime)
 *    - CRUD (Create, Read, Update, Delete)
 *    - Menambah kolom baru secara dinamis
 *    - Konfigurasi & pengaturan disimpan di Realtime Database
 *
 *  Cara deploy:
 *    1. Buat Spreadsheet baru, catat ID-nya (dari URL).
 *    2. Extensions > Apps Script, tempel semua file (.gs & .html).
 *    3. Jalankan fungsi `setup()` sekali untuk inisialisasi Script Properties,
 *       sheet, dan konfigurasi di Firebase.
 *    4. Deploy > New deployment > Web app > Execute as: Me,
 *       Who has access: Anyone. Salin URL Web App.
 *
 *  Konfigurasi yang WAJIB diisi di Script Properties (lihat fungsi setup):
 *    - SPREADSHEET_ID     : ID Google Spreadsheet
 *    - FIREBASE_DB_URL    : URL Realtime Database (contoh di bawah)
 *    - FIREBASE_SECRET    : (opsional) Database secret / token auth RTDB
 *    - API_KEY            : (opsional) kunci sederhana untuk proteksi API
 * ============================================================================
 */

// ------------------------------- KONSTANTA ---------------------------------

var SHEET_NAME = 'data base SDM';

/**
 * Header default kolom B1:V1 (kolom A dipakai untuk ID unik karyawan).
 * Urutan ini menentukan urutan kolom saat sheet pertama kali dibuat.
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

// Nama kolom teknis untuk ID (kolom A).
var ID_HEADER = 'ID';

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
  throw new Error('SPREADSHEET_ID belum diset di Script Properties.');
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

function initSheetHeaders_(sh) {
  var headers = [ID_HEADER].concat(DEFAULT_HEADERS);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

// ------------------------------- ROUTER ------------------------------------

/**
 * Entry point GET.
 * - Tanpa parameter `action` -> menyajikan halaman frontend (HtmlService).
 * - Dengan `action` -> berperilaku sebagai JSON API (read-only friendly).
 */
function doGet(e) {
  e = e || {};
  var params = e.parameter || {};

  if (!params.action) {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Database SDM - GFI')
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
 * Router utama. Menggabungkan parameter GET dan body POST.
 */
function handleRequest_(action, params, body) {
  var input = {};
  var k;
  for (k in params) { if (params.hasOwnProperty(k)) input[k] = params[k]; }
  if (body) { for (k in body) { if (body.hasOwnProperty(k)) input[k] = body[k]; } }

  try {
    // Proteksi API sederhana (opsional).
    var requiredKey = getProp_('API_KEY');
    if (requiredKey) {
      if (input.apiKey !== requiredKey) {
        return jsonOut_({ ok: false, error: 'Unauthorized: API key salah/absen.' });
      }
    }

    switch (action) {
      case 'ping':        return jsonOut_({ ok: true, message: 'pong', time: new Date().toISOString() });
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
      case 'setConfig':   return jsonOut_({ ok: true, data: setConfig_(input.config || {}) });
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

// --------------------------- HELPER DATA SHEET -----------------------------

function getHeaders_() {
  var sh = getSheet_();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) { initSheetHeaders_(sh); lastCol = sh.getLastColumn(); }
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim();
  });
}

/**
 * Konversi baris array menjadi object {header: value}.
 */
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
  var sh = getSheet_();
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
  firebaseSet_('employees/' + firebaseKey_(id), saved);
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
  firebaseSet_('employees/' + firebaseKey_(id), saved);
  touchMeta_();
  return saved;
}

function deleteEmployee_(id) {
  if (!id) throw new Error('Parameter id wajib diisi.');
  var sh = getSheet_();
  var rowNum = findRowById_(id);
  if (rowNum < 0) throw new Error('Data dengan id ' + id + ' tidak ditemukan.');
  sh.deleteRow(rowNum);
  firebaseDelete_('employees/' + firebaseKey_(id));
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
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');

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
  syncAllToFirebase_();
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
  syncAllToFirebase_();
  return getHeaders_();
}

// ------------------------------ KONFIGURASI --------------------------------

/**
 * Konfigurasi disimpan di Realtime Database pada path /config.
 * Termasuk firebaseConfig (untuk frontend), daftar kolom, dan metadata.
 */
function getConfig_() {
  var cfg = firebaseGet_('config');
  if (!cfg) cfg = {};
  cfg.columns = getHeaders_();
  cfg.sheetName = SHEET_NAME;
  return cfg;
}

function setConfig_(config) {
  var current = firebaseGet_('config') || {};
  for (var k in config) { if (config.hasOwnProperty(k)) current[k] = config[k]; }
  current.updatedAt = new Date().toISOString();
  firebaseSet_('config', current);
  return getConfig_();
}

function syncColumnsToFirebase_() {
  var current = firebaseGet_('config') || {};
  current.columns = getHeaders_();
  current.sheetName = SHEET_NAME;
  current.updatedAt = new Date().toISOString();
  firebaseSet_('config', current);
}

function touchMeta_() {
  firebaseSet_('meta/lastUpdate', new Date().toISOString());
}

// --------------------------- SINKRONISASI PENUH ----------------------------

function syncAllToFirebase_() {
  var employees = listEmployees_();
  var map = {};
  for (var i = 0; i < employees.length; i++) {
    var id = employees[i][ID_HEADER];
    if (!id) continue;
    map[firebaseKey_(id)] = employees[i];
  }
  firebaseSet_('employees', map);
  syncColumnsToFirebase_();
  touchMeta_();
  return { count: employees.length };
}

// =========================== FUNGSI SETUP AWAL =============================

/**
 * Jalankan SEKALI dari editor Apps Script untuk inisialisasi.
 * Sesuaikan nilai di bawah sebelum menjalankan.
 */
function setup() {
  var p = props_();

  // Ambil ID spreadsheet: dari property, atau dari spreadsheet aktif bila terikat.
  var spreadsheetId = p.getProperty('SPREADSHEET_ID') || '';
  if (!spreadsheetId) {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) spreadsheetId = active.getId();
  }

  // >>> GANTI nilai berikut sesuai project Anda <<<
  var config = {
    SPREADSHEET_ID:  spreadsheetId,
    FIREBASE_DB_URL: p.getProperty('FIREBASE_DB_URL') || 'https://hrnit-d1140-default-rtdb.firebaseio.com',
    FIREBASE_SECRET: p.getProperty('FIREBASE_SECRET') || '',   // isi bila RTDB butuh auth
    API_KEY:         p.getProperty('API_KEY') || ''            // isi bila ingin proteksi
  };

  p.setProperties(config, false);

  // Inisialisasi sheet + header.
  var sh = getSheet_();
  if (sh.getLastRow() < 1 || String(sh.getRange(1, 1).getValue()).trim() === '') {
    initSheetHeaders_(sh);
  }

  // Simpan firebaseConfig (web) & kolom ke Realtime Database /config.
  setConfig_({
    firebaseConfig: {
      apiKey: 'AIzaSyDuhK2zpIbH41DXLHpxT2uUKSGVT3TxUbg',
      authDomain: 'hrnit-d1140.firebaseapp.com',
      projectId: 'hrnit-d1140',
      storageBucket: 'hrnit-d1140.firebasestorage.app',
      messagingSenderId: '102705744721',
      appId: '1:102705744721:web:49e5ec0bd87eb5df582170',
      measurementId: 'G-EET5PL4GQW',
      databaseURL: config.FIREBASE_DB_URL
    },
    appName: 'Database SDM - GFI'
  });

  syncAllToFirebase_();
  Logger.log('Setup selesai. Script Properties: ' + JSON.stringify(config));
}
