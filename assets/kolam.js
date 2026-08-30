/* ============================================================================
   PULLI · KOLAM GENERATOR
   ----------------------------------------------------------------------------
   Generates valid kolams as SVG — the looped, continuous-line form. No dependencies. Deterministic
   when given a seed, so a pattern can be committed to a repo as five numbers
   instead of a binary asset.

   THE CONSTRUCTION
   ----------------
   Dots (pulli) sit on a square lattice at pitch U. The line never touches a
   dot; it curves around it at radius U/2. The square CELLS between four dots
   are the unit of composition. Each cell carries one of three tiles, and every
   tile connects only at the midpoints of the cell's four edges:

     tile 0 (A)  two quarter-arcs, around the top-left and bottom-right dots
     tile 1 (B)  two quarter-arcs, around the top-right and bottom-left dots
     tile 2 (C)  a crossing — two straight lines, kambi over kambi

   Because the arc radius is exactly half the pitch, an arc's endpoints land on
   edge midpoints and its tangent there is perpendicular to the edge. Any two
   tiles therefore join smoothly, whatever they are. That is the whole trick.

   CLOSING THE BOUNDARY
   --------------------
   Tiles on the outer ring leave open ends on the perimeter. Walking the
   perimeter clockwise gives 4m ends (m = cells per side). Pairing them with an
   offset of one produces, for every even m, exactly four corner loops (a 3/4
   arc around each corner dot) and (m-2)/2 half-loops per side (each wrapping
   the dot between two adjacent ends). Since the dot count n is always odd,
   m = n-1 is always even, so the boundary always closes and the result is
   always a finite set of closed curves — a valid kolam, never a dangling line.

   GUARANTEES
   ----------
   · every path endpoint is shared by exactly two paths (no open ends)
   · under symmetry "d4" the tile grid is invariant under transpose and both
     mirrors (mirrors swap A and B; transpose preserves tile type)
   · every arc centre lies on a lattice dot
   ========================================================================== */

