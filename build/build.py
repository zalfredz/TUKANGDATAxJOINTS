import polars as pl, numpy as np, json, sys, datetime as dt
sys.stdout.reconfigure(encoding='utf-8')
K='kit/ppt_joints_kit/'
cal=pl.read_csv(K+'calendar_features.csv',try_parse_dates=True)
# day weight from fig07: weekend 1.33, nonworking weekday 1.26, Friday 0.98, Mon-Thu school holiday 0.91, Mon-Thu 0.74
def wrow(r):
    if r['is_weekend']: return 1.33
    if r['is_nonworking']: return 1.26
    if r['dow']==4: return 0.98
    return 0.91 if r['sch_nat'] else 0.74
W={r['date']:wrow(r) for r in cal.iter_rows(named=True)}
def w(d):
    if d in W: return W[d]
    return 1.33 if d.weekday()>=5 else (0.98 if d.weekday()==4 else 0.74)
d=pl.read_parquet(K+'_sumber_kode/_aset/oof_merged.parquet').sort('film','cluster','k')
eps=[]
for (f,c),g in d.group_by(['film','cluster'],maintain_order=True):
    if g.height!=7: continue
    r0=g.row(0,named=True); d1=r0['d1_date'].date()
    wd=[w(d1+dt.timedelta(i)) for i in range(10)]; w13=sum(wd[:3])/3
    y=[r0['y1'],r0['y2'],r0['y3']]
    R=g['R'].to_list()
    decay=[R[i]/(wd[3+i]/w13) for i in range(7)]
    eps.append(dict(f=f,c=c,city=r0['city'],d1=d1,y=y,wd=wd,R=R,p15=g['p15'].to_list(),p00=g['p00'].to_list(),scale=r0['scale'],decay=decay,sh=[r0['sh1'],r0['sh2'],r0['sh3']]))
print('episodes',len(eps))
def feat(y,wd):
    a=[(y[i]+1)/wd[i] for i in range(3)]
    return [np.log(a[1]/a[0]), np.log(a[2]/a[0]), 0.25*np.log1p(np.mean(y))]
X=np.array([feat(e['y'],e['wd']) for e in eps]); D=np.array([e['decay'] for e in eps]); fam=np.array([e['f'].split(' (')[0] for e in eps])
JAB={'JAKARTA','BOGOR','DEPOK','TANGERANG','BEKASI'}
def predict(i,k):
    m=fam!=fam[i]
    dist=((X[m]-X[i])**2).sum(1); idx=np.argsort(dist)[:k]
    dec=np.median(D[m][idx],axis=0)
    e=eps[i]; w13=sum(e['wd'][:3])/3
    return np.maximum(dec*np.array(e['wd'][3:])/w13,0)
for k in (30,50,100):
    err=[np.abs(predict(i,k)-np.array(eps[i]['R'])).mean() for i in range(len(eps))]
    print('k',k,'MASE knn',round(float(np.mean(err)),4))
print('E15',np.mean([np.abs(np.array(e['p15'])-e['R']).mean() for e in eps]),'LGB',np.mean([np.abs(np.array(e['p00'])-e['R']).mean() for e in eps]),'naive',np.mean([np.abs(1-np.array(e['R'])).mean() for e in eps]))

def verdict(Rh,scale,wd=None):
    """Kit rule order (slide 26). Rh = R for D4..D10, wd = day weights D1..D10 (to know weekend/holiday)."""
    t=np.round(np.maximum(Rh,0)*scale,1)  # same as the page: tickets stored to 0.1, zero = below half a ticket
    if t[-1]<0.5:
        j=6
        while j>0 and t[j-1]<0.5: j-=1
        return 'TURUNKAN'
    if wd is not None:
        for i in range(7):
            if wd[3+i]==1.33 and Rh[i]>=1.0: return 'TAMBAH'
        for i in range(1,7):
            if wd[3+i]==1.26 and Rh[i]>=1.2*Rh[i-1]: return 'TAMBAH'
    if np.mean(Rh[4:])>=0.5: return 'PERTAHANKAN'
    return 'KURANGI'
