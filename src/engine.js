// Pure logic: calendar, number formats, the deck's five ordered rules, schedule and revenue. No DOM here.
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Thresholds of the rule card (deck fig17, Q-B4).
const RULE = Object.freeze({ ADD: 1.0, HOLIDAY_UPLIFT: 1.2, KEEP: 0.5, CUT: 0.5 });
const DEFAULT_TARGET_OCCUPANCY = 0.4;

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dowOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const isWeekend = (iso) => { const w = dowOf(iso); return w === 0 || w === 6; };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : 0);

// Indonesian number formats (deck design system): 72.611 · 0,337 · 1,7× · −54%.
const fmtInt = (x) => Math.round(x).toLocaleString('id-ID');
const fmtDec = (x, d = 2) => x.toFixed(d).replace('.', ',').replace(/^-/, '−');
const fmtX = (x, d = 2) => `${fmtDec(x, d)}×`;
const fmtPct = (x, d = 0) => `${fmtDec(x * 100, d)}%`;
const fmtSignedPct = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`;
const fmtRp = (x) => {
  const v = Math.abs(x);
  if (v >= 1e9) return `Rp${fmtDec(x / 1e9, 2)} M`;
  if (v >= 1e6) return `Rp${fmtDec(x / 1e6, v >= 1e8 ? 0 : 1)} jt`;
  if (v >= 1e3) return `Rp${Math.round(x / 1e3)} rb`;
  return `Rp${Math.round(x)}`;
};
const tgl = (iso, year = false) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ''}`;
};
const hari = (iso) => HARI[dowOf(iso)];
const hariTgl = (iso, year = false) => `${hari(iso)} ${tgl(iso, year)}`;

const calOf = (iso) => DATA.cal[iso];
const weightOf = (iso) => {
  const c = calOf(iso);
  if (c) return c[0];
  const w = dowOf(iso);
  if (w === 0 || w === 6) return 1.33;
  return w === 5 ? 0.98 : 0.74;
};
const holidayName = (iso) => { const c = calOf(iso); return c ? c[1] : ''; };

// Short holiday names for narrow columns (full names come from the official calendar).
const HOLIDAY_SHORT = [
  [/Muharam|Tahun Baru Islam/, 'Tahun Baru Islam'], [/Idulfitri/, 'Idulfitri'], [/Idul ?Adha|Iduladha/, 'Iduladha'],
  [/Waisak/, 'Waisak'], [/Kelahiran Yesus|Natal/, 'Natal'], [/Imlek/, 'Imlek'], [/Tahun Baru 20/, 'Tahun Baru'],
  [/Nyepi/, 'Nyepi'], [/Wafat Yesus/, 'Jumat Agung'], [/Paskah/, 'Paskah'], [/Kenaikan Yesus/, 'Kenaikan'],
  [/Isra Mikraj/, 'Isra Mikraj'], [/Maulid/, 'Maulid'], [/Buruh/, 'Hari Buruh'], [/Kemerdekaan|HUT RI/, 'HUT RI'],
  [/Pancasila/, 'Pancasila'], [/Cuti bersama/i, 'Cuti bersama'],
];
const holidayShort = (iso) => {
  const name = holidayName(iso);
  if (!name) return '';
  const hit = HOLIDAY_SHORT.find(([re]) => re.test(name));
  return hit ? hit[1] : name;
};

const windowDates = (d1) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(d1, 3 + i));
const averageD13 = (y) => Math.max(1, sum(y) / 3);

function firstZeroRun(rounded) {
  for (let i = 0; i < 7; i += 1) {
    if (rounded.slice(i).every((v) => v === 0)) return i;
  }
  return -1;
}
function weekendCheck(ratio, dates) {
  const days = dates.map((d, i) => (isWeekend(d) ? i : -1)).filter((i) => i >= 0);
  // ties go to the earliest day, like Python's max(key=...)
  const best = days.reduce((b, i) => (b < 0 || ratio[i] > ratio[b] ? i : b), -1);
  return { days, best, max: best < 0 ? 0 : ratio[best] };
}
function holidayCheck(rounded, dates) {
  for (let i = 1; i < 7; i += 1) {
    if (holidayName(dates[i]) && rounded[i] > 0 && rounded[i] >= RULE.HOLIDAY_UPLIFT * rounded[i - 1]) return i;
  }
  return -1;
}
const upliftText = (rounded, i) => (rounded[i - 1] > 0 ? fmtSignedPct(rounded[i] / rounded[i - 1] - 1) : 'naik dari 0');
const holidayLabel = (iso) => (holidayShort(iso) === 'Cuti bersama' ? 'cuti bersama' : holidayShort(iso));

