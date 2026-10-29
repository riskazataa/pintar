# Assessment dengan tahapan dinamis

## Menu dan konfigurasi

- Admin, reviewer, dan satker membuka **Inovasi**, memilih usulan, lalu memilih tahap yang ingin dibuka. Tahap ditampilkan mengikuti snapshot template usulan, bukan menu tahap 1/2 yang tetap.
- Admin mengelola **Template Assessment / Management BA Inovasi**. Tampilan pertanyaan memakai kartu induk/anak dan modal tambah/edit seperti tampilan sebelumnya.
- Jumlah tahap review dapat ditambah atau dikurangi pada versi draf, minimal satu tahap. Setiap tahap mempunyai nama dan susunan pertanyaan sendiri. Self assessment memakai pertanyaan tahap pertama dengan jawaban terpisah.
- Setiap baris mempunyai pilihan sumber copy. Sumbernya boleh self assessment atau tahap review mana pun yang mendahului tahap tujuan. Satu sumber boleh dipakai beberapa tujuan; setiap tujuan hanya satu sumber.
- Menghapus tahap atau pertanyaan juga membersihkan mapping terkait. Nomor referensi tahap yang masih ada disesuaikan. Menghapus tahap pertama membuang mapping dari self assessment lama karena susunan self assessment juga berubah.
- Simpan draf dan publikasikan. Paket terpublikasi terkunci; gunakan **Duplikat / Versi Baru** untuk perubahan. Paket baru tidak mengganti snapshot usulan yang sudah berjalan.

## Perilaku proses

1. Satker mengirim self assessment sesuai paket aktif.
2. Admin menetapkan reviewer setiap tahap. Daftarnya permanen setelah disimpan; reviewer yang sama boleh bertugas pada beberapa tahap.
3. Tahap pertama dibuat pada pengajuan. Tahap berikutnya baru dibuat ketika tahap sebelumnya Lolos. Copy Ya/Tidak, Catatan, dan Link hanya dijalankan pada pembuatan pertama masing-masing tahap.
4. Reviewer mengisi assessment bersama. Tanda tangan pertama mengunci isian. Setiap reviewer kemudian memilih Lolos/Tidak Lolos.
5. Setelah semua reviewer menandatangani dan memilih, lebih dari separuh suara Lolos menghasilkan Lolos. Seri berarti Tidak Lolos. Suara orang lain disembunyikan sampai hasil final.
6. Hasil Lolos membuka tahap berikutnya, sampai tahap terakhir. Hasil Tidak Lolos menghentikan tahap selanjutnya. Hijau menunjukkan Lolos; merah Tidak Lolos.
7. Reviewer tahap aktif dapat mengembalikan ke self assessment dengan alasan; hanya admin dapat membuka hasil yang sudah final. Semua tanda tangan/suara diarsipkan dan direset pada seluruh tahap, dengan draf isian serta penugasan tetap tersimpan.
8. Pengiriman ulang kembali ke tahap pertama. Tahap yang pernah dibuat tidak menjalankan copy ulang.
9. Excel tersedia per tahap yang final. Format sebelumnya tetap digunakan, dengan tambahan kolom Link; tanda tangan mengikuti tahap yang diekspor.

## Kompatibilitas

Tidak diperlukan perubahan struktur database untuk tahapan dinamis karena workflow dan konfigurasi merupakan snapshot JSON. Snapshot versi sebelumnya dengan `tahap1`/`tahap2` dibaca sebagai daftar dua tahap tanpa mengubah data tersimpan saat dibaca. Mutasi berikutnya menyimpan bentuk daftar tersebut dalam transaksi yang sama. Riwayat, jawaban, reviewer, dan tanda tangan tetap dipertahankan.

Usulan sebelum fitur workflow tetap menggunakan halaman versi lama. Tidak dilakukan konversi otomatis terhadap jawaban legacy yang asal self assessment-nya tidak dapat dipastikan.

## Validasi

- Backend: `npm run build`, `npm test -- --runInBand workflow.spec.ts`.
- Backend: `node test/workflow.integration.cjs`. Uji HTTP dan PostgreSQL memakai schema sementara terisolasi, menerapkan migrasi di dalamnya, lalu membersihkan schema uji. Template aktif dan data aplikasi tidak berubah.
- Frontend: `npm run build`, `node scripts/verify-template-config.cjs`, `node scripts/verify-result-export.cjs`.
- Pengujian mencakup alur 1, 3, 5, dan 12 tahap; kompatibilitas dua tahap lama; referensi mapping saat penghapusan; mayoritas suara; pengembalian; penyimpanan konkuren; serta format dan gambar tanda tangan Excel.
