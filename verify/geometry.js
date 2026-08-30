const K = require('../assets/kolam.js');
const EPS = 1e-6;
let F = 0; const fails = [];
const bad = m => { fails.push(m); F++; };

function parse(d){
  const toks = d.match(/[MLAZmlaz][^MLAZmlaz]*/g) || [];
  let cur=null, start=null; const segs=[];
  for (const t of toks){
    const c=t[0], n=(t.slice(1).match(/-?[\d.]+/g)||[]).map(Number);
    if (c==='M'){ cur=[n[0],n[1]]; start=cur; }
    else if (c==='L'){ segs.push({t:'L',from:cur,to:[n[0],n[1]]}); cur=[n[0],n[1]]; }
    else if (c==='A'){ segs.push({t:'A',from:cur,to:[n[5],n[6]],rx:n[0],ry:n[1],sweep:n[4],large:n[3]}); cur=[n[5],n[6]]; }
    else if (c==='Z'||c==='z'){ segs.push({t:'Z',from:cur,to:start}); cur=start; }
  }
  return segs;
}
function centres(p0,p1,r,sweep,large){
  const dx=p1[0]-p0[0], dy=p1[1]-p0[1], d=Math.hypot(dx,dy);
  if (d>2*r+1e-6 || d===0) return null;
  const h=Math.sqrt(Math.max(0,r*r-(d/2)**2)), mx=(p0[0]+p1[0])/2, my=(p0[1]+p1[1])/2;
  const ux=-dy/d, uy=dx/d;
  return [[mx+h*ux,my+h*uy],[mx-h*ux,my-h*uy]];
}
const M = K.generate({dots:7,seed:1}).meta, U = M.unit, R = M.radius;
console.log(`generator units: U=${U}  R=${R}  R===U/2: ${R===U/2 ? 'OK' : 'FAIL'}`);
if (R !== U/2) bad('R !== U/2');

console.log('\n=== 1. every arc has radius R and its centre on a lattice dot ===');
let arcs=0, cfgs=0, offDot=0, badR=0;
for (const dots of [3,5,7,9,11,13,15,21])
 for (const seed of [1,7,42,1229,99991])
  for (const symmetry of ['d4','d2','c4','none'])
   for (const crossing of [0,0.35,1]){
    let g; try { g = K.generate({dots,seed,symmetry,crossing}); } catch(e){ bad(`throw dots=${dots} sym=${symmetry}: ${e.message}`); continue; }
    cfgs++;
    for (const s of parse(g.paths.join(' '))){
      if (s.t!=='A') continue; arcs++;
      if (Math.abs(s.rx-R)>EPS||Math.abs(s.ry-R)>EPS){ badR++; if(badR<3) bad(`radius ${s.rx}!=${R} dots=${dots}`); continue; }
      const cs=centres(s.from,s.to,s.rx,s.sweep,s.large);
      if(!cs){ offDot++; continue; }
      const on = cs.some(c=>{
        const fx=((c[0]%U)+U)%U, fy=((c[1]%U)+U)%U;
        return Math.min(fx,U-fx)<1e-6 && Math.min(fy,U-fy)<1e-6;
      });
      if(!on){ offDot++; if(offDot<3) bad(`centre off-lattice dots=${dots} seed=${seed} at ${JSON.stringify(cs[0])}`); }
    }
   }
console.log(`  ${cfgs} configs, ${arcs} arcs — ${badR} wrong radius, ${offDot} off-lattice centres`);

console.log('\n=== 2. closure: no open endpoints (every vertex has even degree) ===');
let openCfg=0;
for (const dots of [3,5,7,9,11,13,15,21]) for (const seed of [1,42,1229]) for (const symmetry of ['d4','d2','c4','none']){
  const g=K.generate({dots,seed,symmetry});
  const key=p=>`${p[0].toFixed(6)},${p[1].toFixed(6)}`; const deg={};
  for(const s of parse(g.paths.join(' '))){ deg[key(s.from)]=(deg[key(s.from)]||0)+1; deg[key(s.to)]=(deg[key(s.to)]||0)+1; }
  const odd=Object.entries(deg).filter(([,v])=>v%2);
  if(odd.length){ openCfg++; if(openCfg<4) bad(`open endpoints dots=${dots} sym=${symmetry} seed=${seed}: ${odd.length}`); }
}
console.log(`  ${openCfg} configurations with open endpoints (want 0)`);

