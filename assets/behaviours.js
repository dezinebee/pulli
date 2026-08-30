/* ============================================================================
   PULLI · COMPONENT BEHAVIOURS
   Progressive enhancement for the interactive components. No dependencies.

   Everything here follows the same rule as the rest of the system: the CSS
   reacts to state, this sets it, and the markup declares the semantics. None
   of these invent ARIA that the author did not ask for — they maintain what
   the pattern requires once the author has opted in.

   POSITIONING — AN HONEST LIMIT
   -----------------------------
   Tooltips, popovers and menus are positioned with a simple viewport-collision
   flip. That covers the common cases and does NOT cover scrolling containers,
   transformed ancestors, iframes, or shift-with-scroll. A production system
   should use Floating UI here; this is deliberately the naive version and is
   documented as such in the readiness gap analysis.
   ========================================================================== */
(function () {
  "use strict";

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
                  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (n) {
      return n.offsetWidth || n.offsetHeight || n.getClientRects().length;
    });
  }

  /* ---------------- focus trap, shared by dialog and drawer -------------- */
  function trap(container, onEscape) {
    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); onEscape(); return; }
      if (e.key !== "Tab") return;
      var f = focusables(container);
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    container.addEventListener("keydown", onKey);
    return function () { container.removeEventListener("keydown", onKey); };
  }

  /* ---------------- placement ---------------- */
  function place(anchor, panel, prefer) {
    var a = anchor.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.visibility = "hidden";
    panel.hidden = false;
    var p = panel.getBoundingClientRect();
    var gap = 8, top, left, side = prefer || "bottom";

    if (side === "bottom" && a.bottom + p.height + gap > window.innerHeight && a.top - p.height - gap > 0) side = "top";
    if (side === "top" && a.top - p.height - gap < 0) side = "bottom";

    top = side === "top" ? a.top - p.height - gap : a.bottom + gap;
    left = Math.min(Math.max(gap, a.left), window.innerWidth - p.width - gap);

    panel.style.top = Math.round(top) + "px";
    panel.style.left = Math.round(left) + "px";
    panel.style.visibility = "";
  }

  /* ==========================================================================
     ACCORDION
     ========================================================================== */
  document.querySelectorAll(".accordion").forEach(function (acc) {
    var single = acc.hasAttribute("data-single");
    acc.querySelectorAll(".acc-trigger").forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      if (!panel) return;
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        if (single && !open) {
          acc.querySelectorAll('.acc-trigger[aria-expanded="true"]').forEach(function (other) {
            other.setAttribute("aria-expanded", "false");
            var op = document.getElementById(other.getAttribute("aria-controls"));
            if (op) op.hidden = true;
          });
        }
        btn.setAttribute("aria-expanded", String(!open));
        panel.hidden = open;
      });
    });
  });

  /* ==========================================================================
     TOOLBAR — one tab stop, arrow keys inside
     ========================================================================== */
  document.querySelectorAll('[role="toolbar"]').forEach(function (bar) {
    var items = focusables(bar);
    if (!items.length) return;
    items.forEach(function (n, i) { n.tabIndex = i === 0 ? 0 : -1; });
    bar.addEventListener("keydown", function (e) {
      var i = items.indexOf(document.activeElement);
      if (i < 0) return;
      var next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1
               : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
      if (next < 0 && e.key !== "Home") return;
      e.preventDefault();
      var t = items[(next + items.length) % items.length];
      items.forEach(function (n) { n.tabIndex = -1; });
      t.tabIndex = 0; t.focus();
    });
  });

  /* ==========================================================================
     MENU
     ========================================================================== */
  document.querySelectorAll("[data-menu]").forEach(function (btn) {
    var menu = document.getElementById(btn.getAttribute("data-menu"));
    if (!menu) return;
    var items = function () { return Array.prototype.slice.call(menu.querySelectorAll('[role^="menuitem"]')); };

    function open() {
      place(btn, menu, "bottom");
      btn.setAttribute("aria-expanded", "true");
      var f = items(); if (f[0]) f[0].focus();
      document.addEventListener("click", away, true);
    }
    function close(restore) {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", away, true);
      if (restore) btn.focus();
    }
    function away(e) { if (!menu.contains(e.target) && e.target !== btn) close(false); }

    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", function () { menu.hidden ? open() : close(true); });
    menu.addEventListener("keydown", function (e) {
      var f = items(), i = f.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); f[(i + 1) % f.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); f[(i - 1 + f.length) % f.length].focus(); }
      else if (e.key === "Home") { e.preventDefault(); f[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); f[f.length - 1].focus(); }
      else if (e.key === "Tab") close(false);
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest('[role^="menuitem"]')) close(true);
    });
  });

  /* ==========================================================================
     TOOLTIP — hover and focus, with a delay on hover only
     ========================================================================== */
  var tipEl = null;
  function tipFor(target) {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "tip";
      tipEl.setAttribute("role", "tooltip");
      tipEl.hidden = true;
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  document.querySelectorAll("[data-tip]").forEach(function (target) {
    var timer = null;
    var id = "tip-" + Math.random().toString(36).slice(2, 8);
    function show(immediate) {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var t = tipFor(target);
        t.id = id; t.textContent = target.getAttribute("data-tip");
        target.setAttribute("aria-describedby", id);
        place(target, t, "top");
      }, immediate ? 0 : 400);
    }
    function hide() {
      clearTimeout(timer);
      if (tipEl) tipEl.hidden = true;
      target.removeAttribute("aria-describedby");
    }
    target.addEventListener("mouseenter", function () { show(false); });
    target.addEventListener("mouseleave", hide);
    target.addEventListener("focus", function () { show(true); });
    target.addEventListener("blur", hide);
    target.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
  });

  /* ==========================================================================
     POPOVER
     ========================================================================== */
  document.querySelectorAll("[data-popover]").forEach(function (btn) {
    var pop = document.getElementById(btn.getAttribute("data-popover"));
    if (!pop) return;
    var release = null;
    function open() {
      place(btn, pop, "bottom");
      btn.setAttribute("aria-expanded", "true");
      release = trap(pop, function () { close(true); });
      var f = focusables(pop); (f[0] || pop).focus();
      document.addEventListener("click", away, true);
    }
    function close(restore) {
      pop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (release) { release(); release = null; }
      document.removeEventListener("click", away, true);
      if (restore) btn.focus();
    }
    function away(e) { if (!pop.contains(e.target) && e.target !== btn) close(false); }
    pop.setAttribute("tabindex", "-1");
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", function () { pop.hidden ? open() : close(true); });
  });

  /* ==========================================================================
     DIALOG and DRAWER — focus moved in, trapped, and restored
     ========================================================================== */
  function overlay(panel, opener) {
    var scrim = document.querySelector(".scrim") || (function () {
      var s = document.createElement("div"); s.className = "scrim"; s.hidden = true;
      document.body.appendChild(s); return s;
    })();
    var last = document.activeElement, release = null;

    function close() {
      panel.classList.remove("is-open");
      panel.hidden = true; scrim.hidden = true;
      if (release) { release(); release = null; }
      scrim.removeEventListener("click", close);
      if (last && last.focus) last.focus();
    }
    scrim.hidden = false;
    panel.hidden = false;
    requestAnimationFrame(function () { panel.classList.add("is-open"); });
    release = trap(panel, close);
    scrim.addEventListener("click", close);
    var f = focusables(panel);
    (f[0] || panel).focus();
    panel.__close = close;
    return close;
  }

  document.querySelectorAll("[data-open]").forEach(function (btn) {
    var panel = document.getElementById(btn.getAttribute("data-open"));
    if (!panel) return;
    btn.addEventListener("click", function () { overlay(panel, btn); });
  });
  document.querySelectorAll("[data-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var panel = btn.closest(".dialog, .drawer");
      if (panel && panel.__close) panel.__close();
    });
  });

  /* ==========================================================================
     FILE UPLOAD
     ========================================================================== */
  document.querySelectorAll(".dropzone").forEach(function (zone) {
    var input = zone.querySelector('input[type="file"]');
    var list = zone.parentNode.querySelector(".filelist");
    if (!input) return;

    function render(files) {
      if (!list) return;
      list.innerHTML = "";
      Array.prototype.forEach.call(files, function (f) {
        var li = document.createElement("li");
        li.innerHTML = '<span class="name"></span><span class="size"></span>';
        li.querySelector(".name").textContent = f.name;
        li.querySelector(".size").textContent = (f.size / 1024).toFixed(1) + " KB";
        list.appendChild(li);
      });
      zone.setAttribute("data-count", files.length);
    }
    input.addEventListener("change", function () { render(input.files); });
    ["dragenter", "dragover"].forEach(function (t) {
      zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach(function (t) {
      zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.remove("is-over"); });
    });
    zone.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files) { input.files = e.dataTransfer.files; render(input.files); }
    });
  });

  /* ==========================================================================
     NUMBER INPUT, SLIDER OUTPUT, TAG REMOVE, CODE COPY
     ========================================================================== */
  document.querySelectorAll(".number").forEach(function (n) {
    var input = n.querySelector("input");
    n.querySelectorAll("[data-step]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var step = parseFloat(btn.getAttribute("data-step")) || 1;
        input.value = (parseFloat(input.value || 0) + step);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  });

  document.querySelectorAll(".slider").forEach(function (s) {
    var input = s.querySelector('input[type="range"]'), out = s.querySelector("output");
    if (!input || !out) return;
    function sync() { out.textContent = input.value + (s.getAttribute("data-unit") || ""); }
    input.addEventListener("input", sync); sync();
  });

  document.querySelectorAll(".tag-x").forEach(function (x) {
    x.addEventListener("click", function () {
      var tag = x.closest(".tag");
      if (tag) tag.remove();
    });
  });

  document.querySelectorAll(".code-copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var pre = btn.closest(".code").querySelector("pre");
      var original = btn.textContent;
      function done(ok) { btn.textContent = ok ? "Copied" : "Copy failed"; setTimeout(function () { btn.textContent = original; }, 1600); }
      if (navigator.clipboard) navigator.clipboard.writeText(pre.textContent).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
  });

  document.querySelectorAll(".search-clear").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = btn.closest(".search").querySelector("input");
      input.value = ""; input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
})();