if __name__=='__main__' and len(sys.argv)>1:
    for pat in sys.argv[1:]:
        rows=[]
        for e in eps:
            if not e['f'].startswith(pat): continue
            R=np.array(e['R']); P=np.array(e['p15']); L=np.array(e['p00'])
            rows.append((e['city'],e['c'][:6],round(e['scale']),round(float(np.abs(P-R).mean()),3),round(float(np.abs(L-R).mean()),3),verdict(R,e['scale'],e['wd']),verdict(P,e['scale'],e['wd']),round(float(R.mean()),2),[int(v) for v in e['y']],[int(s) for s in e['sh']]))
        rows=[r for r in rows if r[5]==r[6]]
        rows.sort(key=lambda r:(r[0] not in ('JAKARTA','YOGYAKARTA','SURABAYA','BANDUNG','SEMARANG','MEDAN','MAKASSAR'),r[3]-r[4]))
        print('\n##',pat,len(rows)); [print(r) for r in rows[:8]]

if __name__=='__main__' and len(sys.argv)==1:
    fams=sorted(set(fam)); fi={f:i for i,f in enumerate(fams)}
    lib=[[round(float(v),3) for v in X[i]]+[round(float(v),3) for v in D[i]]+[fi[fam[i]]] for i in range(len(eps))]
    calj={r['date'].isoformat():[round(W[r['date']],2),(r['holiday_name'] or r['cb_name'] or '')] for r in cal.iter_rows(named=True)}
    picks=[('PENGEPUNGAN DI BUKIT DURI','19f506','Pengepungan di Bukit Duri','TAMBAH'),
           ('JURASSIC WORLD: REBIRTH','14b63f','Jurassic World: Rebirth','TAMBAH'),
           ('THE ACCOUNTANT 2','b704e8','The Accountant 2','TAMBAH'),
           ('BELIEVE - TAKDIR, MIMPI, KEBERANIAN','a616a5','Believe: Takdir, Mimpi, Keberanian','PERTAHANKAN'),
           ('THE CONJURING: LAST RITES (IMAX 2D)','8dbfb7','The Conjuring: Last Rites (IMAX 2D)','KURANGI'),
           ('DEMON SLAYER -KIMETSU NO YAIBA- THE MOVIE: INFINITY CASTLE','019158','Demon Slayer: Infinity Castle','KURANGI'),
           ('F1 THE MOVIE','124078','F1 The Movie','KURANGI'),
           ('SUKMA','6b88b1','Sukma','KURANGI'),
           ('MANGKU POCONG','c4a19c','Mangku Pocong','TURUNKAN'),
           ('M3GAN 2.0','e67d81','M3GAN 2.0','TURUNKAN'),
           ('JODOH 3 BUJANG','015555','Jodoh 3 Bujang','TURUNKAN'),
           ('THE BAD GUYS 2','14b63f','The Bad Guys 2','TURUNKAN')]
    demo=[]
    for f,c,name,v in picks:
        cand=[e for e in eps if e['f']==f and e['c'].startswith(c) and verdict(np.array(e['p15']),e['scale'],e['wd'])==verdict(np.array(e['R']),e['scale'],e['wd'])==v]
        e=min(cand,key=lambda e:abs(np.array(e['p15'])-e['R']).mean())  # Surabaya has 2 clusters with same prefix? pick best
        demo.append(dict(film=name,city=e['city'].title(),d1=e['d1'].isoformat(),y=[int(v) for v in e['y']],teater=max(1,round(max(e['sh'])/5)),
            scale=e['scale'],act=[round(r*e['scale']) for r in e['R']],tab=[round(max(p,0)*e['scale'],1) for p in e['p15']],lgb=[round(max(p,0)*e['scale'],1) for p in e['p00']],fam=fi[e['f'].split(' (')[0]],
            mase=[round(float(np.abs(np.array(e['p15'])-e['R']).mean()),3),round(float(np.abs(np.array(e['p00'])-e['R']).mean()),3)]))
        print(name,v,'LGB',verdict(np.array(e['p00']),e['scale'],e['wd']),e['c'][:6],e['city'],demo[-1]['y'],demo[-1]['act'],demo[-1]['tab'],demo[-1]['mase'],demo[-1]['teater'])
    demo.sort(key=lambda p:p['film'].lower())
    cities=sorted({e['city'].title() for e in eps})
    json.dump(dict(lib=lib,cal=calj,demo=demo,cities=cities,films=[f.title() for f in fams]),open('ana/data.json','w'),separators=(',',':'))
    import os; print('bytes',os.path.getsize('ana/data.json'))
