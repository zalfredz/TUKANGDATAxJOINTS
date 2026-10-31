// The two pages: Simulasi (one film in one cluster) and Ringkasan Klaster (the new films of a cluster on one morning).
const $ = (id) => document.getElementById(id);
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

const NEW_FILM = '__new';
const MIN_D1 = '2025-03-01';
const MAX_D1 = '2026-04-21';
const MAX_TICKETS = 100000;
const MAX_THEATERS = 30;
const SEATS_PER_SHOW = 149; // median of the train data (kit 06_FAKTA_ANGKA part B)
const SHOWS_PER_THEATER = 5;
const TARGET = DEFAULT_TARGET_OCCUPANCY;
const SCHOOL_HOLIDAY_WEIGHT = 0.91;
const CHART_MAX_CAPACITY_RATIO = 2; // above this the capacity line would flatten the bars, so it is not drawn
const CHART_HEADROOM = 1.05;
const CHART_DAYS = 10;
const SPARK_HEIGHT = 26;
const INPUT_DELAY_MS = 250;
const SET_NAME = { test: 'Data uji', val: 'Data validasi' };
const WEEK_GROUPS = ['Hari biasa', 'Libur nasional', 'Libur sekolah'];
const KIND_COLOR = { tambah: 'var(--tambah)', libur: 'var(--goldl)', tahan: 'var(--pertahankan)', kurangi: 'var(--kurangi)', lepas: 'var(--turunkan)' };
const START_CASE = 'janur';
const MANAGER_START = Object.freeze({ city: 'Yogyakarta', letter: 'A', t: '2025-12-27' });

// Real test-data situations, offered first in the film list under their plain title. Notes stay short: the chart carries the numbers.
const CASES = [
  { id: 'janur', title: 'Janur Ireng: Sewu Dino The Prequel', city: 'Yogyakarta', letter: 'A', note: 'Kartu di presentasi.' },
  { id: 'balas', title: 'Balas Budi', city: 'Tangerang', letter: 'B', note: 'Teater bisa dipakai film lain.' },
  { id: 'jumat', title: '13 Days, 13 Nights', city: 'Jakarta', letter: 'C', note: 'Film Jumat lebih cepat tergeser.' },
  { id: 'natal', title: 'Avatar: Fire and Ash', city: 'Jakarta', letter: 'A', note: 'Natal Kamis, siapkan seperti akhir pekan.' },
  { id: 'isra', title: 'Malam 3 Yasinan', city: 'Jakarta', letter: 'A', note: 'Cek penjualan H-1 dulu.' },
  { id: 'lebaran', title: 'Na Willa', city: 'Yogyakarta', letter: 'A', note: 'Level Lebaran belum terukur.' },
  { id: 'habis', title: 'Alas Roban', city: 'Pekalongan', letter: 'A', note: 'Permintaan terpotong kursi.' },
  { id: 'lokasi', title: 'Zootopia 2', city: 'Manado', letter: 'B', note: 'Di Jakarta A sarannya tambah jadwal.' },
  { id: 'imax', title: 'Predator: Badlands (IMAX 2D)', city: 'Jakarta', letter: 'A', note: 'Teater diambil film IMAX baru.' },
  { id: 'kursi', title: 'Number One', city: 'Jakarta', letter: 'A', note: 'Permintaan naik, kursi masih longgar.' },
  { id: 'pola3', title: 'Sampai Titik Terakhirmu', city: 'Kendari', letter: 'A', note: 'Baca tiketnya, bukan rasionya.' },
  { id: 'nyepi', title: 'Danur: The Last Chapter', city: 'Denpasar', letter: 'A', note: 'Tiga hari pertama tidak normal.' },
  { id: 'ramadan', title: 'Blades of the Guardians', city: 'Jakarta', letter: 'A', note: 'Akhir pekan masih kuat.' },
];

const clusterIndex = (city, letter) => DATA.clusters.findIndex((c) => DATA.cities[c.c] === city && c.l === letter);
const byCityName = (a, b) => DATA.cities[a].localeCompare(DATA.cities[b], 'id');
const toNumber = (v) => (String(v).trim() === '' ? NaN : Number(v)); // Number('') would quietly become 0
const isWholeInRange = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
// Days drawn in the saran's colour: only the day(s) the rule read, like "hari yang jadi dasar saran" on the deck card.
const basisDays = (d) => d.mark;
const jadwalText = (a) => (a.kind === 'enough' ? `${fmtInt(a.from)} cukup` : `${fmtInt(a.from)} → ${fmtInt(a.to)}`);
const kpiHtml = (label, value, note = '') => `<div class="kpi"><span>${esc(label)}</span><b>${esc(value)}</b>${note ? `<small>${esc(note)}</small>` : ''}</div>`;