(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.Kolam = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var U = 40;          // lattice pitch in SVG user units
  var R = U / 2;       // loop radius — the meeting condition

  /* ---- deterministic RNG (mulberry32) --------------------------------- */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- tile grid ------------------------------------------------------ */
  // A mirror swaps the two arc orientations; a crossing is invariant.
  function flip(v) { return v === 2 ? 2 : (v === 0 ? 1 : 0); }

  function makeTiles(m, symmetry, crossing, rand) {
    var t = [], i, j;
    for (i = 0; i < m; i++) { t.push(new Array(m).fill(0)); }

    function pick() {
      if (rand() < crossing) return 2;
      return rand() < 0.5 ? 0 : 1;
    }

    if (symmetry === "none") {
      for (i = 0; i < m; i++) for (j = 0; j < m; j++) t[i][j] = pick();
      return t;
    }

    // Seed one quadrant, then mirror it out.
    var h = Math.ceil(m / 2);
    for (i = 0; i < h; i++) {
      for (j = 0; j < h; j++) {
        // d4 adds transpose symmetry, which preserves tile type
        if (symmetry === "d4" && j < i) t[i][j] = t[j][i];
        else t[i][j] = pick();
      }
    }
    for (i = 0; i < m; i++) {
      for (j = 0; j < m; j++) {
        if (i < h && j < h) continue;
        var si = i < h ? i : m - 1 - i;
        var sj = j < h ? j : m - 1 - j;
        var v = t[si][sj];
        if (i >= h) v = flip(v);
        if (j >= h) v = flip(v);
        t[i][j] = v;
      }
    }
    return t;
  }

  /* ---- path emission -------------------------------------------------- */
  // Quarter arc of radius R. sweep 1 = clockwise on screen (y grows downward).
  function arc(x1, y1, x2, y2, sweep) {
    return "M" + x1 + " " + y1 + "A" + R + " " + R + " 0 0 " + sweep + " " + x2 + " " + y2;
  }

  function tilePaths(i, j, type) {
    var x = i * U, y = j * U, h = R, p = [];
    var N = [x + h, y], E = [x + U, y + h], S = [x + h, y + U], W = [x, y + h];

    if (type === 2) {
      p.push("M" + N[0] + " " + N[1] + "L" + S[0] + " " + S[1]);
      p.push("M" + W[0] + " " + W[1] + "L" + E[0] + " " + E[1]);
    } else if (type === 0) {
      // around the top-left dot: N is east of it, W is south of it → clockwise
      p.push(arc(N[0], N[1], W[0], W[1], 1));
      // around the bottom-right dot: E is north of it, S is west of it → ccw
      p.push(arc(E[0], E[1], S[0], S[1], 0));
    } else {
      // around the top-right dot: N is west of it, E is south of it → ccw
      p.push(arc(N[0], N[1], E[0], E[1], 0));
      // around the bottom-left dot: W is north of it, S is east of it → cw
      p.push(arc(W[0], W[1], S[0], S[1], 1));
    }
    return p;
  }

  // Open ends on the perimeter, listed clockwise starting at the top-left.
  function perimeterEnds(m) {
    var e = [], i;
    for (i = 0; i < m; i++)      e.push({ x: i * U + R, y: 0,         side: "t" });
    for (i = 0; i < m; i++)      e.push({ x: m * U,     y: i * U + R, side: "r" });
    for (i = m - 1; i >= 0; i--) e.push({ x: i * U + R, y: m * U,     side: "b" });
    for (i = m - 1; i >= 0; i--) e.push({ x: 0,         y: i * U + R, side: "l" });
    return e;
  }

  function boundaryPaths(m) {
    var ends = perimeterEnds(m), out = [], k;
    // Offset the pairing by one so each corner dot gets its own loop.
    for (k = 1; k < ends.length; k += 2) {
      var a = ends[k], b = ends[(k + 1) % ends.length];
      var large = (a.side === b.side) ? 0 : 1;   // same side = 1/2 loop, corner = 3/4 loop
      out.push("M" + a.x + " " + a.y + "A" + R + " " + R + " 0 " + large + " 1 " + b.x + " " + b.y);
    }
    return out;
  }

  /* ---- public API ----------------------------------------------------- */
  var DEFAULTS = {
    dots: 7,             // dots per side — odd, 3…15
    symmetry: "d4",      // "d4" | "d2" | "none"
    crossing: 0.2,       // 0…1 probability a cell is a crossing rather than arcs
    stroke: 3,           // kambi weight in SVG user units
    showDots: true,      // render the pulli
    seed: null,          // integer → deterministic; null → random
    title: null          // accessible name; auto-generated when omitted
  };

  function normalise(opts) {
    var o = {}, k;
    for (k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) o[k] = DEFAULTS[k];
    for (k in (opts || {})) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    o.dots = Math.max(3, Math.round(o.dots));
    if (o.dots % 2 === 0) o.dots += 1;              // kolams need a centre dot
    o.crossing = Math.min(1, Math.max(0, o.crossing));
    if (o.seed === null || o.seed === undefined) o.seed = (Math.random() * 1e9) | 0;
    return o;
  }

  /**
   * Build a kolam.
   * @returns {{svg:string, paths:string[], meta:object}}
   */
  function generate(opts) {
    var o = normalise(opts);
    var n = o.dots, m = n - 1;
    var tiles = makeTiles(m, o.symmetry, o.crossing, rng(o.seed));
    var paths = [], i, j, k;

    for (i = 0; i < m; i++) for (j = 0; j < m; j++) paths = paths.concat(tilePaths(i, j, tiles[i][j]));
    var boundary = boundaryPaths(m);
    paths = paths.concat(boundary);

    var pad = U * 0.75;
    var size = m * U;
    var vb = [-pad, -pad, size + pad * 2, size + pad * 2].join(" ");
    var label = o.title || ("Kolam, " + n + " by " + n + " dots, " + o.symmetry.toUpperCase() + " symmetry");

    var svg = '<svg viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + label + '">';
    for (k = 0; k < paths.length; k++) {
      svg += '<path class="kolam-line" d="' + paths[k] + '" stroke-width="' + o.stroke + '"/>';
    }
    if (o.showDots) {
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
        svg += '<circle class="kolam-dot" cx="' + (i * U) + '" cy="' + (j * U) + '" r="' + (o.stroke * 0.85) + '"/>';
      }
    }
    svg += "</svg>";

    return {
      svg: svg,
      paths: paths,
      meta: {
        dots: n, cells: m, seed: o.seed, symmetry: o.symmetry,
        crossing: o.crossing, segments: paths.length,
        boundaryLoops: boundary.length, unit: U, radius: R
      }
    };
  }

  /** Render into an element. Returns the meta object. */
  function render(el, opts, animate) {
    if (!el) return null;
    var out = generate(opts);
    el.innerHTML = out.svg;
    if (animate && !prefersReducedMotion()) drawOn(el);
    return out.meta;
  }

  function prefersReducedMotion() {
    return typeof window !== "undefined" && window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /**
   * Draw-on animation: each segment strokes itself in, staggered.
   *
   * The stagger is COMPUTED, not fixed. A fixed interval makes total duration
   * a function of segment count — at 84 segments a 6ms stagger ran 924ms,
   * well past the system's 600ms ceiling for anything a user waits on. Here
   * the stagger is derived from the cap instead, so a 3×3 kolam and a 15×15
   * kolam both finish in exactly --nagarthal-4.
   *
   *   total = SEGMENT_MS + (n - 1) × stagger  ==  CAP_MS,  always
   */
  /* The cap is published as a token. Reading it here instead of restating it
     removes the second source of truth — before this, --nagarthal-4 and the
     literal 600 below could drift apart silently and the audit found that they
     were two independent declarations of the same rule. Falls back to the
     documented values when there is no document (SSR, tests, Node). */
  function msToken(name, fallback) {
    if (typeof getComputedStyle !== "function" || typeof document === "undefined") return fallback;
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!v) return fallback;
    var n = parseFloat(v);
    if (isNaN(n)) return fallback;
    return /\ds$/.test(v) && !/ms$/.test(v) ? n * 1000 : n;
  }
  var CAP_MS = msToken("--motion-cap", 600);          // the ceiling, end to end
  var SEGMENT_MS = msToken("--motion-segment", 360);  // one segment's own stroke

  function drawOn(el) {
    var lines = el.querySelectorAll(".kolam-line");
    var n = lines.length;
    var stagger = n > 1 ? Math.max(0, (CAP_MS - SEGMENT_MS) / (n - 1)) : 0;

    Array.prototype.forEach.call(lines, function (p, idx) {
      var len;
      try { len = p.getTotalLength(); } catch (e) { return; }
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
      p.style.transition = "stroke-dashoffset " + SEGMENT_MS +
        "ms cubic-bezier(0.33,0,0.15,1) " + (Math.round(idx * stagger * 10) / 10) + "ms";
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { p.style.strokeDashoffset = 0; });
      });
    });
  }

  /* ==========================================================================
     FRAME · a kolam boundary around a rectangle
     --------------------------------------------------------------------------
     The enclosure in a kolam is not a box. It is the line looping the dots
     along the perimeter: outward half-loops on the edges, and a turn around
     the dot at each corner. This produces that boundary at an arbitrary size,
     so a card edge can be an actual kolam boundary instead of an approximation
     of one.

     The frame lattice is coarser than the interface lattice — pitch 4P — so
     the corner loop radius equals the panel radius (2P) and the scallops read
     at component scale rather than disappearing.
     ========================================================================== */

  /**
   * @param {number} w,h  box size in px
   * @param {object} opts { style:"curl"|"scallop", radius, unit }
   * @returns {{path:string, dots:Array<[number,number]>, radius:number}}
   *
   * "curl" is the default and the one to use. The edges stay straight and the
   * LINE CURLS at each corner — three-quarters of a turn around the corner dot
   * before continuing down the next edge. It is the boundary move without the
   * frill, and it holds at any size because the curl radius is fixed rather
   * than proportional.
   *
   * "scallop" wraps every perimeter dot. It is geometrically the more literal
   * boundary and it looks like a doily on a UI surface — kept for print and
   * certificate work, where a dense decorative edge is the point, and
   * documented as the wrong default.
   */
  function framePath(w, h, opts) {
    var o = typeof opts === "number" ? { unit: opts } : (opts || {});
    // Both styles are seeded from the SAME local unit so a caller who sets
    // `unit` gets a consistent frame whichever style is chosen. Previously
    // `curl` read only `radius` and silently ignored `unit`, so the two styles
    // could disagree about the local pitch from one call.
    var unit = o.unit || 32;
    if ((o.style || "curl") === "curl") return curlPath(w, h, o.radius || unit / 2);
    return scallopPath(w, h, unit);
  }

  function curlPath(w, h, R) {
    if (w < 4 * R || h < 4 * R) {
      // too small for a curl — fall back to a plain rounded rect, no dots
      var r = Math.max(0, Math.min(R, Math.min(w, h) / 2));
      return {
        path: "M" + r + " 0 L" + (w - r) + " 0 a" + r + " " + r + " 0 0 1 " + r + " " + r +
          " L" + w + " " + (h - r) + " a" + r + " " + r + " 0 0 1 " + (-r) + " " + r +
          " L" + r + " " + h + " a" + r + " " + r + " 0 0 1 " + (-r) + " " + (-r) +
          " L0 " + r + " a" + r + " " + r + " 0 0 1 " + r + " " + (-r) + " Z",
        dots: [], radius: r
      };
    }
    var A = "a" + R + " " + R + " 0 1 0 ";      // 3/4 turn, curling inward
    return {
      path: "M" + R + " 0 L" + (w - R) + " 0 " + A + R + " " + R +
        " L" + w + " " + (h - R) + " " + A + (-R) + " " + R +
        " L" + R + " " + h + " " + A + (-R) + " " + (-R) +
        " L0 " + R + " " + A + R + " " + (-R) + " Z",
      dots: [[R, R], [w - R, R], [w - R, h - R], [R, h - R]],
      radius: R
    };
  }

  function scallopPath(w, h, U) {
    var R = U / 2;                       // corner loop radius
    var innerW = w - 4 * R, innerH = h - 4 * R;
    if (innerW < 0 || innerH < 0) return { path: "", dots: [], radius: R };

    // fit a whole number of half-loops to each edge; the scallop radius flexes
    var nx = Math.max(1, Math.round(innerW / (2 * R)));
    var ny = Math.max(1, Math.round(innerH / (2 * R)));
    var rx = innerW / (2 * nx), ry = innerH / (2 * ny);

    var p = [], dots = [], i;
    function run(n, r, dx, dy, sweep) {
      for (i = 0; i < n; i++) p.push("a" + r + " " + r + " 0 0 " + sweep + " " + dx + " " + dy);
    }

    p.push("M" + (2 * R) + " " + R);
    run(nx, rx, 2 * rx, 0, 1);                                    // top
    p.push("a" + R + " " + R + " 0 0 1 " + R + " " + R);          // TR corner
    run(ny, ry, 0, 2 * ry, 1);                                    // right
    p.push("a" + R + " " + R + " 0 0 1 " + (-R) + " " + R);       // BR corner
    run(nx, rx, -2 * rx, 0, 1);                                   // bottom
    p.push("a" + R + " " + R + " 0 0 1 " + (-R) + " " + (-R));    // BL corner
    run(ny, ry, 0, -2 * ry, 1);                                   // left
    p.push("a" + R + " " + R + " 0 0 1 " + R + " " + (-R));       // TL corner
    p.push("Z");

    // the pulli the line loops: four corners, then one at each scallop centre
    dots.push([2 * R, 2 * R], [w - 2 * R, 2 * R], [w - 2 * R, h - 2 * R], [2 * R, h - 2 * R]);
    for (i = 0; i < nx; i++) {
      var x = 2 * R + (2 * i + 1) * rx;
      dots.push([x, R], [x, h - R]);
    }
    for (i = 0; i < ny; i++) {
      var y = 2 * R + (2 * i + 1) * ry;
      dots.push([R, y], [w - R, y]);
    }
    return { path: p.join(""), dots: dots, radius: R };
  }

  /** Render a kolam boundary sized to an element, as an absolutely-placed SVG. */
  function frame(el, opts) {
    if (!el) return null;
    var o = opts || {};
    var w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (!w || !h) return null;
    var f = framePath(w, h, o);
    if (!f.path) return null;

    var svg = '<svg class="kolam-frame" viewBox="0 0 ' + w + " " + h +
      '" width="' + w + '" height="' + h + '" aria-hidden="true" focusable="false">' +
      '<path class="kolam-frame-line" d="' + f.path + '" fill="none" stroke-width="' + (o.stroke || 1) + '"/>';
    if (o.showDots !== false) {
      for (var i = 0; i < f.dots.length; i++) {
        svg += '<circle class="kolam-frame-dot" cx="' + f.dots[i][0] + '" cy="' + f.dots[i][1] + '" r="' + (o.dotR || 1.6) + '"/>';
      }
    }
    svg += "</svg>";

    var host = el.querySelector(":scope > .kolam-frame-host");
    if (!host) {
      host = document.createElement("span");
      host.className = "kolam-frame-host";
      el.insertBefore(host, el.firstChild);
    }
    host.innerHTML = svg;
    return f;
  }

  /* ==========================================================================
     THRESHOLD BAND
     --------------------------------------------------------------------------
     The most faithful use of a kolam on a surface, and the last one we found.
     A kolam is not a frame around a room — it is a mark at the THRESHOLD, at
     the point of entry. On a card or a panel the threshold is the head, where
     the eye enters. So: one motif, repeated, along the top edge.

     One motif — not a different seed per cell. Varying the seed produces
     noise; repetition produces a border. That is what makes it read as a band
     rather than as a row of unrelated figures.
     ========================================================================== */

  /** @returns {string} SVG for a band of repeated motifs, width px wide. */
  function bandSVG(width, opts) {
    var o = opts || {};
    var cell = o.cell || 64;
    var n = Math.max(1, Math.floor(width / cell));
    var motif = generate({
      dots: o.dots || 3, seed: o.seed == null ? 41 : o.seed,
      crossing: o.crossing == null ? 0.15 : o.crossing,
      stroke: o.stroke || 3, showDots: o.showDots === true
    });
    var inner = motif.svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    var span = U * 2 * ((o.dots || 3) - 1) / 2 + U * 1.5;   // motif viewBox span
    var s = cell / span;

    var g = "";
    for (var i = 0; i < n; i++) {
      g += '<g transform="translate(' + (i * cell) + ',0) scale(' + s +
        ") translate(" + (U * 0.75) + "," + (U * 0.75) + ')">' + inner + "</g>";
    }
    return '<svg class="kolam-band" viewBox="0 0 ' + (n * cell) + " " + cell +
      '" width="' + (n * cell) + '" height="' + cell +
      '" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">' + g + "</svg>";
  }

  /** Render a threshold band into an element's head. */
  function band(el, opts) {
    if (!el) return null;
    var w = Math.round(el.offsetWidth);
    if (!w) return null;
    var host = el.querySelector(":scope > .kolam-band-host");
    if (!host) {
      host = document.createElement("span");
      host.className = "kolam-band-host";
      el.insertBefore(host, el.firstChild);
    }
    host.innerHTML = bandSVG(w, opts);
    return host;
  }

  /** Standalone SVG string with colours inlined, for export. */
  function toStandaloneSVG(opts, colors) {
    var c = colors || {};
    return generate(opts).svg
      .replace("<svg ", '<svg width="512" height="512" ')
      .replace(/class="kolam-line"/g, 'fill="none" stroke="' + (c.line || "#A34524") + '" stroke-linecap="round" stroke-linejoin="round"')
      .replace(/class="kolam-dot"/g, 'fill="' + (c.dot || "#7C6B5C") + '"');
  }

  return {
    generate: generate,
    render: render,
    drawOn: drawOn,
    toStandaloneSVG: toStandaloneSVG,
    framePath: framePath,
    frame: frame,
    bandSVG: bandSVG,
    band: band,
    tilePaths: tilePaths,
    makeTiles: makeTiles,
    boundaryPaths: boundaryPaths,
    DEFAULTS: DEFAULTS,
    UNIT: U
  };
});
