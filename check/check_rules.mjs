// Decision logic checks: the deck's Yogyakarta card, parity with Python on all pairs, schedule and revenue sanity.
import assert from 'node:assert/strict';
import { loadEngine } from './load.mjs';

const E = loadEngine();
const { DATA, SETS, KIND_ORDER } = E;
let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  process.stdout.write(`ok  ${name}\n`);
};
const KINDS = ['lepas', 'tambah', 'libur', 'tahan', 'kurangi'];

// Deck p.25 / 06_FAKTA_ANGKA part F. These numbers are the contract with the slides.
const CARD = [
  { t: 'Janur Ireng: Sewu Dino The Prequel', y: [1239, 673, 422], f: [578, 536, 446, 399, 151, 232, 177], act: 'Jadwal ekstra 1 Jan', why: 'Tahun Baru: +54% vs Rab' },
  { t: 'The SpongeBob Movie: Search for SquarePants', y: [437, 427, 392], f: [455, 436, 356, 329, 131, 177, 193], act: 'Tambah jadwal Sab–Min', why: 'Sab: 1,09× rata-rata' },
  { t: 'Comic 8 Revolution: Santet K4binet', y: [330, 362, 198], f: [246, 232, 209, 187, 65, 51, 39], act: 'Kurangi mulai 31 Des', why: 'Rab: turun ke 0,22×' },
  { t: 'Patah Hati yang Kupilih', y: [236, 133, 101], f: [101, 84, 51, 28, 0, 0, 0], act: 'Lepas layar 31 Des', why: '0 tiket sejak Rab (D8)' },
];
const yogyaA = DATA.clusters.findIndex((c, i) => E.clusterName(i) === 'Klaster Yogyakarta A');

test('cluster naming follows the deck: Yogyakarta A has 106 test pairs', () => {
  assert.equal(SETS.test.byCluster.get(yogyaA).length, 106);
});

test('Saturday 27 Dec 2025 card equals the deck, film by film', () => {
  const card = E.cardFor(SETS.test, yogyaA, '2025-12-27', 0.4);
  assert.equal(card.rows.length, 4);
  card.rows.forEach((row, n) => {
    const want = CARD[n];
    assert.equal(row.pair.title, want.t);
    assert.deepEqual(row.pair.y, want.y);
    assert.deepEqual(row.pair.decision.rounded, want.f);
    assert.equal(row.pair.decision.action, want.act);
    assert.equal(row.pair.decision.why, want.why);
  });
});

test('all 10,373 test pairs: JS decisions equal Python', () => {
  assert.equal(SETS.test.n, 10373);
  const pairs = Array.from({ length: SETS.test.n }, (_, i) => E.pairOf(SETS.test, i));
  assert.deepEqual(E.kindCounts(pairs), Object.fromEntries(KIND_ORDER.map((k) => [k, DATA.proof.test.counts[k]])));
});

test('all 7,043 validation pairs: confusion against hindsight equals Python', () => {
  assert.equal(SETS.val.n, 7043);
  const counts = KINDS.map(() => KINDS.map(() => 0));
  for (let i = 0; i < SETS.val.n; i += 1) {
    const p = E.pairOf(SETS.val, i);
    counts[KINDS.indexOf(p.decision.kind)][KINDS.indexOf(p.hindsight.kind)] += 1;
  }
  assert.deepEqual(counts, DATA.proof.decisions.confusion);
});

test('claim held rates per saran equal Python within rounding of stored tickets', () => {
  KINDS.forEach((kind) => {
    const rows = [];
    for (let i = 0; i < SETS.val.n; i += 1) {
      const p = E.pairOf(SETS.val, i);
      if (p.decision.kind === kind) rows.push(p.held);
    }
    const rate = rows.filter(Boolean).length / rows.length;
    const want = DATA.proof.decisions.realised[kind];
    assert.equal(rows.length, want.n);
    assert.ok(Math.abs(rate - want.held) < 0.002, `${kind}: ${rate} vs ${want.held}`);
  });
});

test('five Lebaran titles carry both scenarios, and the saran is the same in both', () => {
  const lebaran = Object.keys(SETS.test.raw.alt).map(Number);
  assert.equal(lebaran.length, 500);
  const total = (xs) => xs.reduce((a, b) => a + b, 0);
  lebaran.forEach((i) => {
    const low = E.pairOf(SETS.test, i);
    assert.ok(low.lebaran);
    assert.equal(low.decision.kind, E.decide(low.alt, low.avg, low.dates).kind);
    assert.ok(total(low.alt) > total(low.fc));
  });
});