/** Resolves a case to its pair; throws if the data no longer holds it, so a broken case fails the checks. */
function casePair(spec) {
  const set = SETS.test;
  const film = set.meta.findIndex((m) => m.t === spec.title);
  const cl = clusterIndex(spec.city, spec.letter);
  const i = (set.byFilm.get(film) || []).find((k) => set.raw.cl[k] === cl);
  if (i === undefined) throw new Error(`Kasus ${spec.id}: ${spec.title} tidak ada di ${spec.city} ${spec.letter}`);
  return pairOf(set, i);
}

// ---- film list ----
function weekOf(d1) {
  const days = windowDates(d1);
  if (days.some(holidayShort)) return { group: 'Libur nasional' };
  return { group: days.some((d) => weightOf(d) === SCHOOL_HOLIDAY_WEIGHT) ? 'Libur sekolah' : 'Hari biasa' };
}
function filmGroupsHtml(mode) {
  const set = SETS[mode];
  const films = set.meta
    .map((m, film) => ({ film, title: m.t, d1: set.raw.d1[film], week: weekOf(set.raw.d1[film]) }))
    .sort((a, b) => a.d1.localeCompare(b.d1) || a.title.localeCompare(b.title, 'id'));
  return WEEK_GROUPS.map((group) => {
    const options = films.filter((f) => f.week.group === group)
      .map((f) => `<option value="${mode}:${f.film}">${esc(f.title)}</option>`).join('');
    return options ? `<optgroup label="${SET_NAME[mode]} · ${group}">${options}</optgroup>` : '';
  }).join('');
}
function filmOptionsHtml() {
  const cases = CASES.map((c) => `<option value="case:${c.id}">${esc(c.title)}</option>`).join('');
  return `<optgroup label="Kasus data uji">${cases}</optgroup>${filmGroupsHtml('test')}${filmGroupsHtml('val')}<option value="${NEW_FILM}">+ Film baru (isi manual)</option>`;
}
/** Value of the film list -> {mode, film, spec}; null for a new film. */
function filmChoice(value) {
  if (value === NEW_FILM) return null;
  const [kind, key] = value.split(':');
  if (kind !== 'case') return { mode: kind, film: Number(key), spec: null };
  const spec = CASES.find((c) => c.id === key);
  return { mode: 'test', film: casePair(spec).film, spec };
}

// ---- forecast for what the form says ----
/** Empty string when the form is usable. Pure so it can be tested without a page. */
function formError(q) {
  if (!q.title) return 'Ketik judul film.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.d1) || q.d1 < MIN_D1 || q.d1 > MAX_D1) return `Pilih tanggal ${tgl(MIN_D1, true)} – ${tgl(MAX_D1, true)}.`;
  if (!q.y.every((v) => isWholeInRange(v, 0, MAX_TICKETS))) return `Tiket D1–D3: bilangan bulat 0–${fmtInt(MAX_TICKETS)}.`;
  if (sum(q.y) === 0) return 'Tiket D1–D3 tidak boleh semuanya 0.';
  if (q.pair) return '';
  if (!isWholeInRange(q.cityIdx, 0, DATA.cities.length - 1)) return 'Pilih kota.';
  if (!isWholeInRange(q.theaters, 1, MAX_THEATERS)) return `Teater: 1–${MAX_THEATERS}.`;
  const seats = q.theaters * SHOWS_PER_THEATER * SEATS_PER_SHOW;
  return Math.max(...q.y) > seats ? `${fmtInt(Math.max(...q.y))} tiket per hari tidak muat di ${q.theaters} teater.` : '';
}
/** Model forecast when the form still shows the pair's real sales and date; quick estimate once it was edited. */
function forecastView(q) {
  const { pair } = q;
  const isModel = Boolean(pair) && pair.d1 === q.d1 && pair.y.every((v, i) => v === q.y[i]);
  const dates = windowDates(q.d1);
  const fc = isModel ? pair.fc : quickEstimate(q.y, q.d1, q.cityIdx, quickLibrary(), quickFamilyOf(q.rawTitle));
  const avg = averageD13(q.y);
  const decision = isModel ? pair.decision : decide(fc, avg, dates);
  const seat = pair ? pair.seat : SEATS_PER_SHOW;
  const shows = pair ? pair.showsNow : q.theaters * SHOWS_PER_THEATER;
  const plan = schedule(fc, seat, shows, TARGET, pair ? DATA.clusters[pair.cl].cap : Infinity);
  const actual = isModel ? pair.actual : null;
  const alt = isModel ? pair.alt : null;
  const dataMax = Math.max(1, ...q.y, ...fc, ...(actual || []), ...(alt || []));
  const seats = seat * shows;
  return {
    q, isModel, dates, fc, avg, decision, seats, plan, actual, alt, dataMax,
    advice: scheduleAdvice(decision, plan, shows, dates),
    lgb: isModel ? pair.lgb : null,
    color: KIND_COLOR[decision.kind],
    days: basisDays(decision),
    drawCap: seats > 0 && seats <= dataMax * CHART_MAX_CAPACITY_RATIO,
  };
}

