# SIAPIN

## Deploy ke VPS dengan Docker

Setup mengikuti Nginx/Certbot yang sudah berjalan di VPS. Domain frontend adalah
`https://siapin.dikalaksana.com`, sedangkan API berada di
`https://api-siapin.dikalaksana.com` (contoh endpoint: `/auth/login`, tanpa `/api`).

Container proyek ini tidak membuka port host, sehingga tidak merebut port 80/443
milik Nginx maupun port 5432 milik PostgreSQL aplikasi lain. Service `siapin-web`
dan `siapin-api` memakai nama unik pada network external `manris_manris-network`.
Service database `siapin-db` tetap terpisah pada network default dan volume
`siapin_postgres_data`. Nginx existing meneruskan request ke kedua service melalui
network Docker, sedangkan Caddy hanya menyajikan frontend melalui HTTP internal.

### Instalasi existing: ganti nama project dan database

Instalasi lama memakai project/user/database `pintar`. Jangan langsung menjalankan
Compose baru karena nama project baru memilih volume `siapin_postgres_data`.
Workflow akan berhenti jika mendeteksi instalasi lama, agar tidak menyalakan
aplikasi dengan database kosong.

Setelah perubahan ini di-push dan tersedia di VPS, jalankan **sekali**:

```sh
cd /opt/siapin
git pull origin main
python3 deploy/migrate-to-siapin.py --apply
```

Lakukan saat tidak ada deploy lain atau penulisan melalui DBeaver. Script build
terlebih dahulu, menghentikan API/frontend lama, menyimpan dump private di
`backups/`, lalu restore ke database baru dalam satu transaksi. Jumlah baris
setiap tabel (termasuk riwayat Prisma) dicocokkan sebelum aplikasi baru diaktifkan.
Seluruh data dan hash password akun aplikasi ikut dipindahkan.

Jika restore atau startup gagal, script menghentikan stack baru dan mencoba
menyalakan API/frontend lama kembali. Kedua volume serta dump tetap disimpan;
target yang sudah ada tidak akan ditimpa saat script dijalankan ulang. Periksa
penyebab dan isi volume sebelum menghapus apa pun. Script tidak mengubah aplikasi
lain, Nginx, atau network proxy existing.

Setelah sukses, ulangi job GitHub Actions. Container lama dihapus, sedangkan
volume lama `pintar_postgres_data` tetap disimpan sebagai cadangan. User dan nama
database DBeaver sekarang **`siapin`**, dengan password yang sama dari `.env`.
IP container database berubah; ambil ulang dengan:

```sh
docker inspect siapin-siapin-db-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
```

Perbarui Host DBeaver dan `PermitOpen` user SSH khusus engineer bila sebelumnya
menggunakan IP lama. Jika mengubah konfigurasi SSH, jalankan `sudo sshd -t`
sebelum reload. Jangan menghapus volume lama sebelum memverifikasi aplikasi dan
backup. Untuk instalasi baru, langsung ikuti setup di bawah.

### 1. Siapkan konfigurasi aplikasi

Di VPS, clone repository ke `/opt/siapin`, lalu jalankan:

```sh
cd /opt/siapin
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
nano .env
```

Isi `.env` root:

- `POSTGRES_PASSWORD`: hasil perintah pertama, gunakan hex agar aman dalam URL database.
- `JWT_SECRET`: hasil perintah kedua, berbeda dari password database.
- `FRONTEND_URL`: `https://siapin.dikalaksana.com`, juga menjadi origin CORS yang diizinkan.
- `API_URL`: `https://api-siapin.dikalaksana.com`, ditanam ke frontend ketika build.
- `PROXY_NETWORK`: `manris_manris-network`, sesuai network Nginx existing.
- `RESEND_API_KEY`: API key Resend untuk notifikasi akun dan tautan reset kata sandi.
- `EMAIL_FROM`: pengirim dari domain yang sudah diverifikasi di Resend.

