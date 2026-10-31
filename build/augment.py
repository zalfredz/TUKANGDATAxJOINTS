import json, polars as pl
K='kit/ppt_joints_kit/'
d=json.load(open('ana/data.json',encoding='utf-8'))
c=pl.read_csv(K+'cal_final_cohort_multipliers.csv',schema_overrides={'d1':pl.Utf8,'date':pl.Utf8})
L=pl.lit
# same windows as nb_80_modeling.calendar_table(): NYE, pre-Lebaran (D1 11 Mar), Ramadan (D1 11-17 Feb, dates >= 18 Feb)
w=c.filter((pl.col('date')=='2025-12-31') | ((pl.col('d1')=='2026-03-11') & pl.col('date').is_between(L('2026-03-18'),L('2026-03-20'))) | (pl.col('d1').is_between(L('2026-02-11'),L('2026-02-17')) & (pl.col('date')>='2026-02-18')))
d['calm']={f"{r['d1']}|{r['k']}":r['m_resid_p50'] for r in w.iter_rows(named=True)}
p=pl.read_csv(K+'priors_lebaran_citytype_final.csv').with_columns(k=pl.col('dk').str.slice(1).cast(pl.Int32)).sort('k')
d['leb']={name:g.sort('k')['R_p50'].to_list() for (lvl,name),g in p.group_by(['level','name']) if lvl=='type' or name in ('JAKARTA','DENPASAR')}
d['ctype']={r['city_name']:r['lebaran_city_type'] for r in pl.read_csv(K+'priors_mudik_citytype.csv').iter_rows(named=True)}
assert len(d['calm'])==23 and all(len(v)==7 for v in d['leb'].values()) and all(x.upper() in d['ctype'] for x in d['cities'])
json.dump(d,open('ana/data.json','w',encoding='utf-8'),separators=(',',':'))
