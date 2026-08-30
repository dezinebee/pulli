# Pulli

**A design system generated from the dot.**

The kolam is not decoration. It is a rule set: a lattice of dots, a fixed
loop radius, and — in the looped form — a line that must never break. Pulli takes those rules literally
and derives an interface language from them — spacing, geometry, motion, and a
pattern engine that emits assets instead of storing them.

No dependencies. No build step. Open `index.html`.

---

## The seed

Dots sit on a square lattice at pitch `P`. The line never touches a dot; it
curves around it at radius `r`. For the loops around two adjacent dots to meet
without a gap or an overlap, they must meet at the midpoint of the lattice edge
between them. That happens at exactly one value:

```
r = P / 2
```

Fix that and the spacing scale and the radius scale are locked to each other
permanently. It is also the reason the pattern engine works: because arcs meet
at edge midpoints with matching tangents, any tile composes with any other.

```
P = 8px  →  r = 4px
spacing = nP           →  8, 16, 24, 32, 48, 64
radius  = n·r          →  2, 4, 8, 16
stroke  = r/4, r/2, r  →  1, 2, 4
type    = 16 × √2ⁿ     →  11, 16, 23, 32, 45, 64
```

---

## Contents

```
pulli/
├── index.html            00 · Overview — what it is, quick start, fit
├── origins.html          01 · Why a kolam, its history, the mathematics
├── principles.html       02 · Four rules, what they rule out, precedence
├── lattice.html          03 · Derivation, grid, density, where it breaks
├── tokens.html           04 · Three-layer model, full reference, theming
├── generator.html        05 · Tile set, algorithm, proof, API, recipes
├── components.html       06 · Twelve components with specs and states
├── motion.html           07 · The three moves, duration, choreography
├── accessibility.html    08 · Measured contrast, focus, targets, culture
├── governance.html       09 · Versioning, review, deprecation, credit
├── showcase.html         10 · Five surfaces, the forks, what they broke
│   ├── showcase-dashboard.html   compact · neelam fork
│   ├── showcase-mobile.html      comfortable · ilai fork
│   ├── showcase-website.html     default · canonical
│   ├── showcase-webapp.html      default · canonical
│   └── showcase-email-print.html resolved · no CSS variables
└── assets/
    ├── tokens.css        palette → primitives → semantics
    ├── system.css        shell + component library
    ├── showcase.css      device frames and mock shells (showcase pages only)
    ├── print.css         lattice re-seeded at P = 2mm, type at 10pt
    ├── email-template.html  tokens resolved to literals, Outlook-safe
    ├── kolam.js          the generator (UMD, ~4 KB, no dependencies)
    ├── site.js           theme, pitch, nav, declarative rendering
    └── tokens.json       machine-readable export with contrast figures
```

---

## Surfaces without variables

Outlook renders email with Word: no `var()`, no flexbox, no `max()`, no SVG, no
JavaScript. Print has no viewport, no dark mode and no target sizes. Both are
supported by **resolving** the semantic layer at build time instead of
referencing it at runtime — which is what `tokens.json` is actually for.

```
                screen        email         print
--space-inset-md   var(--idai-3)   24px          6mm
--radius-panel     var(--valai-4)  16px          4mm
--alavu-md         max(5.5P,44px)  44px fixed    n/a
--ezhuthu-body     16px            16px          10pt   ← re-seeded, not scaled
```

The ratio is structural; the base is surface-dependent. Print re-seeds the
lattice at `P = 2mm` and type at 10pt rather than scaling pixel values — `r =
P/2` and `√2` are meaningful in millimetres and points, which is what makes
that possible.

Four guarantees stop being automatic there (the 44px floor, SVG rendering, the
dual theme, and two colour roles), so they move into CI as assertions against
the resolved output. See `showcase-email-print.html`.

---

## Forking

A fork replaces palette values and reassigns semantic roles. It never touches
primitives, and it may not change `r = P/2`. Both showcase forks are under
twenty lines:

```css
#surface{
  --color-accent:        #33509B;   /* 7.36 on light ground */
  --color-accent-hover:  #2F4A8C;
  --color-accent-subtle: #E7ECF7;
  --color-on-accent:     var(--maa-50);
  --color-kolam-line:    #33509B;   /* the pattern themes too */
}
:root[data-theme="dark"] #surface{
  --color-accent:        #9DB6E8;   /* 9.11 on dark ground */
  --color-accent-subtle: #1B2333;
  --color-on-accent:     var(--mann-900);
}
```

No spacing, radius, type, motion or component override — which is the only
reason a fork can be this short.

---

## Quick start

**Tokens only**

```html
<link rel="stylesheet" href="assets/tokens.css">
```
```css
.my-card {
  padding:       var(--space-inset-lg);
  border-radius: var(--radius-panel);
  background:    var(--color-surface);
  border:        var(--border-hairline) solid var(--color-border);
}
```

**Pattern engine only**

```html
<script src="assets/kolam.js"></script>
```
```js
// deterministic — same seed, same kolam, forever
const { svg, meta } = Kolam.generate({ dots: 9, symmetry: 'd4', seed: 1729 });
```

**Full system**

```html
<link rel="stylesheet" href="assets/tokens.css">
<link rel="stylesheet" href="assets/system.css">
<script src="assets/kolam.js" defer></script>
<script src="assets/site.js" defer></script>

<button class="btn btn-primary">Draw</button>
<div data-kolam='{"dots":5,"seed":42}'></div>
```

---

## The one rule

**Three layers, one direction.** Palette → primitives → semantics. Each layer may
reference only the layer above it, and product code may reference **only the
semantic layer**.

