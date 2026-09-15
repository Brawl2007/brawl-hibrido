from urllib.request import Request, urlopen
for url in ['https://brawlscope.com/counters?brawler=griff','https://brawlscope.com/counters/griff']:
    for ua in ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36','Googlebot/2.1 (+http://www.google.com/bot.html)']:
        try:
            req = Request(url, headers={'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://brawlscope.com/'})
            with urlopen(req, timeout=20) as r:
                data = r.read()
            print(url, ua[:12], r.status, len(data), data[:80])
        except Exception as e:
            print(url, ua[:12], type(e).__name__, e)
