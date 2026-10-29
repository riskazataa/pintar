# Assessment dua tahap

## Mengaktifkan

1. Backend: `npm ci`, `npx prisma generate`, `npx prisma migrate deploy`, `npm run build`.
2. Frontend: `npm ci`, `npm run build`.
3. Masuk sebagai SUPER_ADMIN, buka **Template Assessment**. Pilih **Mulai dari pertanyaan yang sekarang** atau susun pertanyaan sendiri. Self assessment dan review tahap 1 memakai susunan pertanyaan yang sama, tetapi jawaban terpisah.
4. Atur pertanyaan tahap 2 dan sumber copy untuk setiap baris tujuan. Sumber tahap 1 hanya self assessment; sumber tahap 2 boleh self assessment atau review tahap 1. Tanpa mapping, baris review kosong.
5. Simpan draf dan publikasikan paket. Paket yang dipublikasikan terkunci; gunakan Duplikat / versi baru untuk perubahan. Paket yang melekat pada usulan tidak diganti ketika paket baru dipublikasikan.
6. Satker mengajukan usulan memakai paket aktif. Admin membuka Assessment Tahap 1/2 dan menetapkan reviewer masing-masing tahap. Akun harus penilai Marvel/Itjen dengan registrasi APPROVED. Daftar reviewer tidak dapat diganti setelah disimpan, termasuk saat perbaikan.

Tidak ada paket yang dipublikasikan otomatis karena pertanyaan dan mapping merupakan keputusan admin. Sebelum ada paket terpublikasi, pengajuan baru ditolak dengan pesan yang menjelaskan kebutuhan template.

## Alur dan keputusan

- Self assessment → review tahap 1 → review tahap 2. Tahap 2 baru dibuat saat tahap 1 Lolos.
- Copy menyalin seluruh baris (Ya/Tidak, Catatan, Link), hanya sekali saat tahap pertama kali dibuat. Satu sumber dapat menuju beberapa tujuan; setiap tujuan hanya boleh satu sumber.
- Reviewer mengisi satu assessment bersama. Isian terkunci setelah tanda tangan pertama. Semua baris harus memiliki pilihan Ya/Tidak sebelum penandatanganan.
- Setiap reviewer menandatangani lalu memberikan suara Lolos/Tidak Lolos. Identitas penanda tangan diambil dari akun terautentikasi, bukan user ID payload.
- Hasil hanya final setelah semua reviewer menandatangani dan memilih. Lebih dari separuh suara Lolos berarti Lolos; seri berarti Tidak Lolos. Sebelum final, suara orang lain disembunyikan.
- Reviewer yang sama boleh bertugas dan menandatangani pada kedua tahap.
- Lolos berwarna hijau; Tidak Lolos merah. Tidak Lolos tahap 1 mengakhiri proses tanpa membuka tahap 2.
- Reviewer tahap aktif dapat mengembalikan ke self assessment dengan alasan. Hasil final hanya dapat dibuka ulang admin.
- Pengembalian mengarsipkan self assessment, isian, tanda tangan, dan suara; mereset tanda tangan/suara kedua tahap; mempertahankan draf isian dan reviewer. Pengiriman ulang satker mengaktifkan tahap 1 tanpa menjalankan copy ulang. Tahap 2 juga tidak disalin ulang bila sudah pernah dibuat.
- Ekspor Excel tersedia per tahap setelah hasil final. Kolom dan tata letak sebelumnya dipertahankan dengan tambahan Link paling kanan; tidak ditambahkan tabel voting. Hasil dan hitungan suara ditampilkan di aplikasi.

## Data dan kompatibilitas

Migrasi `20261029050000_two_stage_assessment` hanya menambahkan tabel paket, referensi paket, JSON workflow, dan kolom Link. Tidak menghapus jawaban/tanda tangan lama. Usulan lama tetap memakai alur lama dan tersedia lewat tautan **Buka usulan lama**. Tidak ada konversi otomatis karena jawaban satker lama mungkin sudah ditimpa reviewer sehingga asal jawaban tidak dapat dipastikan.

Workflow disimpan sebagai satu aggregate JSON dengan snapshot konfigurasi dan riwayat. Semua mutasi mengunci baris Inovasi (`FOR UPDATE`) dalam transaksi PostgreSQL dan memeriksa nomor revisi. Permintaan dengan revisi usang ditolak agar reviewer memuat ulang; jalur endpoint legacy tidak dapat mengubah workflow baru.

## Validasi

- Backend: `npm test -- --runInBand workflow.spec.ts` — aturan copy, dua tahap, suara mayoritas/seri, akses reviewer, penguncian, pengembalian, dan pengiriman ulang.
- Backend: `npm run build`, lalu `node test/workflow.integration.cjs` — controller HTTP nyata, validasi, PostgreSQL lokal, akses peran, transaksi konkuren, publikasi, tanda tangan, suara, dan pengiriman ulang. Jalankan saat aplikasi lokal tidak sedang digunakan: uji memublikasikan paket fixture sementara dan membersihkan hanya fixture miliknya.
- Frontend: `npm run build`, `node scripts/verify-result-export.cjs` — membaca kembali XLSX untuk memeriksa format, kolom Link induk/anak, serta gambar dan identitas tanda tangan.