```css
/* correct */
.thing { background: var(--color-accent); }

/* wrong — skips a layer, looks fine until someone switches theme */
.thing { background: var(--kavi-600); }
```

Every pull request that introduces a value must show that value expressed in
terms of `P` and `r`. A raw length literal is a review block, not a nit. Where a
value genuinely cannot be derived — target sizes, hairlines, the type scale,
breakpoints — it lands in `tokens.css` with a comment naming the constraint, and
a row in the exceptions table.

---

## Generator guarantees

Verified by test across every grid size from 3 to 15, all three symmetry groups,
and crossing probabilities from 0 to 0.7:

- every path endpoint is shared by exactly two paths — **no open ends**
- D4 output is invariant under transpose and both mirrors
- every arc centre lies on a lattice dot
- identical output for identical seed, on every machine

A pattern in this repository is five numbers in a config file, not a binary
asset.

---

## Why a kolam

Design systems borrow visual traditions constantly, and almost always they
borrow the surface. This one borrows a grammar. Four properties made that
possible, and each became load-bearing rather than decorative:

| Property of the tradition | What it became |
|---|---|
| Specified before it is drawn — dot count, grid, movement rule | The derivation rule and the whole lattice |
| Has a **correctness condition** — in the looped form, a broken line fails | Continuity as a principle, and the generator's zero-open-endpoints test |
| Generative — one grid, unlimited valid patterns | The pattern engine; five numbers instead of an asset library |
| Meant to be erased and redrawn daily | The deprecation policy and the annual breaking release |

The test for whether a borrowed metaphor is doing work: remove the source and
see what collapses. Remove kolam here and you lose the derivation rule, the
continuity requirement, the pattern engine and the release model.

**The chronology is contested, and this matters.** Popular writing reaches for
the oldest available date. Gift Siromoney — whose array-grammar work in the
1970s is the reason this generator can exist at all — argued the opposite: that
common threshold patterns are *not* very ancient, that the practice may go back
about six hundred years, and that the word *kolam* for floor patterns first
appears in a 16th-century Kuravanji. `origins.html` gives both readings and
settles neither.

**The same constraints appear elsewhere, independently.** Chokwe *sona* sand
drawings in Angola are mirror curves on a dot lattice whose stated aesthetic
prefers curves that separate each dot, form a single Eulerian circuit, and are
symmetric — the three constraints of a kolam, in the same order, with no
contact between the traditions. Vanuatu *sandroing*, on UNESCO's Representative
List since 2008, traces a continuous line on an imagined grid and is then wiped
away. Convergent structure, though — not shared meaning. Flattening them into
one universal symbol erases what each specifically is.

---

## Motion

Motion has a physical referent: a kolam is the record of a hand moving through a
grid without lifting. So duration is distance, easing is one of three moves the
line can make, and choreography is the order the line reaches things.

```
--nagarthal-dot   30ms    1 dot — the quantum, and the stagger interval
--nagarthal-1    120ms    4 dots — hover, press, colour
--nagarthal-2    240ms    8 dots — reveal, expand, toggle travel
--nagarthal-3    360ms   12 dots — page and route
--nagarthal-4    600ms   20 dots — the ceiling, measured end to end

neli    cubic-bezier(0.65, 0, 0.35, 1)   the turn    — direct manipulation
chuzhi  cubic-bezier(0.33, 0, 0.15, 1)   the spiral  — arriving
vidu    cubic-bezier(0.5,  0, 0.9, 0.4)  the release — departing
```

Two rules that do more work than the rest:

- **Out is faster than in.** 120ms exit against a 240ms reveal. Leaving content
  is already dismissed in the user's head; every millisecond after that is
  latency.
- **Never animate layout properties.** Not only for performance: a padding
  animating 16px → 24px spends a quarter second passing through 17, 18, 19 —
  values the system does not contain. Transform moves the painted result without
  taking the component off the lattice.

The ceiling is a **total, not a step**. Building this section found the
generator's draw-on running 918ms at 7×7 and 2.9s at 15×15 against a documented
600ms limit, because a fixed per-segment stagger made duration a function of
segment count. The stagger is now derived from the cap, so every grid size
finishes in exactly 600ms.

---

## Accessibility

Contrast figures are computed from the palette, not estimated, and recomputed in
CI — a claim that drifts from its measurement fails the build. Full matrix for
both themes is in `accessibility.html`.

Hard limits that override everything else:

- **44px target size**, enforced inside the token via `max()`, including at
  compact density where the derivation would give 33px
- **Pattern density ≤ 10%** of any viewport; kolam belongs to the expressive
  layer, never behind body text or in table chrome
- **Pattern is never the sole carrier of meaning**
- **Reduced motion removes decorative motion**, it does not shorten it

---

## Credit

The code is MIT. Take it, fork it, ship it commercially.

**The practice is not licensed by anyone here.** Kolam belongs to the households
and communities who draw it, and has for far longer than any of this. What the
licence cannot require, this asks for: name the source, keep the Tamil terms and
their glosses, avoid the sacred set, and route credit and resources back where
you can.

The observation that kolams form a generable picture language — that a formal
grammar can produce them — comes from **Gift Siromoney, Rani Siromoney and
Kamala Krithivasan** at Madras Christian College in the 1970s. This engine is a
small applied consequence of that work.

If your product has no connection to the tradition, kolam may read as texture
borrowed for novelty. That might still be the right call — but it should be a
call, not a default. See `accessibility.html#cultural`.

---

MIT © 2026
