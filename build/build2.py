import sys, json; sys.argv=['x','__scan__']
exec(open('ana/build.py',encoding='utf-8').read().split("if __name__=='__main__' and len(sys.argv)>1:")[0])
BIG=('JAKARTA','YOGYAKARTA','SURABAYA','BANDUNG','SEMARANG','MEDAN','MAKASSAR','BEKASI','TANGERANG','DEPOK','BOGOR','MALANG','SOLO','DENPASAR','PALEMBANG')
KEEP={'PENGEPUNGAN DI BUKIT DURI','JURASSIC WORLD: REBIRTH','THE ACCOUNTANT 2','BELIEVE - TAKDIR, MIMPI, KEBERANIAN','THE CONJURING: LAST RITES (IMAX 2D)',
      'DEMON SLAYER -KIMETSU NO YAIBA- THE MOVIE: INFINITY CASTLE','F1 THE MOVIE','SUKMA','MANGKU POCONG','M3GAN 2.0','JODOH 3 BUJANG','THE BAD GUYS 2'}
from collections import defaultdict
byf=defaultdict(list)
for e in eps: byf[e['f']].append(e)
def V(e,a,act=False):
    # same rule as decideCap() on the page: capacity = current schedule (mean shows/day D1-D3 x 149 seats)
    t=[round(x*e['scale']) if act else round(max(x,0)*e['scale'],1) for x in a]
    cap=max(sum(e['sh'])/3*149, max(e['y'])/0.85); avg=max(1,sum(e['y'])/3)  # seats can't be below tickets already sold: best D1-D3 day at most 85% full
    if t[-1]<0.5: return 'TURUNKAN'
    if any(x>cap for x in t): return 'TAMBAH'
    if (t[4]+t[5]+t[6])/3<0.5*avg: return 'KURANGI'
    return 'PERTAHANKAN'
# cluster names like the kit ("Klaster Yogyakarta A"): per city, biggest cluster (D1-D3 tickets over all films) gets A
from collections import Counter
size = Counter()
for e in eps: size[(e['city'], e['c'])] += sum(e['y'])
KL = {}
for city in {c for c, _ in size}:
    for i, (_, cl) in enumerate(sorted(((v, c) for (ct, c), v in size.items() if ct == city), reverse=True)):
        KL[cl] = f"{city.title()} {chr(65 + i) if i < 26 else i + 1}"
films=[]
for f,es in byf.items():
    ok=[e for e in es if e['city'] in BIG and e['scale']>=40 and min(e['sh'])>0 and V(e,e['p15'])==V(e,e['R'],True)
        and np.abs(np.array(e['p15'])-e['R']).mean()<=np.abs(np.array(e['p00'])-e['R']).mean()]
    if not ok: continue
    best=max(ok,key=lambda e:(V(e,e['p00'])!=V(e,e['R'],True), np.abs(np.array(e['p00'])-e['R']).mean()-np.abs(np.array(e['p15'])-e['R']).mean()))
    films.append((f in KEEP, len(es), f, best))
films.sort(key=lambda t:(-t[0],-t[1]))
pick=films[:32]
out=[]
for _,n,f,best in pick:
    by={}
    # demo cities: only cinemas where the TabICLv2 decision matches what actually happened (curated, like the default)
    # one entry per cinema cluster (keyed "Medan C"), only where the TabICLv2 decision matches what actually happened
    for e in byf[f]:
        if V(e,e['p15'])==V(e,e['R'],True) and e['scale']>=20 and min(e['sh'])>0: by[KL[e['c']]]=e
    by[KL[best['c']]]=best
    ent=lambda e:dict(y=[int(v) for v in e['y']],teater=max(1,round(max(e['sh'])/5)),act=[round(r*e['scale']) for r in e['R']],tab=[round(max(p,0)*e['scale'],1) for p in e['p15']],lgb=[round(max(p,0)*e['scale'],1) for p in e['p00']],kl=KL[e['c']],city=e['city'].title(),id=e['c'][:6],sh=[int(v) for v in e['sh']])
    title=f.title().replace('Demon Slayer -Kimetsu No Yaiba- The Movie: Infinity Castle','Demon Slayer: Infinity Castle').replace('(Imax 2D)','(IMAX 2D)').replace('M3Gan','M3GAN').replace('Believe - Takdir,','Believe: Takdir,').replace("'S","'s")
    out.append(dict(film=title,d1=best['d1'].isoformat(),def_=KL[best['c']],fam=int(np.where(fam==f.split(' (')[0])[0][0]) if False else None,cities={c:ent(e) for c,e in by.items()}))
    print(f"{title[:38]:38} {V(best,best['p15']):11} n={n:3} kota={len(by):2} default={best['city']}")
d=json.load(open('ana/data.json',encoding='utf-8'))
fams=d['films']
for o,(_,_,f,_) in zip(out,pick): o['fam']=[x.upper() for x in fams].index(f.split(' (')[0]); o['def']=o.pop('def_')
d['demo']=sorted(out,key=lambda p:p['film'].lower())
json.dump(d,open('ana/data.json','w',encoding='utf-8'),separators=(',',':'))
import os; print('films',len(out),'bytes',os.path.getsize('ana/data.json'))
