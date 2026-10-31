// Page-level checks without a browser: the HTML builders on all cards, random pairs, bad form input, and the test cases.
import assert from 'node:assert/strict';
import { loadUi } from './load.mjs';

const U = loadUi();
const { SETS, DATA } = U;
// "Infinity" alone is a broken number; "Demon Slayer: Infinity Castle" is a real film.
const BROKEN = /\bNaN\b|\bundefined\b|\bInfinity\b(?! Castle)|>null</;
const RANDOM_PAIRS = 3000;
const RANDOM_NEW_FILMS = 400;
const TARGET = 0.4;
const MAX_NOTE_CHARS = 45;
const MAX_WHY_CHARS = 40;
const TICKET_RANGE = 5000;
const DATE_RANGE_DAYS = 417;
const NEW_FILM_THEATERS = 30;

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  process.stdout.write(`ok  ${name}\n`);
};
// Small seeded generator so a failure can be reproduced.
let seed = 20261101;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const randInt = (n) => Math.floor(rand() * n);
const assertClean = (html, label) => assert.ok(!BROKEN.test(html), `${label}: ${(html.match(BROKEN) || [])[0]}`);

const queryOfPair = (set, pair) => ({ pair, spec: null, title: pair.title, rawTitle: set.raw.films[pair.film], cityIdx: pair.cityIdx, theaters: NaN, d1: pair.d1, y: pair.y });
const queryOfNewFilm = (patch = {}) => ({ pair: null, spec: null, title: 'Film uji', rawTitle: 'Film uji', cityIdx: 10, theaters: 3, d1: '2025-12-24', y: [100, 120, 90], ...patch });
const pageHtml = (view) => [U.kpisHtml(view), U.chartHtml(view), U.legendHtml(view), U.sourceText(view), U.bannerText(view)].join('');

test('every cluster and morning renders a clean card in both data sets', () => {
  let cards = 0;
  Object.values(SETS).forEach((set) => {
    set.byCluster.forEach((_, cl) => {
      [...U.morningsOf(set, cl).map((m) => m.t), U.ALL_MORNINGS].forEach((t) => {
        const card = U.cardFor(set, cl, t, TARGET);
        assert.ok(card.rows.length > 0, `${set.mode} ${cl} ${t} has no film`);
        const html = U.managerKpisHtml(card, set.mode) + U.managerBodyHtml(card, null) + U.managerCountsHtml(card, null);
        assertClean(html, `${set.mode} cluster ${cl} ${t}`);
        assert.equal((html.match(/data-i=/g) || []).length, card.rows.length);
        cards += 1;
      });
    });
  });
  assert.ok(cards > 3000, `only ${cards} cards`);
});

test('a filtered card shows only that saran, and says so when it is empty', () => {
  const yogya = U.clusterIndex('Yogyakarta', 'A');
  const card = U.cardFor(SETS.test, yogya, '2025-12-27', TARGET);
  const lepas = U.managerBodyHtml(card, 'lepas');
  assert.ok(lepas.includes('Patah Hati yang Kupilih'));
  assert.ok(!lepas.includes('Comic 8'));
  assert.ok(U.managerBodyHtml(card, 'tahan').includes('Tidak ada film'));
});

test('the manager card reads like the deck card: biggest film first, daily numbers, reason line, one morning', () => {
  const yogya = U.clusterIndex('Yogyakarta', 'A');
  const card = U.cardFor(SETS.test, yogya, '2025-12-27', TARGET);
  const body = U.managerBodyHtml(card, null);
  const order = ['Janur Ireng', 'The SpongeBob', 'Comic 8', 'Patah Hati'].map((t) => body.indexOf(t));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  ['1.239', '778', '578', '232', '+54% dari 31 Des', 'Sabtu di atas rata-rata', 'turun ke 0,22×', 'Lepas teater 31 Des'].forEach((s) => assert.ok(body.includes(s), s));
  assert.equal(U.managerCaptionText(card, yogya, '2025-12-27'), 'Klaster Yogyakarta A · 4 film rilis Rabu, 24 Des 2025');
  const head = U.managerHeadHtml(card, '2025-12-27');
  assert.ok(head.includes('Sab<br>27 Des') && head.includes('Jum<br>2 Jan'));
  assert.ok(U.managerHeadHtml(card, U.ALL_MORNINGS).includes('D10'));
  // each row: film + 3 sold + average + 7 forecast + total + schedule + saran = 15 cells, as many as the header
  const cells = (body.split('</tr>')[0].match(/<td/g) || []).length;
  assert.equal(cells, 15);
});

