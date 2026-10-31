
const DOW = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const MON = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
function addDays(iso, n){ const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); }
function dow(iso){ return new Date(iso + 'T00:00:00Z').getUTCDay(); }
function holiday(iso){ const c = DATA.cal[iso]; if(!c || !c[1]) return ''; return c[1].replace(/^CB /,'Cuti bersama ').replace(/ \(revision.*\)/,''); }
// day weight relative to the week (fig07): weekend 1,33 · weekday holiday 1,26 · Friday 0,98 · Mon–Thu 0,74 (0,91 in school holidays)
function weight(iso){ const c = DATA.cal[iso]; if(c) return c[0]; const w = dow(iso); return (w===0||w===6) ? 1.33 : w===5 ? 0.98 : 0.74; }
function isWeekend(iso){ const w = dow(iso); return w===0 || w===6; }

function similarCases(y, d1, excludeFam, city){
  const wd = [0,1,2].map(i => weight(addDays(d1,i)));
  const a = y.map((v,i) => (v+1)/wd[i]);
  const f = [Math.log(a[1]/a[0]), Math.log(a[2]/a[0]), 0.25*Math.log1p((y[0]+y[1]+y[2])/3)];
  const K = 100, best = [];
  for(const r of DATA.lib){
    if(r[10] === excludeFam) continue;
    const dist = (r[0]-f[0])**2 + (r[1]-f[1])**2 + (r[2]-f[2])**2;
    if(best.length < K){ best.push([dist,r]); if(best.length===K) best.sort((p,q)=>q[0]-p[0]); }
    else if(dist < best[0][0]){ best[0] = [dist,r]; best.sort((p,q)=>q[0]-p[0]); }
  }
  const w13 = (wd[0]+wd[1]+wd[2])/3, scale = Math.max(1,(y[0]+y[1]+y[2])/3);
  const R = [0,1,2,3,4,5,6].map(i => {
    const v = best.map(b => b[1][3+i]).sort((p,q)=>p-q);
    const med = K%2 ? v[(K-1)/2] : (v[K/2-1]+v[K/2])/2;
    return Math.max(0, med * weight(addDays(d1,3+i)) / w13);
  });
  return jointsLayers(R, d1, city).map(r => r * scale);
}

// Post-model calendar layers from the JOINTS notebook (nb_80_modeling, Lampiran L06), on R = tickets / mean(D1–D3).
function jointsLayers(R, d1, city){
  const C = (city||'').toUpperCase();
  return R.map((r,i) => {
    const k = i+4, date = addDays(d1, 3+i);
    if(date === '2025-12-31') r *= 0.577;                                  // b: malam tahun baru
    else if(DATA.calm[d1+'|'+k]) r *= DATA.calm[d1+'|'+k];                 // b: H-3..H-1 Lebaran, awal Ramadan
    if(d1 === '2026-03-18'){                                               // c: kohort Lebaran = prior(hari, tipe kota) × peringkat^0,2
      const prior = (DATA.leb[C] || DATA.leb[DATA.ctype[C]] || DATA.leb.destination_java)[i];
      const rank = Math.min(10, Math.max(0.1, Math.max(r, 0.05) / (0.8*prior)));
      r = prior * rank ** 0.2;
    }
    if(C === 'DENPASAR' && date === '2026-03-19') r = 0;                   // d: Nyepi
    return Math.max(0, r);                                                 // a: R >= 0
  });
}

// Rule order from the kit's Yogyakarta card. pred = tickets for days 4..10.
function decide(pred, y, d1){
  const avg = Math.max(1,(y[0]+y[1]+y[2])/3), R = pred.map(t => t/avg), date = i => addDays(d1,3+i);
  const zero = t => t < 0.5;
  if(zero(pred[6])){ let j = 6; while(j>0 && zero(pred[j-1])) j--; return {code:'TURUNKAN', day:j, R}; }
  for(let i=0;i<7;i++) if(isWeekend(date(i)) && R[i] >= 1.0) return {code:'TAMBAH', kind:'weekend', day:i, R};
  for(let i=1;i<7;i++) if(weight(date(i))===1.26 && R[i] >= 1.2*R[i-1]) return {code:'TAMBAH', kind:'libur', day:i, R};
  const tail = (R[4]+R[5]+R[6])/3;
  if(tail >= 0.5) return {code:'PERTAHANKAN', tail, R};
  let j = R.findIndex(r => r < 0.5); if(j < 0) j = 4;
  return {code:'KURANGI', day:j, tail, R};
}

// A TabICLv2 forecast moved to another release date: keep its decay, swap the calendar of the old dates for the new ones.
function shiftDate(tab, y, fromD1, toD1, city){
  const s = Math.max(1,(y[0]+y[1]+y[2])/3), w13 = d => [0,1,2].reduce((a,i)=>a+weight(addDays(d,i)),0)/3;
  const R = tab.map((t,i) => t/s / (weight(addDays(fromD1,3+i))/w13(fromD1)) * weight(addDays(toD1,3+i))/w13(toD1));
  return jointsLayers(R, toD1, city).map(r => r*s);
}
// 1 teater ≈ 5 pertunjukan × 149 kursi per hari (median data latih; kit 06_FAKTA_ANGKA bagian B)
const SEATS_PER_TEATER = 5*149;

// Capacity-aware decision (dashboard rule). cap = seats per day of the current schedule. days = when the action applies.
function decideCap(pred, y, cap){
  const avg = Math.max(1,(y[0]+y[1]+y[2])/3), t = pred, span = j => [...Array(7-j)].map((_,k)=>j+k);
  if(t[6] < 0.5){ let j = 6; while(j>0 && t[j-1] < 0.5) j--; return {code:'TURUNKAN', days:span(j), start:j}; }
  const over = t.map((x,i)=>x>cap?i:-1).filter(i=>i>=0);
  if(over.length) return {code:'TAMBAH', days:over, start:over[0]};
  if((t[4]+t[5]+t[6])/3 < 0.5*avg){ let j = t.findIndex(x=>x<0.5*avg); if(j<0) j = 4; return {code:'KURANGI', days:span(j), start:j}; }
  return {code:'PERTAHANKAN', days:[], start:-1};
}
// seats per day: current schedule (shows x 149), but never below what D1-D3 already sold (best day assumed at most 85% full)
const capOf = c => Math.max(c.sh ? (c.sh[0]+c.sh[1]+c.sh[2])/3*149 : c.teater*SEATS_PER_TEATER, Math.max(...c.y)/0.85);