test('schedule: no shows needed on zero days; at least one when tickets exist', () => {
  const plan = E.schedule([0.4, 0.6, 100, 0, 1000, 0, 2], 150, 5, 0.4);
  assert.deepEqual(plan.need, [0, 1, 2, 0, 17, 0, 1]);
  assert.equal(plan.occNow[2], 100 / (150 * 5));
  assert.deepEqual(E.schedule([1000], 150, 5, 0.4, 10).need, [10]);
  assert.deepEqual(E.schedule([1000], 150, 5, 0.4, 10).capped, [true]);
});

test('capacity check: rising demand with plenty of seats says enough, not more shows', () => {
  const jakartaA = DATA.clusters.findIndex((c, i) => E.clusterName(i) === 'Klaster Jakarta A');
  const card = E.cardFor(SETS.test, jakartaA, '2026-03-14', 0.4);
  const row = card.rows.find((r) => r.pair.title === 'Number One');
  assert.equal(row.pair.decision.kind, 'tambah');
  assert.equal(row.advice.kind, 'enough');
  assert.equal(row.advice.from, row.pair.showsNow);
});

test('every cluster has a positive show capacity at least as large as its biggest D3 schedule', () => {
  Object.values(SETS).forEach((set) => {
    for (let i = 0; i < set.n; i += 1) {
      const cap = DATA.clusters[set.raw.cl[i]].cap;
      assert.ok(cap > 0);
      if (set.mode === 'test') assert.ok(set.raw.sh[3 * i + 2] <= cap, `pair ${i}`);
    }
  });
});

test('prices: weekday / Friday / weekend come from the city table', () => {
  const c = DATA.cities.indexOf('Yogyakarta');
  assert.equal(E.priceOf(c, '2025-12-29'), DATA.prices[c][0]);
  assert.equal(E.priceOf(c, '2026-01-02'), DATA.prices[c][1]);
  assert.equal(E.priceOf(c, '2025-12-27'), DATA.prices[c][2]);
});

test('card totals add up across rows, and the mornings of a cluster cover all its films', () => {
  const c = E.cardFor(SETS.test, yogyaA, '2025-12-27', 0.4);
  assert.ok(Math.abs(c.rows.reduce((s, r) => s + r.tickets, 0) - c.tickets) < 1e-6);
  assert.ok(Math.abs(c.rows.reduce((s, r) => s + r.revenue, 0) - c.revenue) < 1e-3);
  const all = E.cardFor(SETS.test, yogyaA, E.ALL_MORNINGS, 0.4);
  assert.equal(all.rows.length, 106);
  const byMorning = E.morningsOf(SETS.test, yogyaA).reduce((s, m) => s + E.cardFor(SETS.test, yogyaA, m.t, 0.4).rows.length, 0);
  assert.equal(byMorning, 106);
});

test('every morning of every cluster builds a card without NaN', () => {
  Object.values(SETS).forEach((set) => {
    set.byCluster.forEach((_, cl) => {
      E.morningsOf(set, cl).forEach(({ t }) => {
        const c = E.cardFor(set, cl, t, 0.4);
        assert.ok(c.rows.length > 0);
        assert.ok(Number.isFinite(c.tickets) && Number.isFinite(c.revenue));
      });
    });
  });
});

test('quick estimate: accuracy on a leave-family-out sample equals Python', () => {
  const lib = E.quickLibrary();
  const { raw } = SETS.val;
  let total = 0;
  let count = 0;
  for (let i = 0; i < SETS.val.n; i += 20) {
    const y = E.slice(raw.y, i, 3);
    const d1 = raw.d1[raw.film[i]];
    const cityIdx = DATA.clusters[raw.cl[i]].c;
    const fc = E.quickEstimate(y, d1, cityIdx, lib, lib[i].fam);
    const actual = E.slice(raw.a, i, 7);
    total += E.pairMase(fc, actual, E.averageD13(y));
    count += 1;
  }
  const js = total / count;
  const want = DATA.proof.quick.mase_sample20;
  assert.ok(Math.abs(js - want) < 0.003, `${js} vs ${want}`);
});

test('the why strip lights the same rule as the saran on every pair', () => {
  Object.values(SETS).forEach((set) => {
    for (let i = 0; i < set.n; i += 1) {
      const p = E.pairOf(set, i);
      const trace = E.ruleTrace(p.fc, p.avg, p.dates);
      assert.equal(trace.find((r) => r.met).kind, p.decision.kind, `${set.mode} pair ${i}`);
    }
  });
});

process.stdout.write(`\n${passed} checks passed\n`);
