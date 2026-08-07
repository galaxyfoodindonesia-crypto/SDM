/**
 * ============================================================================
 *  FIREBASE REALTIME DATABASE HELPER (REST API)
 * ============================================================================
 *  Menghubungkan Apps Script ke Realtime Database melalui REST API.
 *  Membutuhkan Script Property:
 *    - FIREBASE_DB_URL  : contoh https://hrnit-d1140-default-rtdb.firebaseio.com
 *    - FIREBASE_SECRET  : (opsional) database secret / token untuk ?auth=
 *
 *  Jika RTDB rules mengizinkan read/write publik, FIREBASE_SECRET boleh kosong.
 *  Untuk produksi disarankan mengisi FIREBASE_SECRET (Legacy Database Secret)
 *  atau memakai rules yang ketat.
 * ============================================================================
 */

function firebaseBaseUrl_() {
  var url = getProp_('FIREBASE_DB_URL');
  if (!url) throw new Error('FIREBASE_DB_URL belum diset di Script Properties.');
  return url.replace(/\/+$/, ''); // buang trailing slash
}

function firebaseUrl_(path) {
  var base = firebaseBaseUrl_();
  var clean = String(path || '').replace(/^\/+/, '');
  var url = base + '/' + clean + '.json';
  var secret = getProp_('FIREBASE_SECRET');
  if (secret) {
    url += (url.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + encodeURIComponent(secret);
  }
  return url;
}

/**
 * Key Firebase tidak boleh mengandung: . $ # [ ] / dan kontrol char.
 * Fungsi ini mengganti karakter terlarang dengan '_'.
 */
function firebaseKey_(raw) {
  return String(raw).replace(/[.$#\[\]\/]/g, '_');
}

function firebaseRequest_(method, path, payload) {
  var options = {
    method: method,
    muteHttpExceptions: true,
    contentType: 'application/json'
  };
  if (payload !== undefined && payload !== null) {
    options.payload = JSON.stringify(payload);
  }
  var resp = UrlFetchApp.fetch(firebaseUrl_(path), options);
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Firebase ' + method + ' ' + path + ' gagal (' + code + '): ' + text);
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { return text; }
}

function firebaseGet_(path) {
  return firebaseRequest_('get', path, null);
}

function firebaseSet_(path, value) {
  // PUT = overwrite penuh pada path tersebut.
  return firebaseRequest_('put', path, value);
}

function firebaseUpdate_(path, value) {
  // PATCH = merge sebagian field.
  return firebaseRequest_('patch', path, value);
}

function firebasePush_(path, value) {
  // POST = generate key otomatis.
  return firebaseRequest_('post', path, value);
}

function firebaseDelete_(path) {
  return firebaseRequest_('delete', path, null);
}

/**
 * Tes koneksi cepat ke Firebase (jalankan manual dari editor).
 */
function testFirebase() {
  firebaseSet_('meta/test', { at: new Date().toISOString(), ok: true });
  var v = firebaseGet_('meta/test');
  Logger.log('Firebase test read: ' + JSON.stringify(v));
  return v;
}
