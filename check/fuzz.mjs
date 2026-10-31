import fs from 'fs';
const h = fs.readFileSync('tiga-hari-cukup.html','utf8');
const data = h.split("const DATA = ")[1].split("/*ENGINE*/")[0].trim().replace(/;$/,"");
const E = new Function(`const DATA=${data};${h.split('/*ENGINE*/')[1].split('/*END*/')[0]};return {similarCases,decide,shiftDate,addDays,DATA};`)();
const D = E.DATA, rnd = n => Math.floor(Math.random()*n);
const dates = []; for(let d='2025-03-01'; d<='2026-04-21'; d=E.addDays(d,1)) dates.push(d);
const ys = [[0,0,1],[1,0,0],[100000,100000,100000],[5,5,5],[0,50,0],[1000,10,1],[10,1000,10],[3,2,1]];
let n=0, bad=0, codes={};
const t0=Date.now();
for(let i=0;i<3000;i++){
  const y = i<ys.length*60 ? ys[i%ys.length] : [rnd(3000),rnd(3000),rnd(3000)];
  if(y.every(v=>v===0)) continue;
  const d1 = dates[rnd(dates.length)], city = D.cities[rnd(D.cities.length)];
  const p = E.similarCases(y,d1,-1,city), v = E.decide(p,y,d1);
  n++; codes[v.code]=(codes[v.code]||0)+1;
  if(p.length!==7 || p.some(x=>!Number.isFinite(x)||x<0) || !v.code) { bad++; console.log('BAD',y,d1,city,p); }
}
for(const f of D.demo.filter(f=>!f.uji)) for(const [c,x] of Object.entries(f.cities)) for(const d1 of [dates[0],dates.at(-1),'2026-03-18','2025-12-28']){
  const p=E.shiftDate(x.tab,x.y,f.d1,d1,x.city); n++; if(p.some(v=>!Number.isFinite(v)||v<0)) {bad++; console.log('BADSHIFT',f.film,c,d1);} }
console.log('runs',n,'bad',bad,'verdicts',codes,'ms per estimate',((Date.now()-t0)/3000).toFixed(1));
