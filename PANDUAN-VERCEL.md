# Panduan Deploy Frontend ke Vercel

Frontend ini adalah aplikasi statis (SPA). Ia bisa dihosting **gratis** di
Vercel. Yang perlu disiapkan hanya URL backend Apps Script dari
`PANDUAN-APPS-SCRIPT.md`.

Folder yang dipakai: **`deploy/pickup-vercel/`**.

---

## Persiapan

1. Pastikan Anda sudah menyelesaikan `PANDUAN-APPS-SCRIPT.md` dan punya
   **Web app URL** (berakhiran `/exec`).
2. Punya akun di https://vercel.com (bisa daftar gratis pakai akun GitHub/Google).

---

## Cara A — Lewat website Vercel (paling mudah, tanpa coding)

### 1. Unggah kode ke GitHub

1. Buat repository baru di https://github.com (boleh private).
2. Unggah **isi folder `deploy/pickup-vercel/`** ke repository tersebut.
   (Folder `pickup-vercel` jadi root repo — file `package.json` harus berada
   di paling atas repo.)

### 2. Import ke Vercel

1. Buka https://vercel.com/new.
2. Pilih repository GitHub tadi → **Import**.
3. Vercel otomatis mendeteksi **Vite**. Biarkan pengaturan default:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Buka bagian **Environment Variables**, tambahkan:
   - **Name**: `VITE_APPS_SCRIPT_URL`
   - **Value**: URL Web App Apps Script Anda (yang berakhiran `/exec`)
5. Klik **Deploy** dan tunggu sampai selesai.
6. Vercel memberi URL publik, mis. `https://pickup-gudang.vercel.app`.

---

## Cara B — Lewat terminal (Vercel CLI)

```bash
# 1. Masuk ke folder
cd deploy/pickup-vercel

# 2. Install dependensi
npm install

# 3. (opsional) coba jalankan lokal
echo "VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/XXX/exec" > .env
npm run dev

# 4. Install Vercel CLI lalu deploy
npm install -g vercel
vercel
# ikuti petunjuk; saat ditanya, set Environment Variable:
#   VITE_APPS_SCRIPT_URL = URL Web App Apps Script Anda

# 5. Deploy ke produksi
vercel --prod
```

> Penting: variabel `VITE_APPS_SCRIPT_URL` dibaca **saat build**. Jika Anda
> mengubahnya, jalankan **deploy ulang** agar perubahan diterapkan.

---

## Setelah live

- Buka URL Vercel Anda. Halaman driver muncul di `/`, admin di `/admin`,
  dashboard di `/dashboard`.
- Ganti **target QR code** lama menjadi URL Vercel yang baru.
- PIN admin & security diatur di Apps Script (Script Properties), bukan di sini.

---

## Cara kerja sinkronisasi (penting untuk driver)

Saat driver menekan **Konfirmasi Pickup**, data **langsung tersimpan di
perangkat** dan layar sukses tampil seketika — walau sinyal lemah. Aplikasi
lalu mengirim data ke server di latar belakang dan mencoba ulang otomatis bila
gagal. Status sinkron ditampilkan di layar sukses:

- **"Menyinkronkan ke server..."** — sedang/akan dikirim (termasuk saat offline).
- **"Tersinkron ke server."** — sudah masuk ke Google Sheet.
- **Peringatan kuning** — data tersimpan di perangkat tapi ditolak server
  (mis. kode sudah pernah diambil).

Selama tab tidak ditutup sebelum tersinkron, data aman. Sebaiknya pastikan
muncul "Tersinkron" sebelum menutup aplikasi pada koneksi yang sangat buruk.

---

## Masalah umum

- **Halaman putih / 404 saat refresh di `/admin`**: pastikan file `vercel.json`
  ikut ter-deploy (berisi aturan rewrite ke `index.html`). File ini sudah
  disertakan di folder.
- **Data tidak muncul / error koneksi**: cek `VITE_APPS_SCRIPT_URL` sudah benar
  dan sudah deploy ulang setelah mengisinya. Uji backend dengan membuka
  `URL?action=health` di browser.
- **PIN tidak diterima**: PIN diatur di Apps Script (Script Properties
  `ADMIN_PIN` / `DASHBOARD_PIN`).
