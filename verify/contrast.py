import re, css as C
import os; ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')+'/'
def lum(h):
    h=h.lstrip('#')
    if len(h)==3: h=''.join(c*2 for c in h)
    r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return .2126*f(r)+.7152*f(g)+.0722*f(b)
def ratio(a,b):
    l1,l2=sorted([lum(a),lum(b)],reverse=True); return (l1+.05)/(l2+.05)

R_tok = C.parse(open(ROOT+'assets/tokens.css').read())
R_ent = C.parse(open(ROOT+'assets/enterprise.css').read())
R_pr  = C.parse(open(ROOT+'assets/print.css').read())

no_media = lambda m: len(m)==0
dark_media = lambda m: any('prefers-color-scheme' in x and 'dark' in x for x in m)

LIGHT = C.theme_vars(R_tok, {':root'}, no_media)
DARK  = dict(LIGHT)
DARK.update(C.theme_vars(R_tok, {':root:not([data-theme="light"])'}, dark_media))
DARK_EXPL = dict(LIGHT); DARK_EXPL.update(C.theme_vars(R_tok, {':root[data-theme="dark"]'}, no_media))
HC_D  = dict(DARK_EXPL); HC_D.update(C.theme_vars(R_ent, {'[data-contrast="high"]',':root[data-contrast="high"]'}, lambda m: True))
HC_L  = dict(LIGHT);     HC_L.update(C.theme_vars(R_ent, {'[data-contrast="high"]',':root[data-contrast="high"]'}, lambda m: True))
PRINT = dict(LIGHT);     PRINT.update(C.theme_vars(R_pr, {':root'}, lambda m: True))

THEMES={'light':LIGHT,'dark (media)':DARK,'dark (attr)':DARK_EXPL,'high-contrast':HC_D,'print':PRINT}
def res(v,name,d=0):
    if d>12: return None
    x=v.get(name)
    if x is None: return None
    x=x.strip()
    if x.startswith('#'): return x
    m=re.match(r'var\((--[\w-]+)\)',x)
    if m: return res(v,m.group(1),d+1)
    return None

TEXT=[('--color-text','--color-bg'),('--color-text','--color-surface'),
      ('--color-text-secondary','--color-bg'),('--color-text-secondary','--color-surface'),
      ('--color-text-tertiary','--color-bg'),('--color-text-tertiary','--color-surface'),
      ('--color-accent','--color-bg'),('--color-accent','--color-surface'),
      ('--color-accent','--color-accent-subtle'),('--color-on-accent','--color-accent'),
      ('--color-success','--color-bg'),('--color-warning','--color-bg'),
      ('--color-danger','--color-bg'),('--color-info','--color-bg'),
      ('--color-text','--color-surface-sunken'),('--color-text-secondary','--color-surface-sunken'),
      ('--color-text-tertiary','--color-surface-sunken')]
NONTEXT=[('--color-border-strong','--color-bg'),('--color-border-strong','--color-surface'),
         ('--color-border-strong','--color-surface-sunken'),
         ('--color-focus','--color-bg'),('--color-focus','--color-surface'),
         ('--color-accent','--color-surface-sunken')]
DECOR=[('--color-border','--color-bg'),('--color-border','--color-surface')]

hdr=' '*50 + ''.join(t[:13].ljust(14) for t in THEMES)
print(hdr); fails=[]
for pairs,req,label in ((TEXT,4.5,'TEXT — need 4.5'),(NONTEXT,3.0,'NON-TEXT / UI — need 3.0'),(DECOR,None,'DECORATIVE — exempt from 1.4.11')):
    print(f"\n── {label} " + "─"*(96-len(label)))
    for fg,bg in pairs:
        row=f"{fg.replace('--color-','')+' / '+bg.replace('--color-',''):50}"
        for tn,v in THEMES.items():
            a,b=res(v,fg),res(v,bg)
            if not a or not b: row+=f"{'—':>12}  "; continue
            r=ratio(a,b); flag=' ' if (req is None or r>=req) else '!'
            row+=f"{r:11.2f}{flag}  "
            if req and r<req: fails.append((tn,fg,bg,r,req,a,b))
        print(row)
print("\n"+"═"*110)
print(f"WCAG FAILURES: {len(fails)}")
for tn,f,b,r,req,a,bb in fails: print(f"  {tn:14} {f} on {b}  {r:.2f} < {req}   ({a} on {bb})")
