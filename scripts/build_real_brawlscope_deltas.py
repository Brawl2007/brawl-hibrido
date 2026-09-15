import html, json, re, time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT=Path('/home/ubuntu/work-brawl')
CATALOG=ROOT/'shared/brawlerCatalog.ts'
OUT=ROOT/'shared/brawlScopeMatchupDeltas.generated.ts'
text=CATALOG.read_text()
# Catalog uses slug/id/name fields; prefer slug-like key from brawlScope data.
source=(ROOT/'shared/brawlScopeCounterData.ts').read_text()
slugs=re.findall(r'^  "([^"]+)": \{', source, re.M)

def key(s): return re.sub(r'[^a-z0-9]+','',s.lower())

def parse_page(slug):
    url=f'https://brawlscope.com/counters?brawler={slug}'
    req=Request(url,headers={'User-Agent':'Mozilla/5.0'})
    raw=urlopen(req,timeout=30).read().decode('utf-8','replace')
    clean=html.unescape(re.sub(r'<[^>]+>','\n',raw))
    clean=clean.replace('\\u002B','+').replace('\\u002D','-').replace('\\u0026','&')
    # HTML SSR has escaped markdown in some responses.
    clean=clean.replace('\\.','.')
    marker=clean.find('Every matchup')
    if marker<0: raise RuntimeError('Every matchup missing')
    section=clean[marker:]
    end=section.find('## Scout another')
    if end>=0: section=section[:end]
    result={}
    # Works with markdown list and rendered text: * 1 Name 46.7% vs ... +1.2
    pat=re.compile(r'^\s*\*?\s*\d{1,3}\s+(.+?)\s+\d+\.\d%\s+vs\s+\d+\.\d%.*?\s([+-]\d+\.\d|0\.0)\s*$',re.M)
    for m in pat.finditer(section):
        name=re.sub(r'\s+',' ',m.group(1)).strip()
        result[name]=float(m.group(2))
    if len(result)<50: raise RuntimeError(f'parsed only {len(result)}')
    # Find canonical heading name.
    heading=re.search(r'#\s+(.+?)\s+counters',clean)
    owner=heading.group(1).strip() if heading else slug
    return owner,url,result

all_data={}; failures=[]
for i,slug in enumerate(slugs,1):
    try:
        owner,url,deltas=parse_page(slug)
        all_data[owner]={'sourceUrl':url,'deltas':deltas}
        print(f'[{i}/{len(slugs)}] {owner}: {len(deltas)}')
    except Exception as e:
        failures.append({'slug':slug,'error':str(e)}); print(f'[{i}/{len(slugs)}] FAILED {slug}: {e}')
    time.sleep(.05)
if failures:
    print(json.dumps({'failures':failures},ensure_ascii=False))
    raise SystemExit(1)
OUT.write_text('/* Generated from BrawlScope Every matchup pages. Do not edit manually. */\nexport const brawlScopeMatchupDeltas = '+json.dumps(all_data,ensure_ascii=False,indent=2)+' as const;\n')
print('Wrote',OUT,'with',len(all_data),'brawlers')