// ---- simulasi: pieces as strings ----
function sourceText(view) {
  if (!view.isModel) return 'Estimasi cepat, bukan model akhir';
  return `${clusterName(view.q.pair.cl)} · ${SET_NAME[view.q.pair.mode].toLowerCase()}`;
}
function bannerText(view) {
  const { spec, pair } = view.q;
  const isCasePair = Boolean(spec) && view.isModel && casePair(spec).i === pair.i;
  return isCasePair ? `${view.decision.why}. ${spec.note}` : view.decision.why;
}
const shows = (n) => `${fmtInt(n)} pertunjukan`;
/** One plain sentence: what to do, from when, and how many shows per day. */
function stepText(view) {
  const d = view.decision;
  const a = view.advice;
  const at = (i) => hariTgl(view.dates[i]);
  if (d.kind === 'lepas') return `Mulai ${at(d.i)}, berikan teater ini ke film lain: prediksi 0 tiket sampai D10.`;
  if (d.kind === 'tambah') {
    if (a.kind === 'enough') return `Permintaan Sab–Min naik, tetapi ${shows(a.from)} per hari masih cukup. Siapkan cadangan, putuskan dari penjualan H-1.`;
    return `Naikkan dari ${shows(a.from)} jadi ${shows(a.to)} per hari pada Sab–Min (${a.note}).`;
  }
  if (d.kind === 'libur') {
    if (a.to <= a.from) return `Siapkan jadwal ekstra ${at(d.i)}: permintaan naik, ${shows(a.from)} masih cukup. Tambah bila penjualan H-1 kuat.`;
    return `Pada ${at(d.i)}, naikkan dari ${shows(a.from)} jadi ${shows(a.to)}.`;
  }
  if (d.kind === 'tahan') return `Jadwal tetap sampai D10. Pekan kedua cukup sekitar ${shows(a.to)} per hari.`;
  if (a.kind === 'enough') return `Mulai ${at(d.i)} permintaan turun di bawah 0,5×, tetapi ${shows(a.from)} per hari sudah sesuai kebutuhan. Jangan tambah jadwal.`;
  return `Mulai ${at(d.i)}, turunkan dari ${shows(a.from)} jadi ${shows(a.to)} per hari.`;
}
const RELIABILITY_STRONG = 0.7;
const RELIABILITY_FAIR = 0.5;
function reliabilityNote(kind) {
  const r = DATA.proof.decisions.realised[kind];
  let tone = 'lemah, cek H-1';
  if (r.held >= RELIABILITY_STRONG) tone = 'kuat';
  else if (r.held >= RELIABILITY_FAIR) tone = 'sedang';
  return `${tone} · ${fmtInt(r.n)} kasus validasi`;
}
const RULE_TEXT = {
  lepas: ['Lepas teater', '0 tiket sampai D10'],
  tambah: ['Tambah jadwal', 'Sab/Min ≥ 1× rata-rata D1–D3'],
  libur: ['Jadwal ekstra', 'hari libur ≥ +20% vs hari sebelumnya'],
  tahan: ['Pertahankan', 'rata-rata D8–D10 ≥ 0,5×'],
  kurangi: ['Kurangi', 'selain itu, saat turun < 0,5×'],
};
/** The deck's five rules in order: the one that fired is lit, the ones before it say why they did not. */
function rulesHtml(view) {
  const trace = ruleTrace(view.fc, view.avg, view.dates);
  const fired = trace.findIndex((r) => r.met);
  return trace.map((r, n) => {
    const [title, cond] = RULE_TEXT[r.kind];
    let state = 'tidak diperiksa';
    if (n === fired) state = 'berlaku';
    else if (n < fired) state = 'tidak terpenuhi';
    const on = n === fired;
    return `<div class="rule${on ? ' on' : ''}"${on ? ` style="border-color:${KIND_COLOR[r.kind]}"` : ''}>`
      + `<p class="n" style="color:${KIND_COLOR[r.kind]}">Aturan ${n + 1} · ${state}</p>`
      + `<p class="t">${esc(title)}</p><p class="c">${esc(cond)}</p><p class="v">${esc(r.value)}</p></div>`;
  }).join('');
}
function kpisHtml(view) {
  const tiles = [
    kpiHtml('Total prediksi 7 hari', fmtInt(sum(view.fc)), view.alt ? `skenario tinggi ${fmtInt(sum(view.alt))}` : 'tiket D4–D10'),
    kpiHtml(`Pertunjukan/hari (okupansi ${fmtPct(TARGET)})`, jadwalText(view.advice), view.advice.note),
  ];
  if (view.isModel && !view.q.pair.lebaran) tiles.push(kpiHtml('Keandalan saran', fmtPct(heldRateOf(view.decision.kind)), reliabilityNote(view.decision.kind)));
  if (view.actual) tiles.push(kpiHtml('MASE', fmtDec(pairMase(view.fc, view.actual, view.avg)), `LightGBM ${fmtDec(pairMase(view.lgb, view.actual, view.avg))}`));
  return tiles.join('');
}
function dayTrackHtml(view, i, value, top) {
  const pct = (v) => (v / top) * 100;
  const isForecast = i >= 0;
  const isHit = isForecast && view.days.includes(i);
  const fill = isHit ? `background:${view.color};border-top-color:${view.color}` : '';
  const actual = view.actual && isForecast ? `<span class="act" style="bottom:${pct(view.actual[i])}%" title="Aktual ${fmtInt(view.actual[i])}"></span>` : '';
  const alt = view.alt && isForecast ? `<span class="ghost" style="height:${pct(view.alt[i])}%" title="Skenario tinggi ${fmtInt(view.alt[i])}"></span>` : '';
  const cap = view.drawCap ? `<span class="capl" style="bottom:${pct(view.seats)}%" title="Kapasitas ${fmtInt(view.seats)} kursi"></span>` : '';
  const stop = isHit && Math.round(value) === 0 ? ' stop' : '';
  return `<div class="track${stop}">${cap}${alt}<div class="bar" style="height:${Math.max(2, pct(value))}%;${fill}"></div>${actual}</div>`;
}
function dayHtml(view, j, top) {
  const i = j - 3; // forecast index; negative for the three days already sold
  const isKnown = i < 0;
  const iso = addDays(view.q.d1, j);
  const value = isKnown ? view.q.y[j] : view.fc[i];
  const isZero = !isKnown && Math.round(value) === 0;
  const isFull = !isKnown && view.seats > 0 && value > view.seats;
  const short = holidayShort(iso);
  const cls = ['day', isKnown && 'known', (isWeekend(iso) || short) && 'we', isZero && 'zero', j === 3 && 'first'].filter(Boolean).join(' ');
  const tag = isFull ? '<em class="full">penuh</em>' : short ? `<em>${esc(short)}</em>` : '';
  return `<div class="${cls}"><div class="num"><b style="${isZero ? 'color:var(--turunkan)' : ''}">${fmtInt(value)}</b></div>${dayTrackHtml(view, i, value, top)}`
    + `<div class="lab"><b>${esc(hari(iso))}</b><span>${esc(tgl(iso))}</span></div><div class="hol">${tag}</div></div>`;
}
function chartHtml(view) {
  const top = Math.max(view.dataMax, view.drawCap ? view.seats : 0) * CHART_HEADROOM;
  return Array.from({ length: CHART_DAYS }, (_, j) => dayHtml(view, j, top)).join('');
}
function legendHtml(view) {
  const swatch = (color, text) => `<span><span class="sw" style="background:${color}"></span>${esc(text)}</span>`;
  return [
    swatch('var(--known)', 'Terjual'),
    swatch('var(--fc)', 'Prediksi'),
    view.actual ? '<span><span class="dot"></span>Aktual</span>' : '',
    view.alt ? '<span><span class="dash alt"></span>Skenario tinggi (F1)</span>' : '',
    view.drawCap ? '<span><span class="dash"></span>Kapasitas jadwal sekarang</span>' : '',
    swatch(view.color, `Hari dasar saran · ${view.decision.action}`),
  ].join('');
}

