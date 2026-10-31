# TUKANGDATA · Dashboard keputusan layar

Dashboard ini untuk manajer bioskop. Setelah tiga hari penjualan film (D1–D3), dashboard menjawab apa yang harus diputuskan pagi ini, mulai kapan, dan berapa pertunjukan per hari.
Buka `index.html` di browser. Satu file, data dan font sudah tertanam, jadi bisa jalan offline atau di-upload sebagai static site.

## Dua tab

| Tab | Isi |
|---|---|
| **Simulasi** | Pilih film (13 kasus data uji, semua film data uji dan validasi, atau film baru), kota, klaster, tanggal, dan tiket D1–D3. Keluarannya: saran besar dengan tanggalnya, kalimat langkah (mis. "Pada Kam 1 Jan, naikkan dari 3 jadi 4 pertunjukan"), total prediksi 7 hari, kebutuhan pertunjukan, keandalan saran, grafik 10 hari, dan panel **Kenapa saran ini** yang menandai aturan yang berlaku serta angka yang dibaca tiap aturan. |
| **Manajer** | Pilih data, kota, klaster, dan pagi keputusan. Keluarannya: jumlah per saran (bisa difilter), ringkasan uang dan pertunjukan, daftar **Yang perlu dilakukan** (urut dari yang paling mendesak), lalu tabel film per saran dengan keandalannya. Klik baris untuk membuka filmnya di Simulasi. |

## Aturan saran

Sama dengan kartu di presentasi, diperiksa berurutan. Rasio = prakiraan ÷ rata-rata D1–D3.

1. 0 tiket sampai D10 → **Lepas layar**
2. Sabtu atau Minggu ≥ 1× → **Tambah jadwal**
3. Hari libur ≥ +20% dibanding hari sebelumnya → **Jadwal ekstra**
4. Rata-rata D8–D10 ≥ 0,5× → **Pertahankan**
5. Selain itu → **Kurangi** mulai rasio pertama kali < 0,5×

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
