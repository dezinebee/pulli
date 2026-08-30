"""Pulli verification harness — every published claim, checked."""
import subprocess, sys, os, json, re
HERE=os.path.dirname(os.path.abspath(__file__))
ROOT=os.path.join(HERE,'..')+'/'
sys.path.insert(0,HERE); import css as C

fails=0
def run(name, cmd):
    global fails
    r=subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
    out=r.stdout+r.stderr
    bad = re.findall(r'FAILURES?: (\d+)', out)
    n = sum(int(x) for x in bad) if bad else (0 if r.returncode==0 else 1)
    n += len(re.findall(r'\bMISMATCH\b|\bLEAK\b|\bDRIFT\b|broken', out)) if 'broken' not in out else 0
    print(f"  {'PASS' if n==0 else 'FAIL'}  {name}")
    if n: fails+=n; print("\n".join("        "+l for l in out.splitlines() if any(k in l for k in ('FAIL','MISMATCH','LEAK','DRIFT'))))
    return out

print("PULLI VERIFICATION HARNESS")
print("="*60)
o1=run("geometry      (generator, frames, motion cap)", ['node','geometry.js'])
o2=run("contrast      (5 themes x 3 backgrounds)",      ['python3','contrast.py'])
o3=run("structure     (links, nav, headings, aria)",    ['python3','links.py'])
o4=run("tokens        (graph, layers, density, floors)",['python3','tokens.py'])

# --- inline check 5: tokens.json must agree with tokens.css ---
Rt=C.parse(open(ROOT+'assets/tokens.css').read())
L=C.theme_vars(Rt,{':root'},lambda m: len(m)==0)
D=dict(L); D.update(C.theme_vars(Rt,{':root[data-theme="dark"]'},lambda m: len(m)==0))
def ref(v,n):
    x=v.get(n,'').strip().split('/*')[0].strip().rstrip(';')
    m=re.match(r'var\((--([a-z]+)-([\w-]+))\)',x)
    return '{palette.%s.%s}'%(m.group(2),m.group(3)) if m else x
J=json.load(open(ROOT+'assets/tokens.json'))
drift=[]
for role,node in J['semantic']['color'].items():
    if not isinstance(node,dict) or 'light' not in node: continue
    n='--color-'+role
    for theme,src in (('light',L),('dark',D)):
        want=ref(src,n)
        if want and node.get(theme)!=want: drift.append(f"{role}.{theme}: json {node.get(theme)} vs css {want}")
print(f"  {'PASS' if not drift else 'FAIL'}  tokens.json  (email/print build source in sync)")
for d in drift: print("        DRIFT "+d); 
fails+=len(drift)

# --- inline check 6: every published number matches its artefact ---
lib=open(ROOT+'library.html').read()
inv=lib.split('id="inventory"')[1].split('</section>')[0]
# count only markers inside inventory <li> rows — the legend above the list uses
# the same classes and inflated every earlier count by one per category.
rows=re.findall(r'<li>.*?</li>', inv, re.S)
ship=sum(1 for x in rows if 'class="ship"' in x)
part=sum(1 for x in rows if 'class="part"' in x)
non =sum(1 for x in rows if 'class="none"' in x)
num_ok = (ship,part,non)==(46,4,8) and f'{ship} of {ship+part+non}' in re.sub(r'<[^>]+>','',lib)
print(f"  {'PASS' if num_ok else 'FAIL'}  figures      (inventory {ship}+{part}+{non}={ship+part+non} vs headline)")
if not num_ok: fails+=1

# --- inline check 7: the target-size expander exists wherever a control is below the floor ---
sysc=open(ROOT+'assets/system.css').read()+open(ROOT+'assets/components.css').read()
small=set(re.findall(r'([.\w-]+)\{[^}]*var\(--alavu-sm\)', sysc))
guarded={s for s in small if f'{s}:not(.has-mark)::before' in sysc or f'{s}::before' in sysc}
ungu=small-guarded-{'.avatar-sm'}   # avatar is not interactive
print(f"  {'PASS' if not ungu else 'FAIL'}  target size  ({len(guarded)} of {len(small)} small controls carry a 44px expander)")
if ungu: fails+=1; print("        UNGUARDED "+", ".join(sorted(ungu)))

print("="*60)
print(f"{'ALL CHECKS PASS' if fails==0 else str(fails)+' FAILURE(S)'}")
sys.exit(1 if fails else 0)