Untuk memakai **Lupa kata sandi** di luar Docker, atur `RESEND_API_KEY`, `EMAIL_FROM`, dan `FRONTEND_URL` di `backend/.env`. Gunakan URL frontend yang dapat dibuka oleh penerima email (`http://localhost:5173` untuk pengembangan di mesin yang sama). Dari folder `backend`, jalankan `npx prisma migrate deploy` dan `npx prisma generate`, lalu mulai ulang backend. Docker Compose menjalankan migrasi saat container API dimulai. Tautan dikirim ke alamat email akun aktif yang terdaftar dan berlaku 30 menit.

Jika `.env` sudah ada, edit nilainya tanpa mengganti password database/JWT yang
sudah digunakan. Baris `APP_DOMAIN` dan `HTTP_PORT` dari konfigurasi lama tidak
lagi dipakai. Docker tidak memerlukan `.env` di folder frontend/backend.

Pastikan network existing tersedia, lalu jalankan aplikasi:

```sh
docker network inspect manris_manris-network
docker compose up -d --build --wait --wait-timeout 180
docker compose ps
```

Jika network tidak ditemukan, periksa konfigurasi Nginx; jangan membuat network
pengganti dengan nama sama tanpa memastikan Nginx terhubung. Jangan tambahkan
`container_name: backend`, `frontend`, `nginx`, atau `postgres` karena nama-nama
tersebut sudah digunakan aplikasi lain. Folder deploy adalah `/opt/siapin` dan
nama project Compose adalah `siapin`. Sesudah migrasi satu kali, pertahankan nama
project tersebut agar tetap memakai volume database yang sama.

### 2. DNS dan HTTPS melalui Nginx existing

Buat dua record DNS berikut menuju **IP publik VPS yang sama**:

| Tipe | Nama | Target |
| --- | --- | --- |
| A | `siapin` | IP publik VPS |
| A | `api-siapin` | IP publik VPS |

Tidak perlu mengubah record `@` atau domain aplikasi lain. Jika ada `AAAA` untuk
kedua subdomain, pastikan IPv6-nya benar; hapus jika VPS tidak melayani IPv6.
Gunakan mode **DNS only** saat setup awal jika memakai Cloudflare.

Port 80/443 tetap dilayani container `nginx` existing. Berdasarkan hasil inspect:

- Konfigurasi vhost: `/opt/manris/nginx/conf.d` → `/etc/nginx/conf.d`.
- Sertifikat: `/opt/manris/certbot/conf` → `/etc/letsencrypt`.
- Webroot ACME: `/opt/manris/certbot/www` → `/var/www/certbot`.

Tambahkan hanya file `siapin.conf`. Jangan mengganti `nginx.conf`, file vhost
aplikasi lain, atau menghentikan container Nginx. Jika `siapin.conf` sudah ada,
backup dan periksa isinya sebelum menimpa. Pastikan belum ada vhost lain dengan
kedua nama subdomain ini. Contoh file diberikan untuk ditambahkan pada blok
`http` melalui `include /etc/nginx/conf.d/*.conf`; periksa dengan
`docker exec nginx nginx -T` jika konfigurasi utama memakai pola berbeda.

**Terbitkan sertifikat pertama:**

```sh
cd /opt/siapin
sudo cp deploy/nginx/siapin-http.conf /opt/manris/nginx/conf.d/siapin.conf
docker exec nginx nginx -t && docker exec nginx nginx -s reload
```

Lanjutkan hanya jika tes/reload berhasil. Konfigurasi sementara ini melayani
challenge ACME untuk kedua subdomain. Halaman aplikasi sementara merespons 503
sampai konfigurasi HTTPS dipasang.

```sh
read -rp "Email untuk akun Let's Encrypt: " SIAPIN_CERT_EMAIL
docker run --rm \
  -v /opt/manris/certbot/www:/var/www/certbot \
  -v /opt/manris/certbot/conf:/etc/letsencrypt \
  certbot/certbot:v3.3.0 certonly \
  --webroot -w /var/www/certbot \
  --cert-name siapin.dikalaksana.com \
  -d siapin.dikalaksana.com -d api-siapin.dikalaksana.com \
  --email "$SIAPIN_CERT_EMAIL" --agree-tos --non-interactive --no-directory-hooks
```

