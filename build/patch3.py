import json
# Indonesian title case: lowercase small words after the first
d = json.load(open('data.json', encoding='utf-8'))
SMALL = {'di', 'dari', 'dengan', 'yang', 'dan', 'ke', 'untuk', 'dalam', 'pada'}
def fix(t):
    w = t.split(' ')
    return ' '.join([w[0]] + [x.lower() if x.lower() in SMALL else x for x in w[1:]])
SHORT = {'Andai Ibu Tidak Menikah dengan Ayah': 'Andai Ibu', 'The Conjuring: Last Rites (IMAX 2D)': 'The Conjuring (IMAX)',
         'The Fantastic Four: First Steps': 'Fantastic Four', 'Mama: Pesan dari Neraka': 'Mama'}
def short(t):
    t = SHORT.get(t, t)
    return t.split(':')[0] if ':' in t else t  # drop subtitles: "Jurassic World: Rebirth" -> "Jurassic World"
for p in d['demo']:
    p['film'] = short(fix(p['film']))
assert len({p['film'] for p in d['demo']}) == len(d['demo'])
import math
for p in d['demo']:
    for c in p['cities'].values():  # default theaters must hold the real demand, so no day starts out "penuh"
        c['teater'] = max(c['teater'], math.ceil(max(c['y'] + c['tab'] + c['act']) / 745))
d['demo'].sort(key=lambda p: p['film'].lower())
json.dump(d, open('data.json', 'w', encoding='utf-8'), separators=(',', ':'))
print([p['film'] for p in d['demo']])

e = open('engine.js', encoding='utf-8').read()
if 'function shiftDate' not in e:
    e += open('engine_add.js', encoding='utf-8').read()
    open('engine.js', 'w', encoding='utf-8').write(e)

t = open('template2.html', encoding='utf-8').read()
a = t.index("const WORD = "); b = t.index("</script>")
t = t[:a] + open('ui.js', encoding='utf-8').read() + t[b:]
if '.occ{' not in t:
    t = t.replace(".dd b{display:block;color:var(--fg);font-weight:600}",
                  ".dd b{display:block;color:var(--fg);font-weight:600}\n.occ{font-size:11px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}\n.occ.full{color:var(--tambah)}")
open('template2.html', 'w', encoding='utf-8').write(t)
open('tiga-hari-cukup.html', 'w', encoding='utf-8').write(t.replace('__ENGINE__', e).replace('__DATA__', open('data.json', encoding='utf-8').read()))
