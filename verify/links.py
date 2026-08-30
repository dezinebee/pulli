import re, glob, os
from collections import defaultdict
import os; ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')+'/'
pages={os.path.basename(f):open(f).read() for f in sorted(glob.glob(ROOT+'*.html'))}
ids={p:set(re.findall(r'id="([\w-]+)"',c)) for p,c in pages.items()}
assets={os.path.basename(f) for f in glob.glob(ROOT+'assets/*')}

print("=== 1. LINK INTEGRITY ===")
total=0; broken=[]
for p,c in pages.items():
    for href in re.findall(r'href="([^"]+)"',c):
        if href.startswith(('http','mailto:','#')) or href=='': 
            if href.startswith('#'):
                total+=1
                if href[1:] not in ids[p]: broken.append((p,href,'local anchor missing'))
            continue
        total+=1
        f,_,a=href.partition('#')
        if f.startswith('assets/'):
            if os.path.basename(f) not in assets: broken.append((p,href,'asset missing'))
            continue
        if f not in pages: broken.append((p,href,'page missing')); continue
        if a and a not in ids[f]: broken.append((p,href,'anchor missing'))
print(f"   {total} internal links across {len(pages)} pages — {len(broken)} broken")
for b in broken[:15]: print(f"     {b[0]} -> {b[1]}  ({b[2]})")

print("\n=== 2. ASSET REFERENCES ===")
refs=set()
for c in pages.values():
    refs |= {os.path.basename(x) for x in re.findall(r'(?:href|src)="(assets/[^"]+)"',c)}
print(f"   assets on disk: {len(assets)}  referenced: {len(refs)}")
orphan=assets-refs
print(f"   never referenced: {sorted(orphan) if orphan else 'none'}")
missing=refs-assets
print(f"   referenced but absent: {sorted(missing) if missing else 'none'}")

print("\n=== 3. NAV CONSISTENCY — every page must carry the identical sidebar ===")
navs={}
for p,c in pages.items():
    m=re.search(r'<nav class="sidebar".*?</nav>',c,re.S)
    if not m: navs[p]=None; continue
    items=re.findall(r'<li><a href="([^"]+)"[^>]*>([^<]+)</a>',m.group())
    navs[p]=[i for i in items if not i[0].startswith('#')]
ref=navs['index.html']
print(f"   reference nav (index.html): {len(ref)} entries")
for p,n in navs.items():
    if n is None: print(f"     {p}: NO SIDEBAR"); continue
    if n!=ref:
        missing=[x for x in ref if x not in n]; extra=[x for x in n if x not in ref]
        print(f"     {p}: differs — {len(missing)} missing, {len(extra)} extra")
        for x in (missing+extra)[:3]: print(f"        {x}")
else: pass
same=sum(1 for n in navs.values() if n==ref)
print(f"   pages with an identical sidebar: {same}/{len(pages)}")

print("\n=== 4. aria-current — exactly one per page, pointing at itself ===")
for p,c in pages.items():
    cur=re.findall(r'href="([^"]+)"[^>]*aria-current="page"',c)
    if len(cur)!=1: print(f"     {p}: {len(cur)} aria-current (want 1) {cur}")
    elif cur[0]!=p: print(f"     {p}: aria-current points at {cur[0]}")
print("   checked")

print("\n=== 5. INBOUND LINKS — is any page unreachable except via the nav? ===")
inbound=defaultdict(set)
for p,c in pages.items():
    body=re.sub(r'<nav class="sidebar".*?</nav>','',c,flags=re.S)
    for href in re.findall(r'href="([^"#]+)',body):
        if href in pages and href!=p: inbound[href].add(p)
for p in sorted(pages):
    n=len(inbound[p])
    if n==0: print(f"     {p}: 0 inbound body links (nav-only)")
print(f"   pages with body inbound links: {sum(1 for p in pages if inbound[p])}/{len(pages)}")

print("\n=== 6. TITLE / META / LANG ===")
for p,c in sorted(pages.items()):
    t=re.search(r'<title>([^<]*)</title>',c); d=re.search(r'name="description" content="([^"]*)"',c)
    issues=[]
    if not t: issues.append('no <title>')
    if not d: issues.append('no meta description')
    if 'lang="en"' not in c: issues.append('no lang')
    if '<h1' not in c: issues.append('no h1')
    elif len(re.findall(r'<h1',c))>1: issues.append(f'{len(re.findall(r"<h1",c))} h1s')
    if issues: print(f"     {p}: {', '.join(issues)}")
print("   checked")

print("\n=== 7. HEADING ORDER (no skipped levels) ===")
for p,c in sorted(pages.items()):
    body=re.sub(r'<nav class="sidebar".*?</nav>','',c,flags=re.S)
    lv=[int(m) for m in re.findall(r'<h([1-6])',body)]
    bad=[(lv[i-1],lv[i]) for i in range(1,len(lv)) if lv[i]-lv[i-1]>1]
    if bad: print(f"     {p}: skips {bad[:4]}")
print("   checked")
