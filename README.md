# Dashboard & Database Karyawan (SDM) — GFI

Aplikasi **Google Apps Script Web App** yang menjadikan **Google Spreadsheet
sebagai database karyawan** sekaligus menyajikan **dashboard interaktif**.

- **Database:** sheet `data base SDM` di Google Spreadsheet (kolom A = `ID`).
- **Dashboard 3 tab:**
  - **📈 Ringkasan** — kartu KPI (total, SPV/leader, crew, aktif/non-aktif,
    ada SP) + distribusi (jenis karyawan, jabatan, pendidikan).
  - **👥 SPV & Crew** — kelompokkan karyawan per SPV/tim/divisi (kolom bisa
    dipilih); SPV terdeteksi otomatis dari `JABATAN` (SPV/Supervisor/Leader/
    Koordinator/Kepala/Manager) dan ditandai 🌟.
  - **🗂️ Data Karyawan** — tabel + pencarian + CRUD.
- **Foto tampil** dari kolom `UPLOUD FOTO` (link Google Drive) sebagai avatar,
  plus **profil interaktif**: klik baris/kartu untuk melihat detail lengkap +
  tautan foto & KTP.

> ⚠️ Agar foto muncul, file di Google Drive harus dibagikan **"Anyone with the
> link"** (Siapa saja yang memiliki link). Jika tidak, avatar otomatis
> menampilkan inisial nama.
- **CRUD penuh:** tambah / ubah / hapus karyawan langsung dari halaman.
- **Kolom dinamis:** tambah / ganti nama / hapus kolom.
- **REST API JSON** (opsional) untuk integrasi luar.
- **Firebase Realtime Database** bersifat **OPSIONAL** — inti aplikasi berjalan
  penuh hanya dengan Spreadsheet. Firebase aktif otomatis bila
  `FIREBASE_DB_URL` diisi di Script Properties.

---

## 📁 Isi Repository

| File | Fungsi |
|------|--------|
| `Code.gs` | Server utama: router, CRUD, statistik dashboard, manajemen kolom, `setup()`. Sheet = database. |
| `Index.html` | Frontend dashboard yang disajikan Apps Script via `google.script.run`. |
| `Firebase.gs` | Helper koneksi Realtime Database (REST). Hanya dipakai bila Firebase diaktifkan. |
| `appsscript.json` | Manifest project (scope & akses webapp). |
| `web/index.html` | Frontend standalone (memakai `fetch` ke REST API `/exec`). |
| `database.rules.json`, `firebase.json` | Konfigurasi Firebase (opsional). |

---

## 🗂️ Struktur Database (Sheet `data base SDM`)

Kolom **A** = `ID` (dibuat otomatis). Kolom berikutnya = field data:

`NAMA LENGKAP`, `NIK KTP`, `NO.NPWP`, `TEMPAT, TANGGAL LAHIR`, `STATUS`,
`JUMLAH ANAK`, `JOINT KERJA DI GFI`, `JABATAN`, `E-MAIL`,
`PENDIDIKAN TERAKHIR`, `REKENING BCA`, `UPLOUD FOTO`, `UPLOUD KTP`,
`ALAMAT DOMISILI`, `Nomor HP yang dapat dihubungi`, `TANGGAL LAHIR`,
`STATUS AKTIF`, `JENIS KARYAWAN`, `STATUS SP`, `TANGGAL SP`, `KETERANGAN SP`

> Kolom bisa ditambah/dihapus dari dashboard; statistik menyesuaikan otomatis.

---

## 🚀 Cara Deploy (tanpa Firebase — cukup Spreadsheet)

1. **Buat/siapkan Spreadsheet** karyawan Anda.
2. **Extensions → Apps Script**. Buat file dan tempel isinya:
   - `Code.gs`, `Firebase.gs` (file *Script*).
   - `Index.html` (file *HTML* — beri nama persis **`Index`**).
   - Salin `appsscript.json` ke manifest (**Project Settings → tampilkan
     `appsscript.json`**).
