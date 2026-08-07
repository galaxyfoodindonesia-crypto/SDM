# Database SDM / Karyawan GFI — Google Apps Script API + Firebase Realtime Database

Sistem manajemen data karyawan yang **terhubung langsung** ke:

- **Google Spreadsheet** (sheet `data base SDM`) sebagai penyimpanan utama,
- **Firebase Realtime Database** (project `hrnit-d1140`) untuk sinkronisasi *realtime* dan penyimpanan konfigurasi.

Mendukung **CRUD** penuh, **penambahan kolom baru** secara dinamis, dan **konfigurasi disimpan di Realtime Database**.

---

## 📁 Isi Repository

| File | Fungsi |
|------|--------|
| `Code.gs` | Server API utama (router, CRUD, manajemen kolom, config, setup). |
| `Firebase.gs` | Helper koneksi Realtime Database via REST API. |
| `Index.html` | Frontend yang disajikan langsung oleh Apps Script (`google.script.run`). |
| `appsscript.json` | Manifest project Apps Script (scope & webapp access). |
| `web/index.html` | Frontend **standalone** (untuk Firebase Hosting / host lain, via `fetch`). |
| `database.rules.json` | Contoh security rules Realtime Database. |
| `firebase.json` | Konfigurasi Firebase Hosting + Database rules. |

---

## 🗂️ Struktur Data

Sheet **`data base SDM`**. Kolom **A** = `ID` (dibuat otomatis), kolom **B1:V1** = field data:

`NAMA LENGKAP`, `NIK KTP`, `NO.NPWP`, `TEMPAT, TANGGAL LAHIR`, `STATUS`, `JUMLAH ANAK`, `JOINT KERJA DI GFI`, `JABATAN`, `E-MAIL`, `PENDIDIKAN TERAKHIR`, `REKENING BCA`, `UPLOUD FOTO`, `UPLOUD KTP`, `ALAMAT DOMISILI`, `Nomor HP yang dapat dihubungi`, `TANGGAL LAHIR`, `STATUS AKTIF`, `JENIS KARYAWAN`, `STATUS SP`, `TANGGAL SP`, `KETERANGAN SP`

Struktur di Realtime Database:

```
hrnit-d1140-default-rtdb
├── config/            → firebaseConfig, appName, columns, updatedAt
├── meta/lastUpdate    → timestamp perubahan terakhir (pemicu realtime)
└── employees/
    └── <ID>/          → { ID, NAMA LENGKAP, NIK KTP, ... }
```

---

## 🚀 Cara Deploy

### 1. Siapkan Spreadsheet
1. Buat Google Spreadsheet baru.
2. Salin **ID** dari URL: `https://docs.google.com/spreadsheets/d/`**`ID_INI`**`/edit`.

### 2. Buat Project Apps Script
1. Di Spreadsheet: **Extensions → Apps Script**.
2. Buat file dan tempel isi masing-masing:
   - `Code.gs`, `Firebase.gs` (file *Script*).
   - `Index.html` (file *HTML* — beri nama persis `Index`).
   - Salin isi `appsscript.json` ke manifest (aktifkan lewat **Project Settings → Show "appsscript.json"**).

### 3. Isi Konfigurasi (Script Properties)
**Project Settings → Script Properties**, tambahkan:

| Key | Nilai | Wajib |
|-----|-------|-------|
| `SPREADSHEET_ID` | ID spreadsheet Anda | ✅ |
| `FIREBASE_DB_URL` | `https://hrnit-d1140-default-rtdb.firebaseio.com` | ✅ |
| `FIREBASE_SECRET` | Database secret / token (lihat catatan auth) | opsional |
| `API_KEY` | Kunci proteksi API sederhana | opsional |

> **Catatan URL RTDB:** jika database dibuat di region lain, URL bisa berupa
> `https://hrnit-d1140-default-rtdb.asia-southeast1.firebasedatabase.app`.
> Cek di Firebase Console → Realtime Database.

