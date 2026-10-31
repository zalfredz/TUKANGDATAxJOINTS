# TUKANGDATA · Demo prediksi tiket

Buka `index.html` di browser (Chrome/Edge). Satu file, bisa jalan offline, tinggal upload ke Render/Netlify sebagai static site.

## Isi folder

| Path | Isi |
|---|---|
| `index.html` | Halaman demo siap pakai (hasil gabungan `src/` + `data/`) |
| `src/template.html` | Tampilan: HTML dan CSS |
| `src/engine.js` | Perhitungan: kalender libur, estimasi kasus serupa, penyesuaian Lebaran/NYE/Ramadan/Nyepi dari notebook JOINTS, aturan keputusan berbasis kapasitas |
| `src/ui.js` | Interaksi: form, grafik 10 hari, tab Manajer |
| `data/data.json` | Data yang tertanam di halaman: prediksi TabICLv2 + penjualan aktual (validasi silang), kalender, prior Lebaran |
| `build/` | Skrip Python pembuat `data.json` dan `index.html` |
| `check/` | Skrip Node pengecekan: keputusan vs data aktual (`check2.mjs`) dan uji input acak (`fuzz.mjs`) |

## Aturan keputusan

Kapasitas per hari = jumlah pertunjukan D1–D3 × 149 kursi, minimal penjualan terlaris D1–D3 ÷ 85%.

1. **Hentikan**: prediksi 0 tiket sampai D10
2. **Tingkatkan**: prediksi melewati kapasitas
3. **Kurangi**: rata-rata D8–D10 di bawah separuh rata-rata D1–D3
4. **Pertahankan**: selain itu

## Sumber data

Semua dari kit presentasi dan zip submisi: `oof_merged.parquet` (validasi silang TabICLv2, data latih Apr–Sep 2025), `calendar_features.csv`, `cal_final_cohort_multipliers.csv`, `priors_lebaran_citytype_final.csv`, `priors_mudik_citytype.csv`. Data uji (4 film Yogyakarta, Natal 2025) dari kartu S14 di `06_FAKTA_ANGKA.md`, tanpa penjualan aktual.

## Membangun ulang

Skrip di `build/` mengharapkan folder kit di `../kit/ppt_joints_kit/` relatif terhadap folder kerja. Urutan: `build.py` → `build2.py` → `augment.py` → `patch3.py` → `patch4.py` (menghasilkan `tiga-hari-cukup.html` dan `standalone.html`; `standalone.html` = `index.html`). Butuh Python dengan `polars` dan `numpy`. Skrip `patch4.py` membaca file dengan nama lamanya (`template3.html`, `ui3.js`, `engine.js`, `data.json` di folder yang sama), jadi salin `src/` dan `data/` ke folder kerja dengan nama itu sebelum menjalankannya.