Setelah sertifikat berhasil terbit, pasang konfigurasi HTTPS:

```sh
sudo cp deploy/nginx/siapin-https.conf /opt/manris/nginx/conf.d/siapin.conf
docker exec nginx nginx -t && docker exec nginx nginx -s reload
```

Jika `nginx -t` gagal, jangan reload. Perbaiki atau kembalikan hanya file
`siapin.conf` tersebut; worker yang masih aktif tetap memakai konfigurasi lama.
Frontend dan API sekarang tersedia di domain masing-masing. HTTP dialihkan ke
HTTPS. Upstream Nginx memakai Docker DNS dengan resolusi ulang, sehingga alamat
container baru saat deploy tidak perlu dimasukkan manual.

**Perpanjangan sertifikat:** container `certbot` pada screenshot sedang berhenti,
jadi jangan mengasumsikan renewal sudah aktif. Uji script khusus sertifikat SIAPIN:

```sh
bash /opt/siapin/deploy/renew-certificate.sh --dry-run
mkdir -p /opt/siapin/backups
crontab -e
```

Jika belum ada renewal yang aktif untuk sertifikat SIAPIN, tambahkan baris ini
pada crontab user deploy yang mempunyai akses Docker:

```cron
17 2,14 * * * /usr/bin/flock -n /tmp/siapin-certbot.lock /bin/bash /opt/siapin/deploy/renew-certificate.sh >> /opt/siapin/backups/renew-certificate.log 2>&1
```

Script memakai penyimpanan Certbot existing, hanya memilih sertifikat
`siapin.dikalaksana.com`, dan tidak menjalankan directory hooks sertifikat lain.
Nginx dites lalu di-reload setelah perintah renewal sukses. Jangan memasang cron
kedua jika scheduler existing sudah menangani sertifikat ini.

DNS, config Nginx, sertifikat pertama, dan cron hanya perlu disiapkan sekali.
Workflow GitHub Actions selanjutnya meng-update container proyek ini tanpa
mengubah konfigurasi atau me-restart container aplikasi lain. Karena API URL
tertanam saat build, perubahan `API_URL` memerlukan build/deploy ulang.

### 3. Aktifkan admin pertama

Daftarkan akun melalui halaman registrasi sebagai Reviewer/Penilai. Setelah itu,
masuk ke PostgreSQL melalui VPS:

```sh
docker compose exec siapin-db psql -U siapin -d siapin
```

Jalankan SQL berikut dengan email akun yang baru didaftarkan:

```sql
UPDATE "User"
SET role = 'SUPER_ADMIN', status_registrasi = 'APPROVED'
WHERE email = 'email-admin-anda@example.com';
\q
```

Pastikan hasilnya `UPDATE 1`, lalu login. Ini hanya perlu dilakukan sekali.

### Update dan operasional

```sh
# Backup sebelum update; simpan juga salinannya di luar VPS.
docker compose exec -T --interactive=false siapin-db pg_dump -U siapin -d siapin -Fc > backup.dump

# Ambil versi terbaru dan terapkan.
git pull
docker compose up -d --build --wait --wait-timeout 180

# Lihat log.
docker compose logs --tail=100 -f

# Hentikan aplikasi; data database tetap tersimpan.
docker compose down
```

Jangan gunakan `docker compose down -v` karena itu menghapus volume database proyek ini.
Password PostgreSQL hanya dipakai untuk inisialisasi volume baru; mengganti
`POSTGRES_PASSWORD` di `.env` saja tidak mengganti password database yang sudah ada.

Untuk memulihkan backup ke database **kosong** pada instalasi baru:

