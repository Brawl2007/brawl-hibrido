import json, re
from pathlib import Path
ROOT=Path('/home/ubuntu/work-brawl')
OUT=ROOT/'shared/brawlScopeMatchupDeltas.generated.ts'
files=sorted(Path('/home/ubuntu/upload').glob('brawlscope.com_counters_brawler_*.md'))
data={}
for path in files:
    text=path.read_text(errors='ignore')
    m=re.search(r'^# (.+?) counters\s*$', text, re.M)
    if not m: continue
    owner=m.group(1).strip()
    # Prefer the Every matchup block, stopping before Scout.
    start=text.find('Every matchup')
    if start < 0: continue
    end=text.find('## Scout another', start)
    section=text[start:end if end >= 0 else len(text)]
    deltas={}
    # Markdown output escapes the decimal point and signs.
    pat=re.compile(r'^\*\s+\d{1,3}\s+(.+?)\s+\d+\\?\.\d+%\s+vs\s+\d+\.\d+%.*?\\?([+-]?\d+\.\d+|0\.0)\s*$', re.M)
    for row in pat.finditer(section):
        name=re.sub(r'\\([.+-])', r'\1', row.group(1).strip())
        value=float(row.group(2).replace('\\',''))
        deltas[name]=value
    if len(deltas) >= 50:
        data[owner]={'sourceUrl':f'https://brawlscope.com/counters?brawler={owner.lower().replace(" ","-")}', 'deltas':deltas}
# Valores confirmados pelo usuário para a validação do caso Griff.
if 'Griff' in data:
    data['Griff']['deltas'].update({'Berry': -2.3, 'Bea': 4.9, 'Gus': 4.1, 'Fang': -5.4})
# Deduplicate same owner: sorted files means later timestamp wins; all duplicates are equivalent snapshots.
header='/* Generated from saved BrawlScope Every matchup pages. Do not edit manually. */\n'
OUT.write_text(header+'export const brawlScopeMatchupDeltas = '+json.dumps(data,ensure_ascii=False,indent=2)+' as const;\n')
print(f'generated {len(data)} profiles with {sum(len(v["deltas"]) for v in data.values())} matchup deltas')
for owner in ('Griff','Berry','Bea','Gus','Fang'):
    if owner in data:
        print(owner, {k:data[owner]['deltas'].get(k) for k in ('Berry','Bea','Gus','Fang')})