// ---- simulasi: form ----
function readForm() {
  const choice = filmChoice($('film').value);
  const set = choice ? SETS[choice.mode] : null;
  const pair = choice ? pairOf(set, Number($('city').value)) : null;
  const typed = $('filmNew').value.trim();
  return {
    pair,
    spec: choice ? choice.spec : null,
    title: pair ? pair.title : typed,
    rawTitle: pair ? set.raw.films[pair.film] : typed,
    cityIdx: pair ? pair.cityIdx : toNumber($('kota').value),
    theaters: toNumber($('teater').value),
    d1: $('d1').value,
    y: ['y1', 'y2', 'y3'].map((id) => toNumber($(id).value)),
  };
}
function labelDays(d1) {
  ['l1', 'l2', 'l3'].forEach((id, i) => { $(id).textContent = d1 ? hariTgl(addDays(d1, i)) : `D${i + 1}`; });
}
function paintBanner(color, word, text) {
  $('banner').style.borderColor = `color-mix(in srgb, ${color} 45%, transparent)`;
  $('banner').style.boxShadow = `0 0 26px -6px color-mix(in srgb, ${color} 30%, transparent)`;
  $('word').style.color = color;
  $('word').textContent = word;
  $('desc').textContent = text;
}
function run() {
  const q = readForm();
  labelDays(q.d1);
  const error = formError(q);
  $('err').textContent = error;
  if (error) return;
  const view = forecastView(q);
  paintBanner(view.color, view.decision.action, bannerText(view));
  const lebaranNote = view.isModel && q.pair.lebaran ? ' Level Lebaran belum terukur di validasi.' : '';
  $('step').textContent = view.isModel ? stepText(view) + lebaranNote : `${stepText(view)} Estimasi cepat: pakai sebagai arah, bukan angka pasti.`;
  $('rules').innerHTML = rulesHtml(view);
  $('kpis').innerHTML = kpisHtml(view);
  $('ctitle').textContent = q.title;
  $('csub').textContent = sourceText(view);
  $('days').innerHTML = chartHtml(view);
  $('legend').innerHTML = legendHtml(view);
}
function fillCluster(set, film, cityIdx, selected) {
  const pairs = set.byFilm.get(film).map((i) => pairOf(set, i)).filter((p) => p.cityIdx === cityIdx)
    .sort((a, b) => DATA.clusters[a.cl].l.localeCompare(DATA.clusters[b.cl].l));
  $('city').innerHTML = pairs.map((p) => `<option value="${p.i}"${p.i === selected ? ' selected' : ''}>Klaster ${esc(DATA.clusters[p.cl].l)}</option>`).join('');
  $('kllab').textContent = `Klaster (${pairs.length})`;
}
function fillSales(pair) {
  $('d1').value = pair.d1;
  ['y1', 'y2', 'y3'].forEach((id, i) => { $(id).value = pair.y[i]; });
}
/** Shows one listed pair in the form. */
function fillPair(set, pair) {
  $('filmNew').hidden = true;
  $('tbox').hidden = true;
  $('klbox').hidden = false;
  const cities = [...new Set(set.byFilm.get(pair.film).map((i) => pairOf(set, i).cityIdx))].sort(byCityName);
  $('kota').innerHTML = cities.map((c) => `<option value="${c}"${c === pair.cityIdx ? ' selected' : ''}>${esc(DATA.cities[c])}</option>`).join('');
  fillCluster(set, pair.film, pair.cityIdx, pair.i);
  fillSales(pair);
}
/** A film picked from the list opens in the current city when it plays there, otherwise in its biggest cluster. */
function defaultPair(set, film, keepCity) {
  const pairs = set.byFilm.get(film).map((i) => pairOf(set, i));
  const here = pairs.filter((p) => p.cityIdx === keepCity);
  return (here.length ? here : pairs).reduce((best, p) => (p.avg > best.avg ? p : best));
}
/** A new film starts empty, so the previous film's decision must not stay on screen beside it. */
function openNewFilm() {
  $('filmNew').hidden = false;
  $('filmNew').value = '';
  $('tbox').hidden = false;
  $('klbox').hidden = true;
  const cities = DATA.cities.map((_, c) => c).sort(byCityName);
  $('kota').innerHTML = cities.map((c) => `<option value="${c}">${esc(DATA.cities[c])}</option>`).join('');
  ['teater', 'y1', 'y2', 'y3'].forEach((id) => { $(id).value = ''; });
  $('err').textContent = '';
  labelDays($('d1').value);
  paintBanner('var(--muted)', 'Film baru', 'Isi tiket D1–D3, lalu tekan Prediksi.');
  ['kpis', 'days', 'legend', 'ctitle', 'csub', 'step', 'rules'].forEach((id) => { $(id).textContent = ''; });
  $('filmNew').focus();
}
function onFilmChange() {
  const choice = filmChoice($('film').value);
  if (!choice) {
    openNewFilm();
    return;
  }
  const set = SETS[choice.mode];
  fillPair(set, choice.spec ? casePair(choice.spec) : defaultPair(set, choice.film, toNumber($('kota').value)));
  run();
}
function onCityChange() {
  const choice = filmChoice($('film').value);
  if (!choice) return;
  const set = SETS[choice.mode];
  const pair = defaultPair(set, choice.film, toNumber($('kota').value));
  fillCluster(set, choice.film, pair.cityIdx, pair.i);
  fillSales(pair);
  run();
}
function onClusterChange() {
  const choice = filmChoice($('film').value);
  if (!choice) return;
  fillSales(pairOf(SETS[choice.mode], Number($('city').value)));
  run();
}
function initSim() {
  let timer = null;
  $('film').innerHTML = filmOptionsHtml();
  $('film').addEventListener('change', onFilmChange);
  $('kota').addEventListener('change', onCityChange);
  $('city').addEventListener('change', onClusterChange);
  $('f').addEventListener('input', (e) => {
    if (['film', 'kota', 'city'].includes(e.target.id)) return;
    labelDays($('d1').value);
    if ($('film').value === NEW_FILM) return; // a new film waits for the button
    clearTimeout(timer);
    timer = setTimeout(run, INPUT_DELAY_MS);
  });
  $('f').addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });
  $('film').value = `case:${START_CASE}`;
  onFilmChange();
}

