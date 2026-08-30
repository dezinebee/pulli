/* ============================================================================
   PULLI · SITE BEHAVIOUR
   Shared across every page: theme, pitch, density, navigation, tabs, and
   declarative kolam rendering via [data-kolam].
   ========================================================================== */
(function () {
  "use strict";

  var STORE = "pulli.prefs";

  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  }
  function writePrefs(p) {
    try { localStorage.setItem(STORE, JSON.stringify(p)); } catch (e) { /* private mode */ }
  }
  var prefs = readPrefs();

  /* ---------------- theme ---------------- */
  function systemDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    var btn = document.getElementById("themeBtn");
    if (btn) {
      var effective = t || (systemDark() ? "dark" : "light");
      btn.textContent = effective === "dark" ? "Light" : "Dark";
      btn.setAttribute("aria-label", "Switch to " + (effective === "dark" ? "light" : "dark") + " theme");
    }
  }
  applyTheme(prefs.theme);

  var themeBtn = document.getElementById("themeBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      var effective = cur || (systemDark() ? "dark" : "light");
      var next = effective === "dark" ? "light" : "dark";
      prefs.theme = next; writePrefs(prefs); applyTheme(next);
    });
  }

  /* ---------------- pitch (the one number) ---------------- */
  var pitch = prefs.pitch || 8;
  function applyPitch(v, persist) {
    pitch = v;
    document.documentElement.style.setProperty("--p", v + "px");
    var out = document.getElementById("pitchOut");
    if (out) out.textContent = v + "px";
    var input = document.getElementById("pitchInput");
    if (input && +input.value !== v) input.value = v;
    document.querySelectorAll('[data-echo="p"]').forEach(function (n) { n.textContent = v; });
    document.querySelectorAll('[data-echo="r"]').forEach(function (n) { n.textContent = v / 2; });
    if (persist) { prefs.pitch = v; writePrefs(prefs); }
    if (window.PulliTables) window.PulliTables(v);
  }
  var pitchInput = document.getElementById("pitchInput");
  if (pitchInput) {
    pitchInput.value = pitch;
    pitchInput.addEventListener("input", function () { applyPitch(parseInt(this.value, 10), true); });
  }
  applyPitch(pitch, false);

  /* ---------------- density ---------------- */
  document.querySelectorAll("[data-set-density]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var d = btn.getAttribute("data-set-density");
      document.documentElement.setAttribute("data-density", d);
      // density owns --p while it is set, so mirror it back into the control
      var map = { compact: 6, "default": 8, comfortable: 10 };
      document.documentElement.style.removeProperty("--p");
      var input = document.getElementById("pitchInput");
      if (input) input.value = map[d];
      var out = document.getElementById("pitchOut");
      if (out) out.textContent = map[d] + "px";
      if (window.PulliTables) window.PulliTables(map[d]);
      btn.parentNode.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      btn.setAttribute("aria-pressed", "true");
    });
  });

  /* ---------------- scoped density (showcase surfaces) ---------------- */
  // <div class="seg" data-density-switch="#dashSurface"> … <button data-d="compact">
  document.querySelectorAll("[data-density-switch]").forEach(function (box) {
    var target = document.querySelector(box.getAttribute("data-density-switch"));
    if (!target) return;
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      box.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true");
      target.setAttribute("data-density", b.getAttribute("data-d"));
    });
  });

  /* ---------------- mobile nav ---------------- */
  var menuBtn = document.getElementById("menuBtn");
  var sidebar = document.getElementById("sidebar");
  if (menuBtn && sidebar) {
    var mq = window.matchMedia("(max-width: 1000px)");
    function syncNav() { sidebar.hidden = mq.matches; menuBtn.setAttribute("aria-expanded", String(!mq.matches)); }
    syncNav();
    (mq.addEventListener ? mq.addEventListener("change", syncNav) : mq.addListener(syncNav));
    menuBtn.addEventListener("click", function () {
      sidebar.hidden = !sidebar.hidden;
      menuBtn.setAttribute("aria-expanded", String(!sidebar.hidden));
    });
  }

  /* ---------------- tabs ---------------- */
  document.querySelectorAll('[role="tablist"]').forEach(function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
    }
    list.addEventListener("click", function (e) {
      var t = e.target.closest('[role="tab"]'); if (t) select(t);
    });
    list.addEventListener("keydown", function (e) {
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -1;
      if (next < 0) return;
      e.preventDefault();
      var target = tabs[(next + tabs.length) % tabs.length];
      target.focus(); select(target);
    });
  });

  /* ---------------- declarative kolams ---------------- */
  // <div data-kolam='{"dots":7,"seed":42,"symmetry":"d4"}'></div>
  function paintKolams(animate) {
    if (!window.Kolam) return;
    document.querySelectorAll("[data-kolam]").forEach(function (el) {
      var opts = {};
      try { opts = JSON.parse(el.getAttribute("data-kolam") || "{}"); } catch (e) { opts = {}; }
      window.Kolam.render(el, opts, animate === true && el.hasAttribute("data-animate"));
    });
  }
  paintKolams(true);
  window.PulliPaint = paintKolams;

  /* ---------------- loop boundaries ---------------- */
  // <div class="panel kolam-bound"> — the edge becomes a real kolam boundary,
  // regenerated at the element's measured size whenever that size changes.
  function pitchOf(el) {
    return parseFloat(getComputedStyle(el).getPropertyValue("--p")) || 8;
  }
  function drawFrame(el) {
    if (!window.Kolam) return;
    var p = pitchOf(el);
    window.Kolam.frame(el, {
      // one local pitch for both styles: the frame is a kolam re-seeded at 4P,
      // so its loop radius is 2P — the meeting condition r = unit/2 holds at
      // the frame's own scale, exactly as the toggle does at 3P.
      style: el.getAttribute("data-frame-style") || "curl",
      unit: parseFloat(el.getAttribute("data-frame-unit")) || p * 4,
      stroke: 1.5,
      dotR: Math.max(1.6, p * 0.25)
    });
  }
  function drawBand(el) {
    if (!window.Kolam) return;
    var p = pitchOf(el);
    window.Kolam.band(el, {
      cell: parseFloat(el.getAttribute("data-band-cell")) || p * 8,
      seed: parseFloat(el.getAttribute("data-band-seed")) || 41,
      crossing: parseFloat(el.getAttribute("data-band-crossing")) || 0.15,
      stroke: 3
    });
  }
  function paintEdges() {
    document.querySelectorAll(".kolam-bound").forEach(drawFrame);
    document.querySelectorAll(".kolam-threshold").forEach(drawBand);
  }
  paintEdges();
  window.PulliFrames = paintEdges;

  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.target.classList.contains("kolam-bound")) drawFrame(e.target);
        if (e.target.classList.contains("kolam-threshold")) drawBand(e.target);
      });
    });
    document.querySelectorAll(".kolam-bound, .kolam-threshold").forEach(function (el) { ro.observe(el); });
  } else {
    window.addEventListener("resize", paintEdges);
  }

  /* ---------------- copy buttons ---------------- */
  document.querySelectorAll("[data-copy-target]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var src = document.querySelector(btn.getAttribute("data-copy-target"));
      if (!src) return;
      var text = src.tagName === "PRE" || src.tagName === "CODE" ? src.textContent : src.innerHTML;
      var original = btn.textContent;
      function done(ok) {
        btn.textContent = ok ? "Copied" : "Copy failed";
        setTimeout(function () { btn.textContent = original; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else { done(false); }
    });
  });

  /* ---------------- active section highlighting ---------------- */
  var subLinks = document.querySelectorAll(".nav-sub a");
  if (subLinks.length && "IntersectionObserver" in window) {
    var byId = {};
    subLinks.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var a = byId[en.target.id];
        if (a) a.style.color = en.isIntersecting ? "var(--color-accent)" : "";
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id); if (el) io.observe(el);
    });
  }
})();