### 4. Inisialisasi
1. Di editor Apps Script pilih fungsi **`setup`** lalu **Run**.
2. Setujui izin (OAuth) yang diminta.
3. `setup()` akan: membuat header sheet, menyimpan `firebaseConfig` + kolom ke `/config`, dan menyinkronkan data awal.
4. (Opsional) jalankan **`testFirebase`** untuk memastikan koneksi RTDB berhasil.

### 5. Deploy Web App
1. **Deploy → New deployment → Web app**.
2. *Execute as*: **Me** · *Who has access*: **Anyone**.
3. Salin **URL Web App** (diakhiri `/exec`).
4. Buka URL tersebut → frontend `Index.html` langsung tampil. ✅

### 6. (Opsional) Frontend Standalone / Firebase Hosting
- Buka `web/index.html`, isi **URL API** (`/exec`) pada kotak konfigurasi di halaman, klik **Simpan & Muat**.
- Untuk hosting: `firebase deploy` (butuh Firebase CLI, `firebase.json` sudah disediakan).

### 7. Terapkan Security Rules (disarankan)
Melalui Firebase Console → Realtime Database → Rules, atau:
```bash
firebase deploy --only database
```
> ⚠️ `database.rules.json` bawaan bersifat **terbuka (public)** agar mudah dites.
> Untuk produksi, batasi `.read`/`.write` dengan autentikasi.

---

## 🔌 Referensi API

Base URL = URL Web App (`.../exec`).
Semua request membalas JSON: `{ ok: true, data: ... }` atau `{ ok: false, error: "..." }`.

**POST** (disarankan) — body JSON, `Content-Type: text/plain;charset=utf-8`:

```json
{ "action": "create", "record": { "NAMA LENGKAP": "Budi", "JABATAN": "Staff" } }
```

| Action | Parameter | Keterangan |
|--------|-----------|------------|
| `ping` | — | Cek server hidup. |
| `list` | — | Ambil semua karyawan. |
| `get` | `id` | Ambil 1 karyawan. |
| `create` | `record` | Tambah karyawan (ID dibuat otomatis). |
| `update` | `id`, `record` | Ubah data karyawan. |
| `delete` | `id` | Hapus karyawan. |
| `getColumns` | — | Daftar kolom saat ini. |
| `addColumn` | `name` | Tambah kolom baru. |
| `renameColumn` | `oldName`, `newName` | Ganti nama kolom. |
| `deleteColumn` | `name` | Hapus kolom. |
| `getConfig` | — | Ambil konfigurasi dari RTDB. |
| `setConfig` | `config` | Simpan/merge konfigurasi ke RTDB. |
| `syncAll` | — | Sinkronkan seluruh sheet → RTDB. |

Jika `API_KEY` diset, sertakan `apiKey` di setiap request.

### Contoh (JavaScript `fetch`)
```js
const API = 'https://script.google.com/macros/s/XXXX/exec';
const res = await fetch(API, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ action: 'list' })
});
const { ok, data } = await res.json();
```

### Contoh (GET read-only)
```
.../exec?action=list
.../exec?action=get&id=EMP-20260807-101010-123
```

---

## 🔁 Cara Kerja Realtime
Setiap operasi tulis (create/update/delete/sync) memperbarui `meta/lastUpdate` di
Realtime Database. Frontend mendengarkan node tersebut via Firebase JS SDK; saat
berubah, tabel dimuat ulang otomatis — sehingga semua klien melihat data terbaru
tanpa refresh manual.

---

## 🛠️ Troubleshooting
- **`FIREBASE_DB_URL belum diset`** → isi Script Property `FIREBASE_DB_URL`.
- **Firebase 401/403** → RTDB rules terlalu ketat, atau `FIREBASE_SECRET` salah/kosong. Isi secret atau longgarkan rules.
- **Firebase 404 saat menulis** → URL database salah region. Cek URL di Console.
- **Frontend "realtime (akses ditolak)"** → `.read` pada `meta`/`employees` belum `true`. Terapkan `database.rules.json`.
- **CORS error di frontend standalone** → pastikan `Content-Type: text/plain;charset=utf-8` (sudah diterapkan di `web/index.html`).
