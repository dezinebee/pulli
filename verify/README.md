# Pulli verification harness

Every number published in the documentation is asserted here. Run it before any change ships:

    cd verify && python3 run_all.py

Seven checks:

| Check | Asserts |
|---|---|
| `geometry.js` | `r = U/2` for every arc; arc centres on lattice dots; no open endpoints; determinism per seed; odd dot counts; `cells = (n−1)²`; boundary-loop formula; draw-on within its cap; `r = unit/2` for both frame styles |
| `contrast.py` | every text and non-text pair, in five themes, against `bg` **and** `surface` **and** `surface-sunken` |
| `links.py` | link and anchor integrity; identical sidebar on every page; one `aria-current="page"` per document; one `h1`; no skipped heading levels |
| `tokens.py` | every `var()` resolves; the palette is never used to set a property; type does not scale with pitch; density tiers resolve; no dead tokens |
| tokens.json | the email/print build source agrees with `tokens.css` |
| figures | the inventory's own markers sum to the published headline |
| target size | every control below `--alavu-md` carries a 44px pointer expander |

The rule that produced this harness: **a claim in the documentation and a check here ship together.** Nine of the eleven defects found on its first full run were rules that had been written down and never connected to anything that could check them.
