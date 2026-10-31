const $ = id => document.getElementById(id);
const fmtN = n => Math.round(n).toLocaleString('id-ID');
const fmtX = x => x.toFixed(2).replace('.', ',') + '×';
const fmtD = iso => { const d = new Date(iso+'T00:00:00Z'); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const famOf = name => DATA.films.findIndex(f => f.toLowerCase() === name.trim().toLowerCase().replace(/ \((imax 2d|imax 3d|3d)\)$/,''));
// Short holiday names for display (full names come from the SKB calendar)
const HOL = [[/Muharam|Tahun Baru Islam/,'Tahun Baru Islam'],[/Idulfitri/,'Idulfitri'],[/Idul ?Adha|Iduladha/,'Iduladha'],[/Waisak/,'Waisak'],
  [/Kelahiran Yesus|Natal/,'Natal'],[/Imlek/,'Imlek'],[/Tahun Baru 20/,'Tahun Baru'],[/Nyepi/,'Nyepi'],[/Wafat Yesus/,'Jumat Agung'],
  [/Paskah/,'Paskah'],[/Kenaikan Yesus/,'Kenaikan Yesus'],[/Isra Mikraj/,'Isra Mikraj'],[/Maulid/,'Maulid Nabi'],[/Buruh/,'Hari Buruh'],
  [/Kemerdekaan|HUT RI/,'HUT RI'],[/Pancasila/,'Hari Pancasila']];
function holShort(iso){
  const h = holiday(iso); if(!h) return '';
  const base = (HOL.find(([re]) => re.test(h)) || [0, h])[1];
  return /^Cuti bersama/.test(h) ? `Cuti ${base}` : base;
}
const WORD = {TAMBAH:'Tingkatkan', PERTAHANKAN:'Pertahankan', KURANGI:'Kurangi', TURUNKAN:'Hentikan'};
const DESC = {TAMBAH:'Permintaan naik. Tambah jam tayang.', PERTAHANKAN:'Permintaan stabil. Jadwal tetap.',
  KURANGI:'Permintaan turun. Kurangi pertunjukan.', TURUNKAN:'Permintaan habis. Hentikan penayangan.'};
const wordOf = v => WORD[v.code];
const ACTION = {TAMBAH:'Tambah jadwal', KURANGI:'Kurangi', TURUNKAN:'Hentikan', PERTAHANKAN:''};
const ORDER = ['TAMBAH','PERTAHANKAN','KURANGI','TURUNKAN'];
const RULE = v => v.code==='TURUNKAN' ? 1 : v.code==='TAMBAH' ? (v.kind==='libur' ? 3 : 2) : v.code==='PERTAHANKAN' ? 4 : 5;
const col = c => `var(--${c.toLowerCase()})`;
const MIN_D1 = '2025-03-01', MAX_D1 = '2026-04-21';

function badgeText(v, d1, pred, avg){
  const day = i => fmtD(addDays(d1, 3+i));
  if(v.kind==='penuh') return `Kursi penuh · ${day(v.day)}`;
  if(v.code==='TURUNKAN') return `Aturan 1 · 0 tiket mulai ${day(v.day)}`;
  if(v.kind==='libur') return `Aturan 3 · ${holShort(addDays(d1,3+v.day)) || 'Libur'} ${fmtX(pred[v.day]/Math.max(pred[v.day-1],1e-9))} hari sebelumnya`;
  if(v.code==='TAMBAH') return `Aturan 2 · ${day(v.day)} ${fmtX(pred[v.day]/avg)}`;
  if(v.code==='PERTAHANKAN') return `Aturan 4 · D8–D10 ${fmtX(v.tail)}`;
  return `Aturan 5 · turun di bawah 0,5× mulai ${day(v.day)}`;
}

function read(){
  const fv = $('film').value, isNew = fv === '__new', sc = SCEN[fv];
  return {isNew, film:isNew ? $('filmNew').value.trim() : sc ? sc.film : fv, kota:$('kota').value, city:isNew ? $('kota').value : $('city').value,
    n:Math.max(1,Number($('teater').value)||1), d1:$('d1').value, y:['y1','y2','y3'].map(id=>Number($(id).value))};
}

function labels(q){
  ['l1','l2','l3'].forEach((id,i)=>$(id).textContent = q.d1 ? fmtD(addDays(q.d1,i)) : `Hari ${i+1}`);
}

let timer, lastFilm = null;
function run(){
  const q = read(); labels(q);
  const err = !q.film ? 'Ketik judul film.'
    : !q.d1 || q.d1 < MIN_D1 || q.d1 > MAX_D1 ? 'Pilih tanggal 1 Mar 2025 – 21 Apr 2026.'
    : q.y.some(v=>!Number.isInteger(v)||v<0||v>100000) ? 'Tiket D1–D3: bilangan bulat 0–100.000.'
    : q.y.every(v=>v===0) ? 'Tiket D1–D3 tidak boleh semuanya 0.'
    : !(Number($('teater').value)>=1 && Number($('teater').value)<=30) ? 'Teater 1–30.'
    : Math.max(...q.y) > q.n*SEATS_PER_TEATER ? `${fmtN(Math.max(...q.y))} tiket/hari tidak muat di ${q.n} teater. Tambah teater.` : '';
  $('err').textContent = err;
  if(err) return;
  const P = !q.isNew && DATA.demo.find(p=>p.film===q.film), C = P && entry(P, q.kota, q.city);
  let pred, act = null, mode;
  if(C && C.y.every((v,i)=>v===q.y[i])){
    if(q.d1===P.d1){ pred = C.tab; act = C.act; mode = P.uji ? 'TabICLv2 · data uji' : 'TabICLv2 · validasi'; }
    else { pred = shiftDate(C.tab, q.y, P.d1, q.d1, C.city); mode = 'TabICLv2 · skenario tanggal (tanpa data aktual)'; }
  } else { pred = similarCases(q.y, q.d1, famOf(q.film), q.kota); mode = 'Estimasi cepat'; }

  // capacity = seats of the schedule running in D1-D3 (listed films) or of the theaters typed in (new film)
  const avg = Math.max(1,(q.y[0]+q.y[1]+q.y[2])/3), cap = C && !q.isNew ? capOf(C) : capOf({teater:q.n, y:q.y});
  const v = decideCap(pred, q.y, cap), c = col(v.code), sold = pred;

  // banner
  $('banner').style.borderColor = `color-mix(in srgb, ${c} 45%, transparent)`;
  $('banner').style.boxShadow = `0 0 26px -6px color-mix(in srgb, ${c} 30%, transparent)`;
  $('word').textContent = wordOf(v); $('desc').textContent = DESC[v.code]; $('word').style.color = c;
  const total = sold.reduce((a,b)=>a+b,0);
  $('k2').textContent = fmtN(total);
  // MASE only where actual sales exist (validation films at their real date), next to LightGBM on the same rows
  $('k3box').hidden = !act;
  if(act){
    const err = p => act.reduce((s,a,i)=>s+Math.abs(p[i]-a),0)/7/avg;
    $('k3').textContent = err(pred).toFixed(2).replace('.',',');
    $('k3s').textContent = C.lgb ? `LightGBM ${err(C.lgb).toFixed(2).replace('.',',')}` : '';
  }

  // chart
  $('ctitle').textContent = q.film;
  const top = Math.max(...q.y, ...pred, ...(act||[]), cap, 1), max = top * 1.05;
  const line = `<span class="capl" style="bottom:${cap/max*100}%"></span>`;
  $('days').innerHTML = [...q.y, ...pred].map((t,j)=>{
    const known = j < 3, i = j-3, iso = addDays(q.d1, j), d = new Date(iso+'T00:00:00Z'), off = isWeekend(iso)||holiday(iso);
    const hit = !known && v.days.includes(i), s = t, zero = !known && t < 0.5, h = holShort(iso), ghost = '';
    const a = act && !known ? `<span class="act" style="bottom:${act[i]/max*100}%" title="Aktual ${fmtN(act[i])}"></span>` : '';
    const fill = hit ? `background:${c};border-top-color:${c}` : '';  // days the action applies to
    return `<div class="day${known?' known':''}${hit?' hit':''}${off?' we':''}${zero?' zero':''}${j===3?' first':''}">`
      + `<div class="num"><b style="${zero?'color:var(--turunkan)':''}">${fmtN(s)}</b></div>`
      + `<div class="track${hit && zero ? ' stop' : ''}">${line}${ghost}<div class="bar" style="height:${Math.max(2, s/max*100)}%;${fill}"></div>${a}</div>`
      + `<div class="lab"><b>${DOW[d.getUTCDay()]}</b><span>${d.getUTCDate()} ${MON[d.getUTCMonth()]}</span></div>`
      + `<div class="hol">${!known && t>cap?'<em class="full">penuh</em>':h?`<em>${h}</em>`:''}</div></div>`;
  }).join('');
  $('legend').innerHTML = `<span><span class="sw" style="background:var(--known)"></span>Terjual</span>`
    + `<span><span class="sw" style="background:var(--fc)"></span>Prediksi</span>`
    + (act ? '<span><span class="dot"></span>Aktual</span>' : '')
    + '<span><span class="dash"></span>Kapasitas jadwal sekarang</span>'
    + (v.days.length ? `<span><span class="sw" style="background:${c}"></span>${ACTION[v.code]} ${v.code==='TAMBAH' ? 'di hari yang penuh' : 'mulai ' + fmtD(addDays(q.d1, 3+v.start))}</span>` : '');
  lastFilm = q.film;
}

// "Semua" = every listed cluster of this film in the city, summed day by day (tickets, forecast, actual, LightGBM)
function agg(p, kota){
  const cs = Object.values(p.cities).filter(c => c.city===kota); if(!cs.length) return null;
  const sum = k => cs[0][k] ? cs[0][k].map((_,i) => cs.reduce((s,c) => s + c[k][i], 0)) : null;
  return {y:sum('y'), tab:sum('tab'), act:sum('act'), lgb:sum('lgb'), sh:sum('sh'), teater:cs.reduce((s,c)=>s+c.teater,0), city:kota, id:cs[0].id};
}
const entry = (p, kota, kl) => kl==='__all' ? agg(p, kota) : p.cities[kl];
const byNum = (a,b) => a.localeCompare(b,'id',{numeric:true});
function fillCity(p, city){
  const c = p && entry(p, $('kota').value, city); if(!c) return;
  $('teater').value=c.teater; ['y1','y2','y3'].forEach((id,i)=>$(id).value=c.y[i]);
}
function kotaList(list, keep){
  $('kota').innerHTML = list.map(c=>`<option>${c}</option>`).join('');
  $('kota').value = list.includes(keep) ? keep : list[0];
}
function klList(p, kota, keep){
  const kls = Object.keys(p.cities).filter(k => p.cities[k].city===kota).sort(byNum);
  $('city').innerHTML = kls.map(k=>`<option value="${k}">${k.split(' ').pop()} · ${p.cities[k].id}</option>`).join('');
  $('city').value = kls.includes(keep) ? keep : kls[0];
  $('kllab').textContent = `ID klaster (${kls.length} klaster)`;
}
// Listed films show their cinema cluster (theaters stay in the data, used for "penuh"); a new film has no cluster, so it asks for theaters.
function lockTeater(on){ $('tbox').hidden = on; $('klbox').hidden = !on; }
function load(p){
  $('film').value=p.film; $('filmNew').hidden=true; $('filmNew').required=false; lockTeater(true);
  const kota = p.cities[p.def].city;
  kotaList([...new Set(Object.values(p.cities).map(c=>c.city))].sort(byNum), kota); klList(p, kota, p.def);
  $('d1').value=p.d1; fillCity(p, p.def);
}
function openFilm(name, kl, kota){
  const p = DATA.demo.find(d=>d.film===name); load(p);
  if(kota){ $('kota').value = kota; klList(p, kota, kl); fillCity(p, $('city').value); }
  run(); show('sim');
}

function show(view){
  ['sim','man'].forEach(k => { $('v-'+k).hidden = k!==view; $('t-'+k).setAttribute('aria-selected', String(k===view)); });
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.v)));

