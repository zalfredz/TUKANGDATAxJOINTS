// Runs src/engine.js + src/store.js (and src/ui.js) in Node against data/data.json, so the logic is tested without a browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const EXPORTS = `decide, ruleTrace, claimHeld, schedule, scheduleAdvice, revenueOf, priceOf, quickEstimate, quickLibrary, quickFamilyOf,
  addDays, windowDates, averageD13, holidayShort, isWeekend, fmtInt, fmtDec, fmtPct, fmtRp, tgl, hariTgl,
  SETS, pairOf, cardFor, ALL_MORNINGS, morningsOf, kindCounts, clusterName, heldRateOf, pairMase, slice, KIND_ORDER, KIND_LABEL, SARAN_ORDER, saranOf, DATA`;

export function loadEngine() {
  const DATA = JSON.parse(read('data/data.json'));
  const code = `${read('src/engine.js')}\n${read('src/store.js')}\nreturn {${EXPORTS}};`;
  return new Function('DATA', code)(DATA);
}

const UI_EXPORTS = `${EXPORTS}, esc, CASES, casePair, weekOf, filmOptionsHtml, filmChoice, formError, forecastView, bannerText, sourceText,
  kpisHtml, chartHtml, legendHtml, basisDays, jadwalText, managerKpisHtml, managerBodyHtml, managerCountsHtml, clusterIndex, SEATS_PER_SHOW, stepText, rulesHtml, managerSummaryHtml, managerHeadHtml, managerCaptionText`;

/** Engine plus the page's HTML builders. They touch the DOM only when called with $(), so most run under Node. */
export function loadUi() {
  const DATA = JSON.parse(read('data/data.json'));
  const parts = ['src/engine.js', 'src/store.js', 'src/ui.js'].map(read);
  return new Function('DATA', `${parts.join('\n')}\nreturn {${UI_EXPORTS}};`)(DATA);
}

export const projectRoot = root;
