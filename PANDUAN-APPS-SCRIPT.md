# Panduan Backend Google Apps Script

Backend ini menggantikan server Replit. Ia berjalan **gratis** di Google Apps
Script, langsung membaca dan menulis ke Google Sheet Anda. Tidak ada server yang
perlu dibayar.

Ikuti langkah berikut satu per satu.

---

## 1. Siapkan Google Sheet

1. Buka Google Sheet yang dipakai aplikasi (sheet pemilik). Jika belum punya,
   buat Spreadsheet baru.
2. Catat **ID Spreadsheet** dari URL. Contoh URL:
   `https://docs.google.com/spreadsheets/d/`**`1Jb3SAOEMt1DtreH16jt9C6wdcnl_I01-aGKGgjfGlpg`**`/edit`
   Bagian tebal itulah ID-nya.
3. Aplikasi akan otomatis membuat tab `MASTER_DATA` dan `RIWAYAT` beserta
   judul kolomnya bila belum ada. Anda tidak perlu membuatnya manual.

---

## 2. Buat proyek Apps Script

1. Buka https://script.google.com lalu klik **New project / Proyek baru**.
2. Hapus semua kode contoh di file `Code.gs`.
3. Buka file `deploy/apps-script/Code.gs` dari paket ini, salin **seluruh**
   isinya, lalu tempel ke editor Apps Script.
4. Klik ikon **Simpan** (Save).

---

## 3. Isi Script Properties (kata sandi & pengaturan)

1. Di kiri, klik ikon **Project Settings / Setelan proyek** (roda gigi).
2. Scroll ke bagian **Script Properties** lalu klik **Add script property**.
3. Tambahkan properti berikut:

   | Property         | Nilai                                              | Wajib? |
   | ---------------- | -------------------------------------------------- | ------ |
   | `SESSION_SECRET` | teks acak panjang (mis. 30+ karakter)              | Ya     |
   | `SPREADSHEET_ID` | ID Spreadsheet dari langkah 1                       | Ya\*   |
   | `ADMIN_PIN`      | PIN admin (default `4321` jika dikosongkan)        | Tidak  |
   | `DASHBOARD_PIN`  | PIN security (default `1234` jika dikosongkan)      | Tidak  |

   \* Jika dikosongkan, aplikasi memakai ID sheet bawaan pemilik. Sebaiknya
   tetap diisi agar jelas.

   > Cara membuat `SESSION_SECRET`: ketik karakter acak yang panjang, atau
   > gabungkan beberapa kata + angka. Jangan dibagikan ke siapa pun.

4. Klik **Save script properties**.

---

## 4. Deploy sebagai Web App

1. Klik tombol **Deploy** (kanan atas) → **New deployment**.
2. Klik ikon roda gigi di samping "Select type" → pilih **Web app**.
3. Isi:
   - **Description**: `Pickup Gudang API` (bebas)
   - **Execute as**: **Me** (akun Anda)
   - **Who has access**: **Anyone** (Siapa saja)
4. Klik **Deploy**.
5. Saat diminta, klik **Authorize access**, pilih akun Google Anda, lalu izinkan.
   - Jika muncul peringatan "Google hasn't verified this app", klik
     **Advanced** → **Go to (nama proyek)** → **Allow**. Ini normal untuk
     skrip milik sendiri.
6. Setelah selesai, salin **Web app URL**. Bentuknya seperti:
   `https://script.google.com/macros/s/AKfyc.....X/exec`

   **Simpan URL ini** — akan dipakai di langkah deploy frontend (Vercel).

---

## 5. Uji cepat

Buka URL Web App + `?action=health` di browser, contoh:

```
https://script.google.com/macros/s/AKfyc...X/exec?action=health
```

Jika muncul `{"ok":true,"data":{"status":"ok"}}` berarti backend sudah hidup.

---

## Penting saat memperbarui kode

Setiap kali Anda mengubah `Code.gs`, Anda **harus deploy ulang versi baru**:

- **Deploy** → **Manage deployments** → pilih deployment → ikon pensil (Edit)
  → **Version: New version** → **Deploy**.

URL Web App tetap sama, jadi frontend tidak perlu diubah.

---

## Masalah umum

- **Muncul halaman login Google / butuh izin**: pastikan "Who has access" =
  **Anyone**, dan Anda sudah Authorize di langkah 4.
- **`Akses ditolak. Masukkan PIN yang benar.`**: PIN salah, atau token
  kedaluwarsa (berlaku 12 jam) — cukup masukkan PIN lagi.
- **Data tidak masuk ke sheet**: cek `SPREADSHEET_ID` benar, dan akun Google
  yang dipakai punya akses edit ke sheet tersebut.