// Group films by what their forecast week (D4–D10) contains; Lebaran and Natal are date-shifted scenarios (no actual sales).
function weekOf(p){
  const days = [3,4,5,6,7,8,9].map(i => addDays(p.d1, i)), hol = days.map(holShort).find(Boolean);
  return hol ? ['Libur nasional', hol] : days.some(d => weight(d)===0.91) ? ['Libur sekolah', ''] : ['Hari biasa', ''];
}
const SCEN = {};
[['Lebaran 2026','2026-03-18',['Jurassic World','Lilo & Stitch','The Conjuring','Pembantaian Dukun Santet']],
 ['Natal 2025','2025-12-24',['Lilo & Stitch','Fantastic Four','Jurassic World','Superman']]].forEach(([lab,d1,films]) =>
  films.filter(f=>DATA.demo.some(p=>p.film===f)).forEach(f => { SCEN[`__s${Object.keys(SCEN).length}`] = {film:f, d1, lab}; }));
const groups = {};
DATA.demo.filter(p=>!p.uji).forEach(p => { const [g, h] = weekOf(p); (groups[g] = groups[g] || []).push(`<option value="${p.film}">${p.film}${h?` · ${h}`:''}</option>`); });
const ujiOpts = DATA.demo.filter(p=>p.uji).map(p=>`<option value="${p.film}">${p.film}</option>`).join('');
const scenOpts = lab => Object.entries(SCEN).filter(([,s])=>s.lab===lab).map(([k,s])=>`<option value="${k}">${s.film} · ${s.lab.split(" ")[0]}</option>`).join('');
$('film').innerHTML = ['Hari biasa','Libur nasional','Libur sekolah'].filter(g=>groups[g]).map(g=>`<optgroup label="Data latih · ${g}">${groups[g].join('')}</optgroup>`).join('')
  + (ujiOpts ? `<optgroup label="Data uji · Natal 2025, Yogyakarta (tanpa aktual)">${ujiOpts}</optgroup>` : '')
  + `<optgroup label="Simulasi tanggal · Lebaran 2026">${scenOpts('Lebaran 2026')}</optgroup><optgroup label="Simulasi tanggal · Natal 2025">${scenOpts('Natal 2025')}</optgroup>`
  + '<option value="__new">+ Film baru (isi manual)</option>';
