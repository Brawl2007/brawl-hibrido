import html
import json
import re
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path('/home/ubuntu/work-brawl')
CATALOG = ROOT / 'shared/brawlerCatalog.ts'
OUT = ROOT / 'shared/brawlScopeMatchupDeltas.generated.ts'

text = CATALOG.read_text()
names = re.findall(r'\bname:\s*["\']([^"\']+)["\']', text)
# Preserve catalog order and remove accidental duplicates.
names = list(dict.fromkeys(names))

def key(name):
    return re.sub(r'[^a-z0-9]+', '', name.lower())

def fetch_page(name):
    url = 'https://brawlscope.com/counters?brawler=' + key(name)
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urlopen(req, timeout=30) as response:
        raw = response.read().decode('utf-8', 'replace')
    # Text is embedded in SSR HTML; normalize tags/entities for robust extraction.
    clean = html.unescape(re.sub(r'<[^>]+>', ' ', raw))
    clean = re.sub(r'\\u002B', '+', clean)
    clean = re.sub(r'\\u002D', '-', clean)
    clean = re.sub(r'\\u0026', '&', clean)
    clean = re.sub(r'\\s+', ' ', clean)
    # The page prints the complete ordered list as: number, name, ... delta.
    marker = clean.find('Every matchup')
    if marker < 0:
        marker = clean.find('Every match')
    section = clean[marker:] if marker >= 0 else clean
    section = section[:section.find('Drafts well with')] if 'Drafts well with' in section else section
    result = {}
    pattern = re.compile(r'(?:^|\s)(\d{1,3})\s+([A-Za-z0-9& .\'\-]+?)\s+(?:[A-Za-z -]+?)\s+([+-]\d+\.\d|0\.0)\s+(?:\d+\.\d%|\?)')
    for match in pattern.finditer(section):
        opponent = re.sub(r'\s+', ' ', match.group(2)).strip()
        value = float(match.group(3))
        if opponent and opponent.lower() not in {'every matchup'}:
            result[opponent] = value
    return url, result

all_data = {}
failures = []
for index, name in enumerate(names, 1):
    try:
        url, values = fetch_page(name)
        if len(values) < 50:
            raise RuntimeError(f'only parsed {len(values)} matchups')
        all_data[name] = {'sourceUrl': url, 'deltas': values}
        print(f'[{index}/{len(names)}] {name}: {len(values)}')
    except Exception as exc:
        failures.append({'name': name, 'error': str(exc)})
        print(f'[{index}/{len(names)}] FAILED {name}: {exc}')
    time.sleep(0.05)

if failures:
    raise SystemExit(json.dumps({'failures': failures}, ensure_ascii=False))

payload = json.dumps(all_data, ensure_ascii=False, indent=2)
OUT.write_text('/* Generated from BrawlScope Every matchup pages. Do not edit manually. */\nexport const brawlScopeMatchupDeltas = ' + payload + ' as const;\n')
print(f'Wrote {OUT} with {len(all_data)} brawlers')