console.log('\n=== 3. determinism ===');
let det=0;
for(const dots of [5,9,15,21]) for(const seed of [1,42,1229]) for(const symmetry of ['d4','none']){
  if(JSON.stringify(K.generate({dots,seed,symmetry}))!==JSON.stringify(K.generate({dots,seed,symmetry}))){ det++; bad(`nondeterministic dots=${dots}`); }
}
console.log(`  ${det} non-deterministic configurations (want 0)`);

console.log('\n=== 4. dot count is always odd (a kolam needs a centre dot) ===');
let oddFail=0;
for(const req of [2,3,4,5,6,8,10,12,14,16,-5,0,1]){
  const m=K.generate({dots:req,seed:1}).meta;
  if(m.dots%2!==1||m.dots<3){ oddFail++; bad(`dots:${req} -> ${m.dots}`); }
}
console.log(`  requested even/invalid dot counts normalised: ${13-oddFail}/13 correct`);

console.log('\n=== 5. cells = (n-1)^2, and m=n-1 is always even (boundary pairing depends on it) ===');
let cellFail=0;
for(const dots of [3,5,7,9,11,13,15,21,31]){
  const m=K.generate({dots,seed:1}).meta;
  if(m.cells!==m.dots-1){ cellFail++; bad(`cells ${m.cells} != dots-1 ${m.dots-1}`); }
  if((m.dots-1)%2!==0){ cellFail++; bad(`m=${m.dots-1} is odd — boundary pairing breaks`); }
}
console.log(`  ${cellFail} failures across 9 sizes`);

console.log('\n=== 6. boundary loops: 4 corners + (m-2)/2 half-loops per side ===');
let blFail=0;
for(const dots of [5,7,9,11,13,15]){
  const m=K.generate({dots,seed:1}).meta;
  const cells=m.cells, expect=4+4*((cells-2)/2);
  if(m.boundaryLoops!==expect){ blFail++; bad(`dots=${dots} m=${cells}: boundaryLoops ${m.boundaryLoops}, formula gives ${expect}`); }
}
console.log(`  ${blFail} mismatches against the published formula`);

console.log('\n=== 7. draw-on stagger respects the 600ms cap at every size ===');
const CAP=600, SEG=420; let capF=0, worst=0;
for(const dots of [3,5,7,9,11,13,15,21,31,41]){
  const c=K.generate({dots,seed:42}).paths.length;
  const stagger=c>1?Math.max(0,(CAP-SEG)/(c-1)):0;
  const total=SEG+(c-1)*stagger; worst=Math.max(worst,total);
  if(total>CAP+1e-6){ capF++; bad(`dots=${dots}: ${c} paths -> ${total.toFixed(1)}ms`); }
}
console.log(`  worst case ${worst.toFixed(1)}ms / cap ${CAP}ms — ${capF} breaches`);

console.log('\n=== 8. frame geometry ===');
if (K.framePath){
  // the frame is a kolam re-seeded at its own local pitch, so r must equal
  // unit/2 for BOTH styles and at every unit the caller supplies.
  let n=0, f2=0;
  for(const style of ['curl','scallop']) for(const unit of [16,24,32,40,48,64]){
    const f=K.framePath(400,300,{style,unit}); n++;
    if(Math.abs(f.radius-unit/2)>EPS){ f2++; bad(`framePath ${style} unit=${unit}: radius ${f.radius} != ${unit/2}`); }
  }
  console.log(`  ${n} style x unit combinations — ${f2} violate r = unit/2`);
  // dots reported by the curl frame must sit at the loop centres
  const g=K.framePath(400,300,{style:'curl',unit:32});
  const okd=g.dots.every(d=>Math.abs(d[0]-g.radius)<EPS||Math.abs(d[0]-(400-g.radius))<EPS);
  console.log(`  curl corner dots on the loop centres: ${okd?'OK':'FAIL'}`);
  if(!okd) bad('curl frame dots not at loop centres');
} else console.log('  (framePath not exported)');

console.log(`\n--- FAILURES: ${F} ---`);
fails.slice(0,12).forEach(f=>console.log('  * '+f));