test('validation cards compare the saran with what happened', () => {
  const [cl] = [...SETS.val.byCluster.keys()];
  const card = U.cardFor(SETS.val, cl, U.ALL_MORNINGS, TARGET);
  const html = U.managerKpisHtml(card, 'val') + U.managerBodyHtml(card, null);
  assert.ok(html.includes('Saran terbukti'));
  assert.ok(html.includes('aktual'));
  assert.ok(/[✓✗]/.test(html));
  assert.ok(!U.managerKpisHtml(U.cardFor(SETS.test, U.clusterIndex('Yogyakarta', 'A'), U.ALL_MORNINGS, TARGET), 'test').includes('Saran terbukti'));
});

test('every listed pair passes the form check as it stands', () => {
  Object.values(SETS).forEach((set) => {
    for (let i = 0; i < set.n; i += 1) {
      const error = U.formError(queryOfPair(set, U.pairOf(set, i)));
      assert.equal(error, '', `${set.mode} pair ${i}: ${error}`);
    }
  });
});

test('simulation output is clean on random listed pairs and stays on the model forecast', () => {
  for (let n = 0; n < RANDOM_PAIRS; n += 1) {
    const set = n % 2 ? SETS.test : SETS.val;
    const i = randInt(set.n);
    const view = U.forecastView(queryOfPair(set, U.pairOf(set, i)));
    assert.ok(view.isModel);
    assert.equal((U.chartHtml(view).match(/class="day/g) || []).length, 10);
    assertClean(pageHtml(view), `${set.mode} pair ${i}`);
  }
});

test('the reasons on the banner stay short on every pair', () => {
  Object.values(SETS).forEach((set) => {
    for (let i = 0; i < set.n; i += 1) {
      const { why } = U.pairOf(set, i).decision;
      assert.ok(why.length <= MAX_WHY_CHARS, `${set.mode} pair ${i}: ${why}`);
    }
  });
});

test('Lebaran titles show the high scenario and hide the reliability figure', () => {
  const alts = Object.keys(DATA.test.alt).map(Number);
  assert.ok(alts.length > 0);
  alts.forEach((i) => {
    const pair = U.pairOf(SETS.test, i);
    const view = U.forecastView(queryOfPair(SETS.test, pair));
    assert.ok(pair.alt, `pair ${i} lost its scenario`);
    assert.ok(U.chartHtml(view).includes('class="ghost"'), `pair ${i}: no outline`);
    assert.ok(U.legendHtml(view).includes('Skenario tinggi'));
    assert.ok(U.kpisHtml(view).includes('skenario tinggi'));
    assert.ok(!U.kpisHtml(view).includes('Keandalan'), `pair ${i}: reliability shown`);
  });
});

test('test pairs show reliability but no MASE; validation pairs show both', () => {
  const kind = U.forecastView(queryOfPair(SETS.test, U.casePair(U.CASES[0])));
  assert.ok(kind.actual === null);
  assert.ok(U.kpisHtml(kind).includes('Keandalan'));
  assert.ok(!U.kpisHtml(kind).includes('MASE'));
  const val = U.forecastView(queryOfPair(SETS.val, U.pairOf(SETS.val, 0)));
  assert.ok(U.kpisHtml(val).includes('MASE'));
  assert.ok(U.kpisHtml(val).includes('LightGBM'));
  assert.ok(U.chartHtml(val).includes('class="act"'));
});

test('the weekend and holiday rules show as one saran, with reliability kept per rule', () => {
  assert.deepEqual(U.SARAN_ORDER, ['tambah', 'tahan', 'kurangi', 'lepas']);
  assert.equal(U.KIND_LABEL.libur, U.KIND_LABEL.tambah);
  const yogya = U.clusterIndex('Yogyakarta', 'A');
  const card = U.cardFor(SETS.test, yogya, '2025-12-27', TARGET);
  const counts = U.managerCountsHtml(card, null);
  assert.equal((counts.match(/<button/g) || []).length, 4);
  assert.ok(counts.includes('2 Tambah jadwal'), counts); // Janur Ireng (holiday) + SpongeBob (weekend)
  const onlyAdd = U.managerBodyHtml(card, 'tambah');
  assert.ok(onlyAdd.includes('Janur Ireng') && onlyAdd.includes('The SpongeBob') && !onlyAdd.includes('Comic 8'));
  const summary = U.managerSummaryHtml(card);
  assert.equal((summary.match(/Tambah jadwal/g) || []).length, 1);
  assert.ok(summary.includes('hari libur') && summary.includes('akhir pekan'), summary);
  Object.values(SETS).forEach((set) => {
    for (let i = 0; i < set.n; i += 1) assert.ok(!U.pairOf(set, i).decision.action.includes('ekstra'), `${set.mode} ${i}`);
  });
});

test('thirteen test cases resolve to the saran their notes describe', () => {
  const EXPECTED = {
    janur: 'Tambah jadwal 1 Jan',
    balas: 'Lepas teater 10 Feb',
    jumat: 'Lepas teater 11 Des',
    natal: 'Tambah jadwal Sab–Min',
    isra: 'Tambah jadwal 16 Jan',
    lebaran: 'Tambah jadwal Sab–Min',
    habis: 'Tambah jadwal Sab–Min',
    lokasi: 'Lepas teater 5 Des',
    imax: 'Lepas teater 12 Nov',
    kursi: 'Tambah jadwal Sab–Min',
    pola3: 'Tambah jadwal Sab–Min',
    nyepi: 'Tambah jadwal Sab–Min',
    ramadan: 'Kurangi mulai 23 Feb',
  };
  assert.equal(U.CASES.length, Object.keys(EXPECTED).length);
  U.CASES.forEach((spec) => {
    const pair = U.casePair(spec);
    const view = U.forecastView({ ...queryOfPair(SETS.test, pair), spec });
    assert.equal(pair.decision.action, EXPECTED[spec.id], spec.id);
    assert.ok(spec.note.length <= MAX_NOTE_CHARS, `${spec.id}: note too long`);
    assert.ok(U.bannerText(view).endsWith(spec.note), spec.id);
    assertClean(pageHtml(view), spec.id);
  });
});

test('the facts the case notes lean on hold in the data', () => {
  const caseById = (id) => U.casePair(U.CASES.find((c) => c.id === id));
  const adviceOf = (pair) => U.forecastView(queryOfPair(SETS.test, pair)).advice;
  // kursi: rising demand, seats already enough
  assert.equal(adviceOf(caseById('kursi')).kind, 'enough');
  // habis: the schedule hits the cluster limit
  assert.ok(adviceOf(caseById('habis')).note.includes('batas klaster'));
  // lebaran: two scenarios
  assert.ok(caseById('lebaran').alt);
  // lokasi: the same film gets the opposite saran in Jakarta A
  const zootopia = caseById('lokasi');
  const jakartaA = SETS.test.byFilm.get(zootopia.film).map((i) => U.pairOf(SETS.test, i)).find((p) => p.cl === U.clusterIndex('Jakarta', 'A'));
  assert.equal(jakartaA.decision.kind, 'tambah');
  // pola3: only D3 sold
  assert.deepEqual(caseById('pola3').y.slice(0, 2), [0, 0]);
  // nyepi: nothing sold on D2 because of Nyepi
  assert.equal(caseById('nyepi').y[1], 0);
  assert.equal(U.holidayShort(U.addDays(caseById('nyepi').d1, 1)), 'Nyepi');
  // natal: Christmas falls on a Thursday inside the forecast window
  assert.ok(caseById('natal').dates.some((d) => U.holidayShort(d) === 'Natal' && U.hariTgl(d).startsWith('Kam')));
});

test('a case note disappears when the case moves to another cluster or is edited', () => {
  const spec = U.CASES.find((c) => c.id === 'lokasi');
  const pair = U.casePair(spec);
  const other = SETS.test.byFilm.get(pair.film).map((i) => U.pairOf(SETS.test, i)).find((p) => p.i !== pair.i);
  const moved = U.forecastView({ ...queryOfPair(SETS.test, other), spec });
  assert.ok(!U.bannerText(moved).includes(spec.note));
  const edited = U.forecastView({ ...queryOfPair(SETS.test, pair), spec, y: [pair.y[0] + 1, pair.y[1], pair.y[2]] });
  assert.ok(!U.bannerText(edited).includes(spec.note));
});

test('the film list offers every case, every film of both sets, and a new film', () => {
  const html = U.filmOptionsHtml();
  assertClean(html, 'film list');
  const options = (html.match(/<option /g) || []).length;
  assert.equal(options, U.CASES.length + SETS.test.meta.length + SETS.val.meta.length + 1);
  U.CASES.forEach((c) => assert.ok(html.includes(`value="case:${c.id}"`)));
  assert.deepEqual(U.filmChoice('__new'), null);
  assert.equal(U.filmChoice('val:3').mode, 'val');
  assert.equal(U.filmChoice('case:janur').spec.id, 'janur');
  assert.equal(U.weekOf('2025-12-24').group, 'Libur nasional');
});

test('form rejects bad input with a message', () => {
  const bad = [
    { title: '' }, { d1: '' }, { d1: 'besok' }, { d1: '2024-01-01' }, { d1: '2030-01-01' }, { d1: '2026-04-22' },
    { y: [0, 0, 0] }, { y: [NaN, 10, 10] }, { y: [-1, 10, 10] }, { y: [1.5, 10, 10] }, { y: [100001, 10, 10] }, { y: [1e9, 0, 0] },
    { theaters: NaN }, { theaters: 0 }, { theaters: -3 }, { theaters: 2.5 }, { theaters: 31 },
    { cityIdx: NaN }, { cityIdx: -1 }, { cityIdx: 999 },
    { theaters: 1, y: [100000, 0, 0] },
  ];
  bad.forEach((patch) => {
    const error = U.formError(queryOfNewFilm(patch));
    assert.ok(error, `accepted ${JSON.stringify(patch)}`);
    assert.ok(!BROKEN.test(error), error);
  });
  assert.equal(U.formError(queryOfNewFilm()), '');
});

test('a new film gets a clean quick estimate on random valid input', () => {
  for (let n = 0; n < RANDOM_NEW_FILMS; n += 1) {
    const q = queryOfNewFilm({
      cityIdx: randInt(DATA.cities.length),
      d1: U.addDays('2025-03-01', randInt(DATE_RANGE_DAYS)),
      y: [randInt(TICKET_RANGE), n % 3 ? randInt(TICKET_RANGE) : 0, randInt(TICKET_RANGE) + 1],
      theaters: NEW_FILM_THEATERS,
    });
    assert.equal(U.formError(q), '', `${q.d1} ${q.y}`);
    const view = U.forecastView(q);
    assert.ok(!view.isModel);
    assert.ok(view.fc.every((v) => Number.isFinite(v) && v >= 0), `${q.d1} ${q.y}`);
    assertClean(pageHtml(view), `new film ${q.d1} ${q.y}`);
  }
});

test('editing the sales or date of a listed film switches to the labelled quick estimate', () => {
  const pair = U.casePair(U.CASES[0]);
  const same = U.forecastView(queryOfPair(SETS.test, pair));
  assert.ok(same.isModel);
  assert.deepEqual(same.fc, pair.fc);
  [{ y: [pair.y[0] + 50, pair.y[1], pair.y[2]] }, { d1: U.addDays(pair.d1, 1) }].forEach((patch) => {
    const view = U.forecastView({ ...queryOfPair(SETS.test, pair), ...patch });
    assert.ok(!view.isModel);
    assert.ok(U.sourceText(view).startsWith('Estimasi cepat'));
    assert.ok(!U.kpisHtml(view).includes('Keandalan'));
    assertClean(pageHtml(view), JSON.stringify(patch));
  });
});

test('a validation film edited in the form leaves its own family out of the estimate', () => {
  const pair = U.pairOf(SETS.val, 0);
  const family = U.quickFamilyOf(SETS.val.raw.films[pair.film]);
  assert.ok(family >= 0);
  assert.equal(U.quickFamilyOf('Judul yang tidak ada'), -1);
});

test('hostile titles cannot inject markup', () => {
  const attack = '<img src=x onerror=alert(1)>"\'&';
  assert.equal(U.esc(attack), '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
  const card = U.cardFor(SETS.test, U.clusterIndex('Yogyakarta', 'A'), '2025-12-27', TARGET);
  const rows = card.rows.map((r) => ({ ...r, pair: { ...r.pair, title: attack } }));
  const body = U.managerBodyHtml({ ...card, rows }, null);
  assert.ok(!body.includes('<img'), 'raw tag in table');
  assert.ok(body.includes('&lt;img'), 'title not shown escaped');
  const view = U.forecastView(queryOfNewFilm({ title: attack, rawTitle: attack }));
  assert.ok(!pageHtml(view).includes('<img'), 'raw tag in simulation');
});

test('the step sentence, why strip and morning summary are clean on every pair and card', () => {
  Object.values(SETS).forEach((set) => {
    for (let i = 0; i < set.n; i += 1) {
      const p = U.pairOf(set, i);
      const view = U.forecastView(queryOfPair(set, p));
      assertClean(U.stepText(view) + U.rulesHtml(view), `${set.mode} pair ${i}`);
      assert.equal((U.rulesHtml(view).match(/class="rule on"/g) || []).length, 1);
    }
    set.byCluster.forEach((_, cl) => {
      assertClean(U.managerSummaryHtml(U.cardFor(set, cl, U.ALL_MORNINGS, TARGET)), `${set.mode} summary ${cl}`);
    });
  });
});

process.stdout.write(`\n${passed} checks passed\n`);
