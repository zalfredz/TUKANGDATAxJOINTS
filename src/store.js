// Data access and the manager's card. Reads DATA (flat columns from data.json); still no DOM.
const KIND_ORDER = ['tambah', 'libur', 'tahan', 'kurangi', 'lepas'];
const KIND_LABEL = { lepas: 'Lepas layar', tambah: 'Tambah jadwal', libur: 'Jadwal ekstra', tahan: 'Pertahankan', kurangi: 'Kurangi' };
const ALL_MORNINGS = 'semua';

const clusterName = (cl) => {
  const c = DATA.clusters[cl];
  return `Klaster ${DATA.cities[c.c]} ${c.l}`;
};

function makeSet(raw, meta, mode) {
  const byCluster = new Map();
  const byFilm = new Map();
  const n = raw.film.length;
  for (let i = 0; i < n; i += 1) {
    if (!byCluster.has(raw.cl[i])) byCluster.set(raw.cl[i], []);
    byCluster.get(raw.cl[i]).push(i);
    if (!byFilm.has(raw.film[i])) byFilm.set(raw.film[i], []);
    byFilm.get(raw.film[i]).push(i);
  }
  return { raw, meta, mode, n, byCluster, byFilm, cache: new Map() };
}
const SETS = { test: makeSet(DATA.test, DATA.meta.test, 'test'), val: makeSet(DATA.val, DATA.meta.val, 'val') };

const slice = (arr, i, w) => arr.slice(i * w, i * w + w);

/** One film x cluster pair as an object. fc is the main forecast; alt is the high scenario (Lebaran titles only). */
function pairOf(set, i) {
  if (set.cache.has(i)) return set.cache.get(i);
  const { raw, meta } = set;
  const film = raw.film[i];
  const cl = raw.cl[i];
  const d1 = raw.d1[film];
  const dates = windowDates(d1);
  const y = slice(raw.y, i, 3);
  const sh = slice(raw.sh, i, 3);
  const fc = slice(raw.f, i, 7);
  const avg = averageD13(y);
  const actual = raw.a ? slice(raw.a, i, 7) : null;
  const decision = decide(fc, avg, dates);
  const pair = {
    i, mode: set.mode, film, cl, d1, dates, y, sh, avg, fc, actual, decision,
    cityIdx: DATA.clusters[cl].c,
    title: meta[film].t,
    seat: raw.seat[i],
    showsNow: sh[2],
    alt: raw.alt ? raw.alt[String(i)] || null : null,
    lgb: raw.l ? slice(raw.l, i, 7) : null,
    held: actual ? claimHeld(decision, actual, avg, fc, dates) : null,
    hindsight: actual ? decide(actual, avg, dates) : null,
    lebaran: d1 === '2026-03-18',
  };
  set.cache.set(i, pair);
  return pair;
}

/** MASE of a forecast on this pair: mean |error| / scale. */
const pairMase = (fc, actual, avg) => mean(fc.map((v, i) => Math.abs(v - actual[i]))) / avg;

/** Share of validation pairs where this saran's claim held. */
const heldRateOf = (kind) => DATA.proof.decisions.realised[kind].held;

/** Decision mornings of a cluster (D4 dates of its films), oldest first. */
function morningsOf(set, cl) {
  const counts = new Map();
  (set.byCluster.get(cl) || []).forEach((i) => {
    const t = addDays(set.raw.d1[set.raw.film[i]], 3);
    counts.set(t, (counts.get(t) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, n]) => ({ t, n }));
}

function byTicketsDesc(a, b) {
  return sum(b.fc) - sum(a.fc) || a.title.localeCompare(b.title, 'id');
}

function cardRow(pair, target) {
  const plan = schedule(pair.fc, pair.seat, pair.showsNow, target, DATA.clusters[pair.cl].cap);
  return {
    pair, plan,
    advice: scheduleAdvice(pair.decision, plan, pair.showsNow, pair.dates),
    tickets: sum(pair.fc),
    revenue: sum(revenueOf(pair.fc, pair.dates, pair.cityIdx)),
  };
}

/** The films whose D3 ended just before morning t (or every film of the cluster), biggest first, with totals. */
function cardFor(set, cl, t, target) {
  const rows = (set.byCluster.get(cl) || [])
    .map((i) => pairOf(set, i))
    .filter((p) => t === ALL_MORNINGS || p.dates[0] === t)
    .sort(byTicketsDesc)
    .map((p) => cardRow(p, target));
  const gaps = rows.flatMap((r) => r.plan.need.map((n) => n - r.pair.showsNow));
  return {
    rows,
    tickets: sum(rows.map((r) => r.tickets)),
    revenue: sum(rows.map((r) => r.revenue)),
    freedShows: sum(gaps.map((g) => Math.max(0, -g))),
    addedShows: sum(gaps.map((g) => Math.max(0, g))),
  };
}

/** Decision counts over a list of pairs. */
function kindCounts(pairs) {
  const counts = Object.fromEntries(KIND_ORDER.map((k) => [k, 0]));
  pairs.forEach((p) => { counts[p.decision.kind] += 1; });
  return counts;
}

// Validation cases for the quick estimate, built once from the embedded actuals (no second copy in the file).
const familyName = (rawTitle) => rawTitle.toUpperCase().split(' (')[0];
let quickCache = null;
function quickCases() {
  if (quickCache) return quickCache;
  const { raw } = SETS.val;
  const families = new Map();
  const library = Array.from({ length: SETS.val.n }, (_, i) => {
    const d1 = raw.d1[raw.film[i]];
    const y = slice(raw.y, i, 3);
    const actual = slice(raw.a, i, 7);
    const scale = averageD13(y);
    const { f, w13 } = quickFeatures(y, d1);
    const decay = actual.map((v, j) => (v / scale) / (weightOf(addDays(d1, 3 + j)) / w13));
    const base = familyName(raw.films[raw.film[i]]);
    if (!families.has(base)) families.set(base, families.size);
    return { f, decay, fam: families.get(base) };
  });
  quickCache = { library, families };
  return quickCache;
}
const quickLibrary = () => quickCases().library;
/** Family of a film in the library, so a film never learns from itself; -1 for a film not in it. */
const quickFamilyOf = (rawTitle) => {
  const fam = quickCases().families.get(familyName(rawTitle));
  return fam === undefined ? -1 : fam;
};
