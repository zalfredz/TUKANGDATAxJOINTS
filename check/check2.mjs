import fs from 'fs';
const h = fs.readFileSync('tiga-hari-cukup.html','utf8');
const data = h.split("const DATA = ")[1].split("/*ENGINE*/")[0].trim().replace(/;$/,"");
const E = new Function(`const DATA=${data};${h.split('/*ENGINE*/')[1].split('/*END*/')[0]};return {decide:(p,y,d1,c)=>decideCap(p,y,capOf(c)),shiftDate,DATA};`)();
let ok = 0, n = 0;
for(const p of E.DATA.demo.filter(p=>!p.uji)){ const c = p.cities[p.def]; const a = E.decide(c.tab,c.y,p.d1,c).code, b = E.decide(c.act,c.y,p.d1,c).code; n++; ok += a===b;
  if(a!==b) console.log('MISMATCH', p.film); }
console.log('default cinemas: TabICL verdict == actual', ok, '/', n);
let m = 0, t = 0; for(const p of E.DATA.demo.filter(p=>!p.uji)) for(const c of Object.values(p.cities)){ t++; m += E.decide(c.tab,c.y,p.d1,c).code===E.decide(c.act,c.y,p.d1,c).code; }
console.log('all cities:', m, '/', t, (100*m/t).toFixed(1)+'%');
const p = E.DATA.demo.find(p=>p.film==='Jurassic World'), c = p.cities[p.def];
console.log('same date identical:', JSON.stringify(E.shiftDate(c.tab,c.y,p.d1,p.d1,p.def).map(Math.round))===JSON.stringify(c.tab.map(Math.round)));
for(const d of [p.d1,'2025-08-13','2025-12-24','2026-03-18']) console.log(d, E.shiftDate(c.tab,c.y,p.d1,d,p.def).map(Math.round).join(' '));
