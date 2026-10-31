import json, math
d = json.load(open('data.json', encoding='utf-8'))
# Kit 06_FAKTA_ANGKA bagian F (fig17): TabICLv2 test-period forecasts, Klaster Yogyakarta A, D1 Rabu 24 Des 2025. No actuals exist.
UJI = [('Janur Ireng', [1239, 673, 422], [578, 536, 446, 399, 151, 232, 177]),
       ('The SpongeBob Movie', [437, 427, 392], [455, 436, 356, 329, 131, 177, 193]),
       ('Comic 8 Revolution', [330, 362, 198], [246, 232, 209, 187, 65, 51, 39]),
       ('Patah Hati yang Kupilih', [236, 133, 101], [101, 84, 51, 28, 0, 0, 0])]
d['demo'] = [p for p in d['demo'] if not p.get('uji')]
for name, y, tab in UJI:  # test data: the only test-period films with names and TabICLv2 forecasts (kit fig17); no actual sales
    d['demo'].append({'film': name, 'd1': '2025-12-24', 'def': 'Yogyakarta A', 'uji': True, 'fam': -1,
                      'cities': {'Yogyakarta A': {'y': y, 'tab': tab, 'act': None, 'lgb': None, 'city': 'Yogyakarta', 'id': 'data uji',
                                                  'teater': max(1, math.ceil(max(y + tab) / 745))}}})
d.pop('duel', None)
json.dump(d, open('data.json', 'w', encoding='utf-8'), separators=(',', ':'))

t = open('template3.html', encoding='utf-8').read()
html = (t.replace('__ENGINE__', open('engine.js', encoding='utf-8').read())
         .replace('__UI__', open('ui3.js', encoding='utf-8').read())
         .replace('__DATA__', open('data.json', encoding='utf-8').read()))
open('tiga-hari-cukup.html', 'w', encoding='utf-8').write(html)
# standalone copy for local / Render / Netlify: the artifact host adds this skeleton itself, a plain file needs it
head = '<!doctype html>\n<html lang="id">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n'
body = html.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
i = body.index('</style>') + len('</style>')
open('standalone.html', 'w', encoding='utf-8').write(head + body[:i] + '\n</head>\n<body>' + body[i:] + '\n</body>\n</html>\n')
print('demo', len(d['demo']), 'uji', sum(1 for p in d['demo'] if p.get('uji')))