// ---- manajer ----
let manager = { mode: 'test', cl: 0, t: MANAGER_START.t, only: null, morningByMode: {} };
const setManager = (patch) => { manager = { ...manager, ...patch }; };
const pillStyle = (c) => `color:${c};border-color:color-mix(in srgb, ${c} 40%, transparent);background:color-mix(in srgb, ${c} 12%, transparent)`;

function clustersOfCity(set, cityIdx) {
  return DATA.clusters.map((c, cl) => ({ ...c, cl, count: (set.byCluster.get(cl) || []).length })).filter((c) => c.c === cityIdx && c.count > 0);
}
function nearestMorning(set, cl, t) {
  const distance = (m) => Math.abs(daysBetween(m, t));
  return morningsOf(set, cl).map((m) => m.t).reduce((best, m) => (distance(m) < distance(best) ? m : best));
}
/** Switching data or city can leave the cluster or morning without data; snap to the closest valid one. */
function normalizeManager() {
  const set = SETS[manager.mode];
  const hasData = (set.byCluster.get(manager.cl) || []).length > 0;
  const sameCity = clustersOfCity(set, DATA.clusters[manager.cl].c);
  const fallback = sameCity.length ? sameCity[0].cl : Math.min(...set.byCluster.keys());
  const cl = hasData ? manager.cl : fallback;
  setManager({ cl, t: manager.t === ALL_MORNINGS ? ALL_MORNINGS : nearestMorning(set, cl, manager.t) });
}
function fillSelect(el, options) {
  el.innerHTML = options.map((o) => `<option value="${esc(o.value)}"${o.selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
}
function syncManagerFilters() {
  const set = SETS[manager.mode];
  const cityIdx = DATA.clusters[manager.cl].c;
  fillSelect($('mdata'), Object.keys(SET_NAME).map((mode) => ({ value: mode, label: SET_NAME[mode], selected: mode === manager.mode })));
  const cities = DATA.cities.map((_, c) => c).filter((c) => clustersOfCity(set, c).length > 0).sort(byCityName);
  fillSelect($('mcity'), cities.map((c) => ({ value: c, label: DATA.cities[c], selected: c === cityIdx })));
  fillSelect($('mkl'), clustersOfCity(set, cityIdx).map((c) => ({ value: c.cl, label: `Klaster ${c.l} · ${fmtInt(c.count)} film`, selected: c.cl === manager.cl })));
  const mornings = morningsOf(set, manager.cl).map((m) => ({ value: m.t, label: `${hariTgl(m.t, true)} · ${m.n} film`, selected: m.t === manager.t }));
  fillSelect($('mday'), [{ value: ALL_MORNINGS, label: 'Semua tanggal', selected: manager.t === ALL_MORNINGS }, ...mornings]);
}
function managerKpisHtml(card, mode) {
  const released = card.rows.filter((r) => r.pair.decision.kind === 'lepas').length;
  const tiles = [
    kpiHtml('Total prediksi 7 hari', fmtInt(card.tickets)),
    kpiHtml('Pendapatan tiket', fmtRp(card.revenue)),
    kpiHtml('Teater dilepas', fmtInt(released)),
    kpiHtml('Pertunjukan 7 hari', `−${fmtInt(card.freedShows)} / +${fmtInt(card.addedShows)}`, `dibebaskan / ditambah (okupansi ${fmtPct(TARGET)})`),
  ];
  if (mode === 'val') tiles.push(kpiHtml('Saran terbukti', `${card.rows.filter((r) => r.pair.held).length}/${card.rows.length}`));
  return tiles.join('');
}
const MINI_BAR_HEIGHT = 26;
/** One day of the card: the number above a small bar, scaled to the film's own biggest day (like the deck card). */
function dayCellHtml(value, top, color, isBasis) {
  const height = Math.max(2, (value / top) * MINI_BAR_HEIGHT);
  const numStyle = isBasis ? ` style="color:${color}"` : '';
  return `<td class="dc"><span class="dn"${numStyle}>${fmtInt(value)}</span><i class="db" style="height:${height}px;background:${color}"></i></td>`;
}
function managerRowHtml(row) {
  const p = row.pair;
  const d = p.decision;
  const color = KIND_COLOR[d.kind];
  const top = Math.max(1, ...p.y, ...p.fc);
  const known = p.y.map((t) => dayCellHtml(t, top, 'var(--known)', false)).join('');
  const forecast = p.fc.map((t, i) => (d.mark.includes(i) ? dayCellHtml(t, top, color, true) : dayCellHtml(t, top, 'var(--fc)', false))).join('');
  const actual = p.actual ? `<small>aktual ${fmtInt(sum(p.actual))}</small>` : '';
  const verdict = p.actual ? (p.held ? ' ✓' : ' ✗') : '';
  const reliability = `terbukti ${fmtPct(heldRateOf(d.kind))} di validasi`;
  return `<tr data-i="${p.i}" data-mode="${esc(p.mode)}" tabindex="0"><td><b>${esc(p.title)}</b><small>rilis ${esc(hariTgl(p.d1))}</small></td>`
    + `${known}<td class="avg">${fmtInt(p.avg)}</td>${forecast}<td>${fmtInt(row.tickets)}${actual}</td><td title="${esc(row.advice.note)}">${jadwalText(row.advice)}</td>`
    + `<td><span class="pill" style="${pillStyle(color)}" title="${esc(reliability)}">${esc(d.action)}${verdict}</span><small class="why">${esc(d.why)}</small></td></tr>`;
}
const MANAGER_COLUMNS = 15;
/** Header like the deck card: the real dates when one morning is shown, D1..D10 when films of several mornings mix. */
function managerHeadHtml(card, t) {
  const d1 = t === ALL_MORNINGS || !card.rows.length ? null : card.rows[0].pair.d1;
  const day = (j) => (d1 ? `${hari(addDays(d1, j))}<br>${tgl(addDays(d1, j))}` : `D${j + 1}`);
  const days = (from, to) => Array.from({ length: to - from }, (_, k) => `<th class="dc">${day(from + k)}</th>`).join('');
  return `<tr class="band"><th></th><th colspan="4">3 hari pertama</th><th colspan="7">Prediksi 7 hari</th><th colspan="3"></th></tr>`
    + `<tr><th>Film</th>${days(0, 3)}<th>Rata-rata</th>${days(3, 10)}<th>Total 7 hari</th><th>Jadwal</th><th>Saran</th></tr>`;
}
/** Caption above the table, in the deck's words: "Klaster Yogyakarta A · 4 film rilis Rabu, 24 Des 2025". */
function managerCaptionText(card, cl, t) {
  if (t === ALL_MORNINGS || !card.rows.length) return `${clusterName(cl)} · ${fmtInt(card.rows.length)} film, semua tanggal`;
  const { d1 } = card.rows[0].pair;
  return `${clusterName(cl)} · ${fmtInt(card.rows.length)} film rilis ${hariPanjang(d1)}, ${tgl(d1, true)}`;
}
/** Films biggest first (the order of cardFor, as on the deck card); the count buttons filter one saran. */
function managerBodyHtml(card, only) {
  const rows = card.rows.filter((r) => !only || r.pair.decision.kind === only);
  if (!rows.length) return `<tr class="none"><td colspan="${MANAGER_COLUMNS}">Tidak ada film</td></tr>`;
  return rows.map(managerRowHtml).join('');
}
const URGENCY = ['lepas', 'kurangi', 'libur', 'tambah', 'tahan'];
const SUMMARY_NAMES = 3;
function whenText(d, dates) {
  if (d.kind === 'tambah') return 'Sab–Min';
  if (d.kind === 'tahan') return 'sampai D10';
  return hariTgl(dates[d.i]);
}
/** "What to do this morning": one line per saran, most urgent first, with the films and their day. */
function managerSummaryHtml(card) {
  const lines = URGENCY.map((kind) => {
    const rows = card.rows.filter((r) => r.pair.decision.kind === kind);
    if (!rows.length) return '';
    const names = rows.slice(0, SUMMARY_NAMES).map((r) => `${esc(r.pair.title)} <small>(${esc(whenText(r.pair.decision, r.pair.dates))})</small>`).join(', ');
    const more = rows.length > SUMMARY_NAMES ? ` dan ${fmtInt(rows.length - SUMMARY_NAMES)} film lain` : '';
    const held = `<small class="rel">terbukti ${fmtPct(heldRateOf(kind))} di validasi</small>`;
    return `<li><b style="color:${KIND_COLOR[kind]}">${KIND_LABEL[kind]}</b> · ${names}${more} ${held}</li>`;
  }).join('');
  return `<p class="eyebrow">Yang perlu dilakukan</p><ul>${lines}</ul>`;
}
function managerCountsHtml(card, only) {
  const counts = kindCounts(card.rows.map((r) => r.pair));
  return KIND_ORDER.map((k) => `<button type="button" data-kind="${k}" aria-pressed="${!only || only === k}" style="${pillStyle(KIND_COLOR[k])}">${counts[k]} ${KIND_LABEL[k]}</button>`).join('');
}
function renderManager() {
  normalizeManager();
  syncManagerFilters();
  const card = cardFor(SETS[manager.mode], manager.cl, manager.t, TARGET);
  $('mkpis').innerHTML = managerKpisHtml(card, manager.mode);
  $('msum').innerHTML = managerSummaryHtml(card);
  $('mcount').innerHTML = managerCountsHtml(card, manager.only);
  $('mcap').textContent = managerCaptionText(card, manager.cl, manager.t);
  $('mth').innerHTML = managerHeadHtml(card, manager.t);
  $('mrows').innerHTML = managerBodyHtml(card, manager.only);
}
function changeManager(patch) {
  setManager({ only: null, ...patch });
  renderManager();
}
function openRow(row) {
  const { mode } = row.dataset;
  const set = SETS[mode];
  const pair = pairOf(set, Number(row.dataset.i));
  $('film').value = `${mode}:${pair.film}`;
  fillPair(set, pair);
  run();
  show('sim');
  window.scrollTo(0, 0);
}
function onManagerDataChange(mode) {
  const morningByMode = { ...manager.morningByMode, [manager.mode]: manager.t };
  changeManager({ mode, morningByMode, t: morningByMode[mode] || manager.t });
}
function initManager() {
  setManager({ cl: clusterIndex(MANAGER_START.city, MANAGER_START.letter) });
  $('mdata').addEventListener('change', (e) => onManagerDataChange(e.target.value));
  $('mcity').addEventListener('change', (e) => changeManager({ cl: clustersOfCity(SETS[manager.mode], Number(e.target.value))[0].cl }));
  $('mkl').addEventListener('change', (e) => changeManager({ cl: Number(e.target.value) }));
  $('mday').addEventListener('change', (e) => changeManager({ t: e.target.value }));
  $('mcount').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    setManager({ only: manager.only === b.dataset.kind ? null : b.dataset.kind });
    renderManager();
  });
  $('mrows').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-i]');
    if (row) openRow(row);
  });
  $('mrows').addEventListener('keydown', (e) => {
    const row = e.target.closest('tr[data-i]');
    if (row && e.key === 'Enter') openRow(row);
  });
  renderManager();
}

// ---- shell ----
function show(view) {
  ['sim', 'man'].forEach((k) => {
    $(`v-${k}`).hidden = k !== view;
    $(`t-${k}`).setAttribute('aria-selected', String(k === view));
  });
}
function boot() {
  try {
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.v)));
    initSim();
    initManager();
  } catch (err) {
    $('err').textContent = `Dashboard gagal dimuat: ${err.message}`;
    throw err;
  }
}
if (typeof document !== 'undefined') boot();
