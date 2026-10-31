# TUKANGDATA · Dashboard keputusan layar

Dashboard ini untuk manajer bioskop. Setelah tiga hari penjualan film (D1–D3), dashboard menjawab apa yang harus diputuskan pagi ini, mulai kapan, dan berapa pertunjukan per hari.
Buka `index.html` di browser. Satu file, data dan font sudah tertanam, jadi bisa jalan offline atau di-upload sebagai static site.

## Dua tab

| Tab | Isi |
|---|---|
| **Simulasi** | Pilih film (13 kasus data uji, semua film data uji dan validasi, atau film baru), kota, klaster, tanggal, dan tiket D1–D3. Keluarannya: saran besar dengan tanggalnya, kalimat langkah (mis. "Pada Kam 1 Jan, naikkan dari 3 jadi 4 pertunjukan"), total prediksi 7 hari, kebutuhan pertunjukan, keandalan saran, grafik 10 hari, dan panel **Kenapa saran ini** yang menandai aturan yang berlaku serta angka yang dibaca tiap aturan. |
| **Manajer** | Pilih data, kota, klaster, dan pagi keputusan. Keluarannya: jumlah per saran (bisa difilter), ringkasan uang dan pertunjukan, daftar **Yang perlu dilakukan** (urut dari yang paling mendesak), lalu tabel film per saran dengan keandalannya. Klik baris untuk membuka filmnya di Simulasi. |

## Aturan saran

Sama dengan kartu di presentasi. Lima aturan diperiksa **berurutan**, dan aturan pertama yang terpenuhi menjadi saran. Jadi satu film selalu mendapat tepat satu saran.

Istilah yang dipakai:

- **D1–D3** = tiga hari pertama yang sudah terjual. **D4–D10** = tujuh hari yang diprakirakan.
- **Rasio** = prakiraan tiket hari itu ÷ rata-rata tiket D1–D3 (minimal 1). Contoh: rasio 1,2× berarti 20% di atas rata-rata tiga hari pertama.
- **Pertunjukan dibutuhkan** per hari = prakiraan tiket ÷ (kursi per pertunjukan × okupansi target 40%), dibulatkan ke atas, minimal 1 bila masih ada tiket, dan tidak melebihi kapasitas klaster.
- **Keandalan** = porsi saran yang klaimnya terbukti pada data validasi (Apr–Sep 2025, 7.043 pasangan dengan penjualan aktual). Di bawah 50%, dashboard menulis "lemah, cek H-1".

| # | Saran | Kondisi (dicek pada prakiraan D4–D10) | Yang dilakukan manajer | Jadwal yang ditampilkan | Dianggap terbukti bila (aktual) | Keandalan |
|---|---|---|---|---|---|---|
| 1 | **Lepas layar** | Prakiraan dibulatkan 0 tiket dari suatu hari sampai D10 | Mulai hari itu, berikan layar ke film lain | Pertunjukan sekarang → 0 | Penjualan aktual D10 = 0 | 90% (2.680 kasus) |
| 2 | **Tambah jadwal** | Rasio tertinggi di Sabtu/Minggu dalam D4–D10 ≥ 1× | Tambah pertunjukan di akhir pekan | Pertunjukan sekarang → kebutuhan di hari puncak. Bila jadwal sekarang sudah menampung, ditulis "cukup": siapkan cadangan dan putuskan dari penjualan H-1 | Rasio aktual di Sabtu/Minggu itu ≥ 1× | 81% (2.466 kasus) |
| 3 | **Jadwal ekstra** | Hari libur nasional atau cuti bersama (D5–D10) yang tiketnya ≥ +20% dibanding hari sebelumnya | Buka jadwal tambahan di hari libur itu | Kebutuhan hari sebelumnya → kebutuhan hari libur | Aktual hari libur ≥ 1,2× aktual hari sebelumnya | 39% (183 kasus), lemah: cek penjualan H-1 dulu |
| 4 | **Pertahankan** | Rata-rata rasio D8–D10 (pekan kedua) ≥ 0,5× | Jadwal tetap sampai D10 | Pertunjukan sekarang → kebutuhan tertinggi D8–D10 | Rata-rata rasio aktual D8–D10 ≥ 0,5× | 31% (140 kasus), lemah |
| 5 | **Kurangi** | Selain di atas; mulai dari hari pertama rasio < 0,5× | Turunkan jumlah pertunjukan mulai hari itu | Pertunjukan sekarang → kebutuhan hari itu | Rata-rata rasio aktual dari hari itu sampai D10 < 0,5× | 73% (1.574 kasus) |