3. **Jalankan fungsi `setup()`** sekali dari editor (pilih `setup`, klik *Run*),
   setujui izin OAuth. Ini membuat sheet + baris header (database).
   - *(Opsional)* jalankan `seedContoh()` untuk mengisi 1 baris contoh.
4. **Deploy → New deployment → Web app**
   - *Execute as*: **Me** · *Who has access*: **Anyone**.
5. Buka **URL Web App** (diakhiri `/exec`) → dashboard langsung tampil. ✅

### Mengaktifkan Firebase (opsional)
Isi **Project Settings → Script Properties**:

| Key | Nilai | Wajib |
|-----|-------|-------|
| `SPREADSHEET_ID` | ID spreadsheet (diisi otomatis oleh `setup()` bila terikat) | ✅ |
| `FIREBASE_DB_URL` | mis. `https://<project>-default-rtdb.firebaseio.com` | opsional |
| `FIREBASE_SECRET` | database secret / token `?auth=` | opsional |
| `API_KEY` | kunci proteksi REST API sederhana | opsional |

Setelah `FIREBASE_DB_URL` diisi, setiap create/update/delete akan tersinkron ke
Realtime Database, dan tombol/aksi `syncAll` mengunggah seluruh data.

---

## 🔌 REST API JSON (opsional)

Base URL = URL Web App (`.../exec`). Balasan: `{ ok:true, data }` atau
`{ ok:false, error }`.

**POST** (disarankan) — body JSON, `Content-Type: text/plain;charset=utf-8`:

```json
{ "action": "create", "record": { "NAMA LENGKAP": "Budi", "JABATAN": "Staff" } }
```

| Action | Parameter | Keterangan |
|--------|-----------|------------|
| `ping` | — | Cek server hidup. |
| `dashboard` | — | Statistik ringkasan untuk kartu & grafik. |
| `list` | — | Ambil semua karyawan. |
| `get` | `id` | Ambil 1 karyawan. |
| `create` | `record` | Tambah karyawan (ID otomatis). |
| `update` | `id`, `record` | Ubah data karyawan. |
| `delete` | `id` | Hapus karyawan. |
| `getColumns` | — | Daftar kolom. |
| `addColumn` | `name` | Tambah kolom. |
| `renameColumn` | `oldName`, `newName` | Ganti nama kolom. |
| `deleteColumn` | `name` | Hapus kolom. |
| `getConfig` | — | Konfigurasi + daftar kolom. |
| `syncAll` | — | Sinkronkan sheet → Firebase (bila aktif). |

Jika `API_KEY` diset, sertakan `apiKey` di setiap request.

### Contoh (GET read-only)
```
.../exec?action=list
.../exec?action=dashboard
```

---

## 🧩 Catatan Teknis

- Frontend memanggil fungsi server lewat `google.script.run`. **Fungsi yang
  dipanggil harus publik** (tanpa garis bawah `_` di akhir) — di `Code.gs`
  semuanya berawalan `api...` (mis. `apiBootstrap`, `apiCreateEmployee`).
- `apiBootstrap()` mengambil kolom + data + statistik dalam satu panggilan agar
  dashboard cepat dimuat.
- Semua integrasi Firebase dibungkus aman: bila `FIREBASE_DB_URL` kosong atau
  gagal, operasi Spreadsheet tetap berhasil.

---

## 🛠️ Troubleshooting

- **Dashboard kosong** → jalankan `setup()`, lalu isi data (atau `seedContoh()`).
- **`SPREADSHEET_ID belum diset`** → jalankan `setup()` dari dalam Spreadsheet
  yang terikat, atau isi Script Property `SPREADSHEET_ID` manual.
- **Perubahan tidak muncul** → klik **🔄 Muat Ulang** di dashboard.
- **Firebase 401/403/404** → cek `FIREBASE_DB_URL`/`FIREBASE_SECRET` dan rules.
  Ini tidak mempengaruhi fungsi inti (Spreadsheet).