/** The deck's rule card, checked in order. fc = 7 daily forecasts (D4..D10), avg = mean D1-D3 (min 1). */
function decide(fc, avg, dates) {
  const rounded = fc.map((v) => Math.round(v));
  const ratio = fc.map((v) => v / avg);
  const zeroFrom = firstZeroRun(rounded);
  const wk = weekendCheck(ratio, dates);
  const hol = holidayCheck(rounded, dates);
  const tail = mean(ratio.slice(4));
  const cutFrom = ratio.findIndex((r) => r < RULE.CUT);

  if (zeroFrom >= 0) {
    return { rounded, kind: 'lepas', i: zeroFrom, mark: [zeroFrom], action: `Lepas layar ${tgl(dates[zeroFrom])}`, why: `0 tiket sejak ${hari(dates[zeroFrom])} (D${zeroFrom + 4})` };
  }
  if (wk.max >= RULE.ADD) {
    return { rounded, kind: 'tambah', i: wk.best, mark: wk.days.filter((i) => ratio[i] >= RULE.ADD), action: 'Tambah jadwal Sab–Min', why: `${hari(dates[wk.best])}: ${fmtX(wk.max)} rata-rata` };
  }
  if (hol >= 0) {
    return { rounded, kind: 'libur', i: hol, mark: [hol], action: `Jadwal ekstra ${tgl(dates[hol])}`, why: `${holidayLabel(dates[hol])}: ${upliftText(rounded, hol)} vs ${hari(dates[hol - 1])}` };
  }
  if (tail >= RULE.KEEP) {
    return { rounded, kind: 'tahan', i: 4, mark: [4, 5, 6], action: 'Pertahankan layar', why: `pekan 2: ${fmtX(tail)} rata-rata` };
  }
  return { rounded, kind: 'kurangi', i: cutFrom, mark: [cutFrom], action: `Kurangi mulai ${tgl(dates[cutFrom])}`, why: `${hari(dates[cutFrom])}: turun ke ${fmtX(ratio[cutFrom])}` };
}

/**
 * The five rules with the number each one read, for the "why" strip. met = the rule's condition is true;
 * the first met rule (in order) is the saran, which check_rules.mjs asserts against decide() on every pair.
 */
function ruleTrace(fc, avg, dates) {
  const rounded = fc.map((v) => Math.round(v));
  const ratio = fc.map((v) => v / avg);
  const zeroFrom = firstZeroRun(rounded);
  const wk = weekendCheck(ratio, dates);
  const hol = holidayCheck(rounded, dates);
  const firstHol = dates.findIndex((d, i) => i > 0 && holidayName(d));
  const showHol = hol >= 0 ? hol : firstHol;
  const tail = mean(ratio.slice(4));
  const cutFrom = ratio.findIndex((r) => r < RULE.CUT);
  return [
    { kind: 'lepas', met: zeroFrom >= 0, value: zeroFrom >= 0 ? `0 tiket sejak ${hari(dates[zeroFrom])}` : `D10: ${fmtInt(rounded[6])} tiket` },
    { kind: 'tambah', met: wk.max >= RULE.ADD, value: wk.best < 0 ? 'tidak ada Sab–Min' : `${hari(dates[wk.best])}: ${fmtX(wk.max)}` },
    { kind: 'libur', met: hol >= 0, value: showHol < 0 ? 'tidak ada libur' : `${holidayLabel(dates[showHol])}: ${upliftText(rounded, showHol)}` },
    { kind: 'tahan', met: tail >= RULE.KEEP, value: `D8–D10: ${fmtX(tail)}` },
    { kind: 'kurangi', met: true, value: cutFrom >= 0 ? `< 0,5× sejak ${hari(dates[cutFrom])}` : 'tidak turun < 0,5×' },
  ];
}

/** Did the rule's claim hold on actual tickets? Same definition as build/proof_stats.py (_realised). */
function claimHeld(decision, actual, avg, fc, dates) {
  const ra = actual.map((v) => v / avg);
  if (decision.kind === 'lepas') return Math.round(actual[6]) === 0;
  if (decision.kind === 'tambah') {
    const wk = weekendCheck(fc, dates);
    return ra[wk.best] >= RULE.ADD;
  }
  if (decision.kind === 'libur') return actual[decision.i] / Math.max(actual[decision.i - 1], 1) >= RULE.HOLIDAY_UPLIFT;
  if (decision.kind === 'tahan') return mean(ra.slice(4)) >= RULE.KEEP;
  return mean(ra.slice(decision.i)) < RULE.CUT;
}

/**
 * Shows needed per day at a target occupancy, capped by what the cluster can physically run,
 * and the occupancy if the D3 schedule simply continued.
 */
