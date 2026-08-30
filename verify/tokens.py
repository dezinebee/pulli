import re, glob, os, collections
import os; ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')+'/'
CSS = {os.path.basename(f): open(f).read() for f in glob.glob(ROOT+'assets/*.css')}
HTML = {os.path.basename(f): open(f).read() for f in glob.glob(ROOT+'*.html')}
JS  = {os.path.basename(f): open(f).read() for f in glob.glob(ROOT+'assets/*.js')}

# --- 1. every var() consumed is defined somewhere -------------------------
defined = set()
for c in CSS.values():
    defined |= set(re.findall(r'(--[\w-]+)\s*:', c))
for h in HTML.values():
    defined |= set(re.findall(r'(--[\w-]+)\s*:', h))
used = collections.defaultdict(set)
for name, c in list(CSS.items()) + list(HTML.items()):
    for v in re.findall(r'var\((--[\w-]+)', c):
        used[v].add(name)
undef = {k:v for k,v in used.items() if k not in defined}
print(f"1. TOKEN RESOLUTION — {len(defined)} defined, {len(used)} consumed")
if undef:
    for k,v in sorted(undef.items()): print(f"   UNDEFINED {k}  used in {', '.join(sorted(v))}")
else: print("   every var() resolves")

# --- 2. layer discipline: palette must not be referenced outside primitives -
tok = CSS['tokens.css']
palette = set(re.findall(r'(--(?:maa|mann|kavi|ilai|manjal|neelam|kumkumam)[\w-]*)\s*:', tok))
print(f"\n2. LAYER DISCIPLINE — {len(palette)} palette tokens")
leaks = []
# The rule is not "which file" but "which position". A theme fork legitimately
# maps the palette into semantic roles — that is what :root in tokens.css does,
# and what every showcase fork does. What is forbidden is a PROPERTY being set
# from the palette, which skips the semantic layer entirely.
#   allowed:   --color-on-accent: var(--maa-50);      (defining a role)
#   forbidden: color: var(--maa-50);                  (using the palette直接)
PROP = re.compile(r'(^|[;{}\n])\s*(?!--)([a-z-]+)\s*:[^;{}]*var\((--(?:maa|mann|kavi|ilai|manjal|neelam|kumkumam)[\w-]*)\)')
# Two narrow, declared exceptions, both on the documentation itself:
#   * a .swatch element IS the rendering of a palette rung — that is its job;
#   * code samples inside <pre>/<code> quote the forbidden pattern to show it.
def strip_exempt(s):
    s = re.sub(r'<[^>]*class="[^"]*swatch[^"]*"[^>]*>', '', s)
    s = re.sub(r'<(pre|code)\b.*?</\1>', '', s, flags=re.S)
    return s
for name, c2 in list(CSS.items()) + list(HTML.items()):
    if name == 'tokens.css': continue
    for m in PROP.finditer(strip_exempt(c2)):
        leaks.append((name, f"{m.group(2)}: var({m.group(3)})"))
print(f"   palette used to set a PROPERTY (skipping the semantic layer): {len(leaks)}")
for n,p in leaks[:10]: print(f"     LEAK {p} in {n}")

# primitives referenced by product code is allowed for geometry, but SEMANTIC
# colour roles must be the only colour surface. Find raw hex outside tokens.css:
raw = []
for name, c in CSS.items():
    if name in ('tokens.css','print.css'): continue
    for m in re.finditer(r'#[0-9A-Fa-f]{3,8}\b', c):
        line = c[:m.start()].count('\n')+1
        raw.append((name, line, m.group()))
print(f"   raw hex colours outside tokens.css/print.css: {len(raw)}")
for n,l,v in raw[:10]: print(f"     {n}:{l} {v}")

# --- 3. orphan tokens: defined but never consumed --------------------------
orphans = sorted(t for t in defined if t not in used and not t.startswith('--pg-'))
print(f"\n3. ORPHAN TOKENS — {len(orphans)} defined but never consumed")
for o in orphans[:20]: print(f"     {o}")

# --- 4. density derivation --------------------------------------------------
print("\n4. DENSITY")
for m in re.finditer(r'\[data-density="(\w+)"\]\s*\{([^}]*)\}', tok):
    print(f"   {m.group(1):12} {m.group(2).strip()}")
base = re.search(r':root\s*\{[^}]*?--p:\s*([\d.]+)px', tok)
print(f"   default --p: {base.group(1) if base else '??'}px")
# type must NOT scale with pitch
type_tokens = re.findall(r'(--ezhuthu-[\w-]+)\s*:\s*([^;]+);', tok)
scaling = [(k,v) for k,v in type_tokens if 'var(--p)' in v]
print(f"   type tokens that scale with --p: {len(scaling)} (want 0 — type is independent of pitch)")
for k,v in scaling: print(f"     VIOLATION {k}: {v.strip()}")

# --- 5. accessibility floors ------------------------------------------------
print("\n5. TARGET-SIZE FLOORS")
for m in re.finditer(r'(--alavu-[\w-]+)\s*:\s*([^;]+);', tok):
    name, val = m.group(1), m.group(2).strip()
    has_floor = 'max(' in val
    print(f"   {name:14} {val:52} {'floored' if has_floor else 'NO FLOOR'}")
    if not has_floor and 'sm' not in name:
        pass
# compute actual px at each density
print("   computed heights:")
for p in (6,8,10):
    for m in re.finditer(r'(--alavu-[\w-]+)\s*:\s*max\(calc\(var\(--p\)\s*\*\s*([\d.]+)\),\s*(\d+)px\)', tok):
        n, mult, floor = m.group(1), float(m.group(2)), int(m.group(3))
        print(f"     P={p:2}  {n:14} = max({p*mult:.0f}, {floor}) = {max(p*mult, floor):.0f}px  {'OK' if max(p*mult,floor)>=44 else 'BELOW 44px'}")
    break