Catatan:

- **Urutan penting.** Contoh: film yang rasionya ≥ 1× di hari Sabtu mendapat *Tambah jadwal* walaupun pekan keduanya juga turun. Panel **Kenapa saran ini** di tab Simulasi menunjukkan aturan mana yang tidak terpenuhi, mana yang berlaku, dan angka yang dibaca tiap aturan.
- **Saran membaca arah permintaan, bukan kursi.** Karena itu *Tambah jadwal* bisa muncul walaupun kursi sekarang sudah cukup. Kolom jadwal lalu menulis "cukup".
- **Lebaran 2026** tidak ada di data validasi, jadi keandalannya tidak ditampilkan dan levelnya ditandai belum terukur. Lima judul Lebaran punya dua skenario (F2 utama, F1 tinggi), dan sarannya sama di keduanya.
- **Film baru** (isi manual) memakai estimasi cepat, lalu diperiksa dengan aturan yang sama. Pakai sebagai arah, bukan angka pasti.

Versi awal memakai aturan kapasitas yang berbeda dari kartu presentasi. Versi ini memakai satu aturan yang sama di semua tempat, dan `check_rules.mjs` memeriksanya terhadap Python pada semua pasangan.

## Data

- **Data uji (Okt 2025–Mar 2026), 10.373 pasangan:** prakiraan final `F2.csv`. Untuk 5 judul Lebaran, `F1.csv` menjadi skenario tinggi. Aktualnya belum ada.
- **Data validasi (Apr–Sep 2025), 7.043 pasangan:** prakiraan validasi silang model akhir, dengan aktual. Dari sini keandalan tiap saran dihitung (porsi klaim yang terbukti): Lepas 90%, Tambah 81%, Kurangi 73%, Jadwal ekstra 39%, Pertahankan 31%. Di bawah 50% dashboard menulis "lemah, cek H-1". Kohort Lebaran belum terukur.

## Lapisan tambahan (asumsi, bukan keluaran model)

- **Pertunjukan per hari** = prakiraan ÷ (kursi per pertunjukan × okupansi target 40%), dibatasi kapasitas klaster (persentil 99 pertunjukan harian di data latih). "Cukup" berarti arah permintaan naik, tetapi jadwal sekarang masih menampung.
- **Pendapatan** = tiket × harga batas atas kota, jadi cenderung lebih tinggi dari realisasi.
- **Film baru** memakai estimasi cepat (median 100 kasus validasi termirip), bukan model akhir.

## Struktur

```
index.html        hasil build, buka file ini
src/              engine.js (aturan, kalender, format), store.js (akses data, kartu manajer), ui.js, template.html
data/data.json    hasil build_data.py
assets/fonts/     Plus Jakarta Sans dan JetBrains Mono (latin), ditanam ke index.html
build/            build_data.py, proof_stats.py, titles.py, build_html.py
check/            check_rules.mjs, fuzz.mjs, check_data.py, load.mjs
```

## Membangun ulang dan memeriksa

```
python build/build_data.py     # hanya bila data sumber berubah (butuh folder proyek JOINTS)
python build/build_html.py
node check/check_rules.mjs     # kartu presentasi, paritas aturan JS dan Python, panel "kenapa" = saran
node check/fuzz.mjs            # semua kartu, 13 kasus, input formulir, teks tanpa NaN
python check/check_data.py     # data.json vs CSV sumber, halaman tanpa URL luar
```

Butuh Python (pandas, numpy, pyarrow) dan Node.js. Membuka `index.html` tidak membutuhkan semua ini.