$('film').addEventListener('change',()=>{
  const fv = $('film').value, sc = SCEN[fv], p = DATA.demo.find(d=>d.film===(sc ? sc.film : fv));
  if(p){ load(p); if(sc){ $('film').value = fv; $('d1').value = sc.d1; } run(); return; }
  $('filmNew').hidden=false; $('filmNew').required=true; $('filmNew').value=''; kotaList(DATA.cities); lockTeater(false);
  ['teater','y1','y2','y3'].forEach(id=>$(id).value=''); labels(read()); $('filmNew').focus();
});
// Listed films update as soon as city, date or tickets change; a new film waits for the button, except re-sizing theaters.
$('f').addEventListener('input', e=>{
  if(e.target.id==='film') return;
  labels(read());
  if(read().isNew && !(e.target.id==='teater' && lastFilm===read().film)) return;
  const P = DATA.demo.find(d=>d.film===read().film);
  if(e.target.id==='kota') klList(P, $('kota').value, '');
  if(e.target.id==='kota' || e.target.id==='city') fillCity(P, $('city').value);
  clearTimeout(timer); timer = setTimeout(run, 250);
});
$('f').addEventListener('submit',e=>{e.preventDefault(); run();});


// Manajer: pick a city, then one of its cinema clusters; films are grouped by decision and the counters filter the groups
const pillStyle = k => `color:${k};border-color:color-mix(in srgb, ${k} 40%, transparent);background:color-mix(in srgb, ${k} 12%, transparent)`;
const KLS = {};  // cluster label -> {city, id, n films}
DATA.demo.filter(p=>!p.uji).forEach(p => Object.entries(p.cities).forEach(([kl, c]) => { (KLS[kl] = KLS[kl] || {city:c.city, id:c.id, n:0}).n++; }));
const mcities = [...new Set(Object.values(KLS).map(k=>k.city))].sort(byNum);
const filmsIn = city => Object.values(KLS).filter(k=>k.city===city).reduce((s,k)=>s+k.n,0);
$('mcity').innerHTML = mcities.map(c=>`<option>${c}</option>`).join('');
$('mcity').value = mcities.reduce((a,b)=>filmsIn(b)>filmsIn(a)?b:a);
let mOnly = null;
function mklList(){
  const kls = Object.keys(KLS).filter(k=>KLS[k].city===$('mcity').value).sort((a,b)=>KLS[b].n-KLS[a].n || byNum(a,b));
  $('mkl').innerHTML = kls.map(k=>`<option value="${k}">Klaster ${k.split(' ').pop()} · ${KLS[k].id} (${KLS[k].n} film)</option>`).join('');
}
function manager(){
  const kl = $('mkl').value, kota = $('mcity').value, groups = Object.fromEntries(ORDER.map(c=>[c,[]]));
  DATA.demo.filter(p=>!p.uji && entry(p, kota, kl)).sort((a,b)=>b.d1.localeCompare(a.d1)).forEach(p => {
    const c = entry(p, kota, kl), avg = (c.y[0]+c.y[1]+c.y[2])/3, v = decideCap(c.tab, c.y, capOf(c)), k = col(v.code), mx = Math.max(...c.tab, 1);
    const spark = c.tab.map((t,i)=>`<i style="height:${Math.max(2, t/mx*26)}px;${v.days.includes(i)?`background:${k}`:''}"></i>`).join('');
    groups[v.code].push(`<tr data-film="${p.film}"><td><b>${p.film}</b></td><td>${fmtD(p.d1)}</td><td>${fmtN(avg)}</td>`
      + `<td><span class="spark">${spark}</span></td><td>${fmtN(c.tab.reduce((a,b)=>a+b,0))}</td>`
      + `<td><span class="pill" style="${pillStyle(k)}">${WORD[v.code]}</span></td></tr>`);
  });
  // all four categories always shown, empty ones say so
  $('mrows').innerHTML = ORDER.filter(c=>!mOnly || mOnly===c)
    .map(c=>`<tr class="grp"><td colspan="6" style="color:${col(c)}">${WORD[c]} · ${groups[c].length} film</td></tr>` + (groups[c].length ? groups[c].join('') : '<tr class="none"><td colspan="6">Tidak ada film</td></tr>')).join('');
  $('mcount').innerHTML = ORDER.map(c=>`<button type="button" data-c="${c}" aria-pressed="${!mOnly || mOnly===c}" style="${pillStyle(col(c))}">${groups[c].length} ${WORD[c]}</button>`).join('');
  document.querySelectorAll('#mcount button').forEach(b => b.addEventListener('click', () => { mOnly = mOnly===b.dataset.c ? null : b.dataset.c; manager(); }));
  document.querySelectorAll('#mrows tr[data-film]').forEach(r => r.addEventListener('click', () => openFilm(r.dataset.film, kl, kota)));
}
$('mcity').addEventListener('change', () => { mOnly = null; mklList(); manager(); });
$('mkl').addEventListener('change', () => { mOnly = null; manager(); });
mklList(); manager();


load(DATA.demo.find(d=>d.film==='Pengepungan di Bukit Duri')); run();