function schedule(fc, seat, showsNow, target, capShows = Infinity) {
  const wanted = fc.map((t) => (Math.round(t) === 0 ? 0 : Math.max(1, Math.ceil(t / (seat * target)))));
  const need = wanted.map((n) => Math.min(n, capShows));
  const occNow = fc.map((t) => (showsNow > 0 ? t / (seat * showsNow) : null));
  return { need, occNow, target, capped: wanted.map((n) => n > capShows) };
}

const peakIndex = (xs, from = 0) => xs.reduce((best, x, i) => (i >= from && x > xs[best] ? i : best), from);

/**
 * One-line schedule advice next to the saran. A rule reads the direction of demand; it can ask for more
 * shows while today's seats already cover the forecast, so that case says "cukup" instead of a confusing number.
 */
function scheduleAdvice(decision, plan, showsNow, dates) {
  const { kind, i } = decision;
  if (kind === 'lepas') return { kind: 'stop', from: showsNow, to: 0, note: `mulai ${hari(dates[i])}` };
  if (kind === 'libur') {
    return { kind: 'change', from: plan.need[i - 1], to: plan.need[i], note: `${hari(dates[i - 1])} → ${hari(dates[i])}` };
  }
  if (kind === 'tambah') {
    const peak = peakIndex(plan.need);
    const to = plan.need[peak];
    const capped = plan.capped[peak] ? ' · batas klaster' : '';
    if (to > showsNow) return { kind: 'change', from: showsNow, to, note: `puncak ${hari(dates[peak])}${capped}` };
    return { kind: 'enough', from: showsNow, to, note: `puncak ${hari(dates[peak])} butuh ${fmtInt(to)}` };
  }
  if (kind === 'tahan') {
    const peak = peakIndex(plan.need, 4);
    return { kind: 'change', from: showsNow, to: plan.need[peak], note: 'pekan 2' };
  }
  return { kind: 'change', from: showsNow, to: plan.need[i], note: `mulai ${hari(dates[i])}` };
}

const priceOf = (cityIdx, iso) => {
  const w = dowOf(iso);
  let slot = 0;
  if (w === 5) slot = 1;
  else if (w === 0 || w === 6) slot = 2;
  return DATA.prices[cityIdx][slot];
};
const revenueOf = (fc, dates, cityIdx) => fc.map((t, i) => t * priceOf(cityIdx, dates[i]));

// ---- quick estimate for a film with no final forecast: median decay of the most similar validation cases ----
const QUICK_K = 100;
const quickFeatures = (y, d1) => {
  const wd = [0, 1, 2].map((i) => weightOf(addDays(d1, i)));
  const a = y.map((v, i) => (v + 1) / wd[i]);
  return { f: [Math.log(a[1] / a[0]), Math.log(a[2] / a[0]), 0.25 * Math.log1p(sum(y) / 3)], w13: sum(wd) / 3 };
};
const medianOf = (xs) => {
  const v = [...xs].sort((p, q) => p - q);
  const n = v.length;
  return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
};
/** Calendar layers a-d of the notebook (deck L06) on R = tickets / mean(D1-D3). */
function calendarLayers(R, d1, cityIdx) {
  const { calm, leb, ctype } = DATA.layers;
  const cityUpper = DATA.cities[cityIdx].toUpperCase();
  return R.map((value, i) => {
    const k = i + 4;
    const date = addDays(d1, 3 + i);
    let r = value;
    if (date === '2025-12-31') r *= 0.577;
    else if (calm[`${d1}|${k}`]) r *= calm[`${d1}|${k}`];
    if (d1 === '2026-03-18') {
      const prior = (leb[cityUpper] || leb[ctype[cityIdx]] || leb.destination_java)[i];
      const rank = Math.min(10, Math.max(0.1, Math.max(r, 0.05) / (0.8 * prior)));
      r = prior * rank ** 0.2;
    }
    if (cityUpper === 'DENPASAR' && date === '2026-03-19') r = 0;
    return Math.max(0, r);
  });
}
/** library rows: {f, decay, fam}. exclude = family to leave out (used to measure accuracy without leakage). */
function quickEstimate(y, d1, cityIdx, library, exclude = -1) {
  const { f, w13 } = quickFeatures(y, d1);
  const near = library
    .filter((r) => r.fam !== exclude)
    .map((r) => [(r.f[0] - f[0]) ** 2 + (r.f[1] - f[1]) ** 2 + (r.f[2] - f[2]) ** 2, r])
    .sort((p, q) => p[0] - q[0])
    .slice(0, QUICK_K);
  const R = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const med = medianOf(near.map((n) => n[1].decay[i]));
    return Math.max(0, (med * weightOf(addDays(d1, 3 + i))) / w13);
  });
  const scale = averageD13(y);
  return calendarLayers(R, d1, cityIdx).map((r) => r * scale);
}