```sh
docker compose up -d siapin-db --wait
docker compose exec -T siapin-db pg_restore -U siapin -d siapin --no-owner --exit-on-error < backup.dump
docker compose up -d --build --wait --wait-timeout 180
```

## Auto-deploy dari GitHub Actions

Workflow [Deploy VPS](.github/workflows/deploy.yml) berjalan setiap push ke `main`,
atau lewat **Actions → Deploy VPS → Run workflow** pada branch `main`.
Build dilakukan langsung di VPS, sehingga tidak perlu container registry.

### Setup sekali di VPS

1. Selesaikan setup Docker dan `.env` di atas. Gunakan clone repository pada branch
   `main`, misalnya di `/opt/siapin`, dan pastikan tidak ada perubahan lokal pada
   file yang dilacak Git.
2. User SSH untuk deploy harus memiliki akses tulis ke folder itu dan bisa
   menjalankan `docker compose` tanpa `sudo`. Setelah menambahkan user ke grup
   `docker`, login ulang agar keanggotaan grup aktif.
3. Pastikan `git fetch origin main` bisa berjalan tanpa meminta password. Untuk
   repository private, gunakan SSH deploy key dengan akses baca ke repository;
   private key ini disimpan di VPS. Remote repo ini dapat diubah dengan
   `git remote set-url origin git@github.com:riskazataa/pintar.git`.
4. Buat SSH key khusus GitHub Actions pada komputer yang kamu gunakan untuk setup:

   ```sh
   ssh-keygen -t ed25519 -f siapin-actions -C github-actions-siapin -N ''
   ```

   Tambahkan isi `siapin-actions.pub` ke `~/.ssh/authorized_keys` milik user deploy
   di VPS. Isi file `siapin-actions` menjadi secret `VPS_SSH_KEY` di GitHub.
   Ini key untuk **Actions → VPS**, berbeda dari key **VPS → GitHub** untuk fetch
   repository private. Jangan simpan private key di repository.

### GitHub Secrets

Di repository GitHub, buka **Settings → Secrets and variables → Actions → New
repository secret**, lalu isi:

| Secret | Nilai |
| --- | --- |
| `VPS_HOST` | IP atau hostname VPS, tanpa `http://` |
| `VPS_USER` | User SSH yang memiliki akses Docker dan folder aplikasi |
| `VPS_PORT` | Port SSH; opsional, default `22` |
| `VPS_PATH` | Path absolut clone repository, misalnya `/opt/siapin`; tanpa spasi |
| `VPS_SSH_KEY` | Seluruh isi private key `siapin-actions` |
| `VPS_KNOWN_HOSTS` | Baris host key SSH VPS yang sudah diverifikasi |

Untuk mendapatkan baris `VPS_KNOWN_HOSTS`, jalankan di komputer setup:

```sh
ssh-keyscan -p 22 -H IP_VPS > siapin-known-hosts
ssh-keygen -lf siapin-known-hosts
```

Cocokkan fingerprint dengan host key pada console VPS, misalnya
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`, lalu salin isi file
`siapin-known-hosts` ke secret tersebut. Gunakan port SSH sebenarnya jika bukan 22.
Workflow memeriksa host key ini saat menghubungkan ke VPS.

Setelah semua perubahan ini di-commit dan di-push ke `main`, workflow mengambil
commit yang memicu run, build kedua image, backup database ke folder `backups/`
di VPS, lalu menjalankan Compose dan menunggu backend sehat. Deploy dijalankan
bergantian agar migrasi tidak bertabrakan. Jika build atau backup gagal, update
container aplikasi tidak dilanjutkan. Backup disimpan dengan akses terbatas;
salin ke luar VPS dan bersihkan backup lama secara berkala.

Update dapat menyebabkan jeda singkat. Jika migrasi atau startup gagal,
workflow gagal tanpa rollback otomatis; cek log di VPS dengan
`docker compose logs --tail=100 siapin-api`. Jangan memulihkan backup atau mengganti
versi aplikasi sebelum memeriksa kompatibilitas schema database.
