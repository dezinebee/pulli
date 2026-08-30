/* ============================================================================
   PULLI · DATA GRID
   ----------------------------------------------------------------------------
   Virtualised, sortable, filterable, resizable, freezable, selectable.
   No dependencies. ~40 rows rendered regardless of dataset size.

   A data grid is the most literal lattice in the system: rows crossing
   columns, and the intersections are where the line would turn. The sorted
   column's header dot is wrapped by a loop, which is the same primitive tabs
   use — choosing a sort column IS choosing among options along a line.

   ARIA
   ----
   Virtualisation breaks the implicit row and column counts a screen reader
   derives from the DOM, so they are supplied explicitly:
     · role="grid" with aria-rowcount / aria-colcount on the whole grid
     · aria-rowindex on every row, 1-based, header included
     · aria-colindex on every cell
   Without these a virtualised grid announces "row 3 of 30" when the user is
   at row 4,812 of 10,000. This is the single most commonly skipped part of
   building one of these.

   KEYBOARD
   --------
   Roving tabindex over cells — the grid is one tab stop.
     ← → ↑ ↓      move one cell
     Home / End   first / last cell in row
     Ctrl+Home    first cell in grid        Ctrl+End  last cell
     PageUp/Down  one viewport
     Space        toggle row selection
     Shift+Space  extend selection from anchor
     Enter        activate row
     On a header: Enter or Space sorts. On a resize handle: ← → resize by
     one lattice step, which is how a keyboard user resizes a column at all.
   ========================================================================== */

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PulliGrid = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SELECT_W = 44;   // the select column is a target, so it is floored not derived

  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    for (var k in (attrs || {})) n.setAttribute(k, attrs[k]);
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function PulliGrid(host, opts) {
    this.host = typeof host === "string" ? document.querySelector(host) : host;
    var o = opts || {};
    this.columns = (o.columns || []).map(function (c, i) {
      return {
        key: c.key, label: c.label || c.key,
        width: c.width || 160, minWidth: c.minWidth || 72,
        type: c.type || "text",           // text | number | currency | status
        align: c.align || (c.type === "number" || c.type === "currency" ? "end" : "start"),
        frozen: !!c.frozen, sortable: c.sortable !== false, filterable: c.filterable !== false,
        format: c.format, order: i
      };
    });
    this.rows = o.rows || [];
    this.selectable = o.selectable !== false;
    this.overscan = o.overscan || 8;
    this.locale = o.locale || undefined;
    this.currency = o.currency || "USD";
    this.onActivate = o.onActivate || null;

    this.sort = o.sort || null;                  // {key, dir:'asc'|'desc'}
    this.filters = {};
    this.query = "";
    this.hidden = new Set();
    this.selected = new Set();
    this.anchor = null;
    this.focus = { r: 0, c: 0 };                 // r: 0 = header row
    this._scrollTop = 0;
    this._raf = null;

    this._build();
    this.refresh();
  }

  /* ---------------- derived data ---------------- */
  PulliGrid.prototype.visibleColumns = function () {
    var h = this.hidden;
    return this.columns.filter(function (c) { return !h.has(c.key); });
  };

  PulliGrid.prototype.compute = function () {
    var self = this, q = this.query.trim().toLowerCase(), f = this.filters;
    var cols = this.columns;
    var out = this.rows.filter(function (row) {
      if (q) {
        var hit = false;
        for (var i = 0; i < cols.length; i++) {
          if (String(row[cols[i].key]).toLowerCase().indexOf(q) !== -1) { hit = true; break; }
        }
        if (!hit) return false;
      }
      for (var k in f) {
        if (!f[k]) continue;
        if (String(row[k]).toLowerCase().indexOf(f[k].toLowerCase()) === -1) return false;
      }
      return true;
    });
    if (this.sort) {
      var key = this.sort.key, dir = this.sort.dir === "desc" ? -1 : 1;
      var col = cols.filter(function (c) { return c.key === key; })[0];
      var numeric = col && (col.type === "number" || col.type === "currency");
      out = out.slice().sort(function (a, b) {
        var x = a[key], y = b[key];
        if (numeric) return (Number(x) - Number(y)) * dir;
        x = String(x).toLowerCase(); y = String(y).toLowerCase();
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
      });
    }
    this.view = out;
    return out;
  };

  PulliGrid.prototype.rowHeight = function () {
    var p = parseFloat(getComputedStyle(this.host).getPropertyValue("--p")) || 8;
    return Math.max(Math.round(p * 5.5), 44);   // --alavu-md, resolved
  };

  /* ---------------- formatting ---------------- */
  PulliGrid.prototype.fmt = function (col, value) {
    if (col.format) return col.format(value);
    if (col.type === "number") return new Intl.NumberFormat(this.locale).format(value);
    if (col.type === "currency") {
      return new Intl.NumberFormat(this.locale, {
        style: "currency", currency: this.currency, maximumFractionDigits: 2
      }).format(value);
    }
    return value;
  };

  /* ---------------- DOM ---------------- */
  PulliGrid.prototype._build = function () {
    var self = this;
    this.host.classList.add("pg");
    this.host.innerHTML = "";

    /* toolbar */
    var bar = el("div", "pg-toolbar");
    var search = el("input", "pg-search", { type: "search", placeholder: "Filter all columns", "aria-label": "Filter all columns" });
    search.addEventListener("input", function () { self.query = search.value; self.refresh(); });
    var count = el("span", "pg-count");
    var selInfo = el("span", "pg-selinfo");
    var chooserWrap = el("div", "pg-chooser-wrap");
    var chooserBtn = el("button", "btn btn-secondary btn-sm", { type: "button", "aria-expanded": "false", "aria-haspopup": "true" });
    chooserBtn.textContent = "Columns";
    var chooser = el("div", "pg-chooser", { role: "group", "aria-label": "Show columns", hidden: "" });
    chooserBtn.addEventListener("click", function () {
      var open = chooser.hasAttribute("hidden");
      if (open) { chooser.removeAttribute("hidden"); chooserBtn.setAttribute("aria-expanded", "true"); }
      else { chooser.setAttribute("hidden", ""); chooserBtn.setAttribute("aria-expanded", "false"); }
    });
    document.addEventListener("click", function (e) {
      if (!chooserWrap.contains(e.target)) { chooser.setAttribute("hidden", ""); chooserBtn.setAttribute("aria-expanded", "false"); }
    });
    this.columns.forEach(function (c) {
      var lab = el("label", "choice");
      var box = el("input", null, { type: "checkbox" });
      box.checked = true;
      box.addEventListener("change", function () {
        if (box.checked) self.hidden.delete(c.key); else self.hidden.add(c.key);
        self.refresh(true);
      });
      lab.appendChild(box); lab.appendChild(document.createTextNode(" " + c.label));
      chooser.appendChild(lab);
    });
    chooserWrap.appendChild(chooserBtn); chooserWrap.appendChild(chooser);
    bar.appendChild(search); bar.appendChild(count); bar.appendChild(selInfo); bar.appendChild(chooserWrap);

    /* scroll region */
    var scroll = el("div", "pg-scroll");
    var grid = el("div", "pg-grid", {
      role: "grid", tabindex: "0",
      "aria-label": this.host.getAttribute("data-label") || "Data grid",
      "aria-multiselectable": this.selectable ? "true" : "false"
    });
    var head = el("div", "pg-head", { role: "row" });
    var filters = el("div", "pg-filters", { role: "row" });
    var body = el("div", "pg-body", { role: "rowgroup" });
    grid.appendChild(head); grid.appendChild(filters); grid.appendChild(body);
    scroll.appendChild(grid);

    var live = el("div", "pg-live", { role: "status", "aria-live": "polite" });

    this.host.appendChild(bar); this.host.appendChild(scroll); this.host.appendChild(live);
    this.dom = { bar: bar, search: search, count: count, selInfo: selInfo, chooser: chooser,
                 scroll: scroll, grid: grid, head: head, filters: filters, body: body, live: live };

    scroll.addEventListener("scroll", function () {
      if (self._raf) return;
      self._raf = requestAnimationFrame(function () { self._raf = null; self._paint(); });
    });
    grid.addEventListener("keydown", function (e) { self._key(e); });
    grid.addEventListener("click", function (e) { self._click(e); });
  };

  PulliGrid.prototype._templateColumns = function () {
    var cols = this.visibleColumns();
    var parts = cols.map(function (c) { return c.width + "px"; });
    if (this.selectable) parts.unshift(SELECT_W + "px");
    return parts.join(" ");
  };

  /* frozen columns need a cumulative left offset */
  PulliGrid.prototype._offsets = function () {
    var cols = this.visibleColumns(), off = {}, x = this.selectable ? SELECT_W : 0;
    for (var i = 0; i < cols.length; i++) { off[cols[i].key] = x; x += cols[i].width; }
    return off;
  };

  PulliGrid.prototype.refresh = function (structural) {
    this.compute();
    this.host.style.setProperty("--pg-cols", this._templateColumns());
    this._head();
    this._filters();
    this._paint(true);
    var n = this.view.length, total = this.rows.length;
    this.dom.count.textContent = n === total ? total.toLocaleString() + " rows"
      : n.toLocaleString() + " of " + total.toLocaleString() + " rows";
    this._selInfo();
    if (structural) this._announce("Columns updated. " + this.visibleColumns().length + " shown.");
  };

  PulliGrid.prototype._selInfo = function () {
    var s = this.selected.size;
    this.dom.selInfo.textContent = s ? s.toLocaleString() + " selected" : "";
    this.dom.selInfo.classList.toggle("on", !!s);
  };

  PulliGrid.prototype._announce = function (msg) { this.dom.live.textContent = msg; };

  /* ---------------- header ---------------- */
  PulliGrid.prototype._head = function () {
    var self = this, cols = this.visibleColumns(), off = this._offsets(), h = "";
    var ci = 1;

    if (this.selectable) {
      var all = this.view.length > 0 && this.view.every(function (r) { return self.selected.has(r.id); });
      var some = !all && this.view.some(function (r) { return self.selected.has(r.id); });
      h += '<div class="pg-cell pg-select pg-frozen" role="columnheader" aria-colindex="1" style="left:0">' +
           '<label class="choice"><input type="checkbox" data-all ' + (all ? "checked" : "") +
           ' aria-label="Select all filtered rows"><span class="sr-only">Select all</span></label></div>';
      ci++;
    }
    cols.forEach(function (c) {
      var sorted = self.sort && self.sort.key === c.key;
      var aria = sorted ? (self.sort.dir === "asc" ? "ascending" : "descending") : (c.sortable ? "none" : null);
      h += '<div class="pg-cell pg-th' + (c.frozen ? " pg-frozen" : "") + '"' +
           ' role="columnheader" aria-colindex="' + ci + '"' +
           (aria ? ' aria-sort="' + aria + '"' : "") +
           ' data-key="' + c.key + '" style="text-align:' + c.align +
           (c.frozen ? ";left:" + off[c.key] + "px" : "") + '">' +
           (c.sortable
             ? '<button class="pg-sort" type="button" tabindex="-1" data-sort="' + c.key + '">' +
               esc(c.label) + '<span class="pg-dir" aria-hidden="true"></span></button>'
             : '<span class="pg-label">' + esc(c.label) + "</span>") +
           '<span class="pg-resize" role="separator" tabindex="-1" aria-orientation="vertical"' +
           ' aria-label="Resize ' + esc(c.label) + '" data-resize="' + c.key + '"></span>' +
           "</div>";
      ci++;
    });
    this.dom.head.innerHTML = h;
    this.dom.head.setAttribute("aria-rowindex", "1");
    this.dom.grid.setAttribute("aria-colcount", String(cols.length + (this.selectable ? 1 : 0)));
    this.dom.grid.setAttribute("aria-rowcount", String(this.view.length + 1));
    this._wireHeader();
  };

  PulliGrid.prototype._wireHeader = function () {
    var self = this;
    var all = this.dom.head.querySelector("[data-all]");
    if (all) {
      var sel = this.view.filter(function (r) { return self.selected.has(r.id); }).length;
      all.indeterminate = sel > 0 && sel < this.view.length;
      all.addEventListener("change", function () {
        if (all.checked) self.view.forEach(function (r) { self.selected.add(r.id); });
        else self.view.forEach(function (r) { self.selected.delete(r.id); });
        self._selInfo(); self._paint(true); self._head();
        self._announce(self.selected.size + " rows selected");
      });
    }
    this.dom.head.querySelectorAll("[data-resize]").forEach(function (handle) {
      var key = handle.getAttribute("data-resize");
      handle.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        var col = self.columns.filter(function (c) { return c.key === key; })[0];
        var startX = e.clientX, startW = col.width;
        handle.setPointerCapture(e.pointerId);
        function move(ev) {
          col.width = Math.max(col.minWidth, Math.round(startW + (ev.clientX - startX)));
          self.host.style.setProperty("--pg-cols", self._templateColumns());
          self._reposition();
        }
        function up() {
          handle.releasePointerCapture(e.pointerId);
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          self._announce(col.label + " column " + col.width + " pixels");
        }
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
      });
    });
  };

  /* frozen offsets change when a width changes */
  PulliGrid.prototype._reposition = function () {
    var off = this._offsets();
    this.host.querySelectorAll(".pg-frozen[data-key]").forEach(function (n) {
      n.style.left = off[n.getAttribute("data-key")] + "px";
    });
  };

  /* ---------------- filter row ---------------- */
  PulliGrid.prototype._filters = function () {
    var self = this, cols = this.visibleColumns(), off = this._offsets(), h = "";
    if (this.selectable) h += '<div class="pg-cell pg-select pg-frozen" style="left:0"></div>';
    cols.forEach(function (c) {
      h += '<div class="pg-cell' + (c.frozen ? " pg-frozen" : "") + '" data-key="' + c.key + '"' +
           (c.frozen ? ' style="left:' + off[c.key] + 'px"' : "") + ">" +
           (c.filterable
             ? '<input class="pg-filter" type="text" data-filter="' + c.key +
               '" value="' + esc(self.filters[c.key] || "") + '" aria-label="Filter ' + esc(c.label) + '" tabindex="-1">'
             : "") + "</div>";
    });
    this.dom.filters.innerHTML = h;
    this.dom.filters.setAttribute("aria-rowindex", "1");
    this.dom.filters.querySelectorAll("[data-filter]").forEach(function (input) {
      input.addEventListener("input", function () {
        self.filters[input.getAttribute("data-filter")] = input.value;
        var pos = input.selectionStart, key = input.getAttribute("data-filter");
        self.compute(); self._paint(true);
        self.dom.count.textContent = self.view.length.toLocaleString() + " of " + self.rows.length.toLocaleString() + " rows";
        self._head();
        var again = self.dom.filters.querySelector('[data-filter="' + key + '"]');
        if (again) { again.focus(); again.setSelectionRange(pos, pos); }
        self._announce(self.view.length + " rows match");
      });
    });
  };

  /* ---------------- body ---------------- */
  PulliGrid.prototype._paint = function (force) {
    var rh = this.rowHeight(), view = this.view, cols = this.visibleColumns(), off = this._offsets();
    var scroll = this.dom.scroll;
    var headH = this.dom.head.offsetHeight + this.dom.filters.offsetHeight;
    var top = scroll.scrollTop;
    var vh = scroll.clientHeight - headH;
    var start = Math.max(0, Math.floor(top / rh) - this.overscan);
    var end = Math.min(view.length, Math.ceil((top + vh) / rh) + this.overscan);

    if (!force && start === this._start && end === this._end) return;
    this._start = start; this._end = end;

    this.dom.body.style.height = (view.length * rh) + "px";

    var self = this, h = "";
    for (var i = start; i < end; i++) {
      var row = view[i], sel = this.selected.has(row.id), ci = 1;
      h += '<div class="pg-row' + (sel ? " is-selected" : "") + '" role="row"' +
           ' aria-rowindex="' + (i + 2) + '"' + (this.selectable ? ' aria-selected="' + sel + '"' : "") +
           ' data-i="' + i + '" style="top:' + (i * rh) + "px;height:" + rh + 'px">';
      if (this.selectable) {
        h += '<div class="pg-cell pg-select pg-frozen" role="gridcell" aria-colindex="1" style="left:0">' +
             '<label class="choice"><input type="checkbox" tabindex="-1" data-row="' + i + '" ' +
             (sel ? "checked" : "") + ' aria-label="Select row ' + (i + 1) + '"></label></div>';
        ci++;
      }
      for (var j = 0; j < cols.length; j++) {
        var c = cols[j], v = row[c.key];
        var cls = "pg-cell" + (c.frozen ? " pg-frozen" : "") + (c.type === "number" || c.type === "currency" ? " pg-num" : "");
        h += '<div class="' + cls + '" role="gridcell" aria-colindex="' + ci + '" data-key="' + c.key + '"' +
             ' style="text-align:' + c.align + (c.frozen ? ";left:" + off[c.key] + "px" : "") + '">' +
             (c.type === "status"
               ? '<span class="badge ' + esc(row[c.key + "Tone"] || "info") + '">' + esc(v) + "</span>"
               : esc(this.fmt(c, v))) + "</div>";
        ci++;
      }
      h += "</div>";
    }
    this.dom.body.innerHTML = h;

    this.dom.body.querySelectorAll("[data-row]").forEach(function (box) {
      box.addEventListener("change", function (e) {
        e.stopPropagation();
        self._toggle(parseInt(box.getAttribute("data-row"), 10), false);
      });
    });
    this._applyFocus();
  };

  /* ---------------- selection ---------------- */
  PulliGrid.prototype._toggle = function (i, range) {
    var row = this.view[i];
    if (!row) return;
    if (range && this.anchor != null) {
      var a = Math.min(this.anchor, i), b = Math.max(this.anchor, i);
      for (var k = a; k <= b; k++) this.selected.add(this.view[k].id);
    } else {
      if (this.selected.has(row.id)) this.selected.delete(row.id); else this.selected.add(row.id);
      this.anchor = i;
    }
    this._selInfo(); this._paint(true); this._head();
    this._announce(this.selected.size + " rows selected");
  };

  /* ---------------- sorting ---------------- */
  PulliGrid.prototype.toggleSort = function (key) {
    var col = this.columns.filter(function (c) { return c.key === key; })[0];
    if (!col || !col.sortable) return;
    if (!this.sort || this.sort.key !== key) this.sort = { key: key, dir: "asc" };
    else if (this.sort.dir === "asc") this.sort = { key: key, dir: "desc" };
    else this.sort = null;
    this.refresh();
    this._announce(this.sort ? col.label + " sorted " + (this.sort.dir === "asc" ? "ascending" : "descending")
                             : "Sorting cleared");
  };

  /* ---------------- interaction ---------------- */
  PulliGrid.prototype._click = function (e) {
    var sortBtn = e.target.closest("[data-sort]");
    if (sortBtn) { this.toggleSort(sortBtn.getAttribute("data-sort")); return; }
    var row = e.target.closest(".pg-row");
    if (row && !e.target.closest(".pg-select")) {
      var i = parseInt(row.getAttribute("data-i"), 10);
      var cell = e.target.closest(".pg-cell");
      if (cell) {
        var idx = Array.prototype.indexOf.call(row.children, cell);
        this.focus = { r: i + 1, c: idx };
        this._applyFocus();
      }
      if (e.shiftKey) this._toggle(i, true);
    }
  };

  PulliGrid.prototype._cellCount = function () {
    return this.visibleColumns().length + (this.selectable ? 1 : 0);
  };

  PulliGrid.prototype._key = function (e) {
    var rh = this.rowHeight(), max = this.view.length, cmax = this._cellCount() - 1;
    var f = this.focus, handled = true;
    var page = Math.max(1, Math.floor(this.dom.scroll.clientHeight / rh) - 1);

    switch (e.key) {
      case "ArrowDown":  f.r = Math.min(max, f.r + 1); break;
      case "ArrowUp":    f.r = Math.max(0, f.r - 1); break;
      case "ArrowRight": f.c = Math.min(cmax, f.c + 1); break;
      case "ArrowLeft":  f.c = Math.max(0, f.c - 1); break;
      case "Home":       if (e.ctrlKey || e.metaKey) { f.r = 0; } f.c = 0; break;
      case "End":        if (e.ctrlKey || e.metaKey) { f.r = max; } f.c = cmax; break;
      case "PageDown":   f.r = Math.min(max, f.r + page); break;
      case "PageUp":     f.r = Math.max(0, f.r - page); break;
      case " ":
        if (f.r > 0) this._toggle(f.r - 1, e.shiftKey);
        else { var b = this.dom.head.children[f.c] && this.dom.head.children[f.c].querySelector("[data-sort]"); if (b) b.click(); }
        break;
      case "Enter":
        if (f.r === 0) { var s = this.dom.head.children[f.c] && this.dom.head.children[f.c].querySelector("[data-sort]"); if (s) s.click(); }
        else if (this.onActivate) this.onActivate(this.view[f.r - 1]);
        break;
      default: handled = false;
    }
    if (!handled) return;
    e.preventDefault();
    this._scrollIntoView();
    this._applyFocus();
  };

  PulliGrid.prototype._scrollIntoView = function () {
    if (this.focus.r === 0) { this.dom.scroll.scrollTop = 0; this._paint(); return; }
    var rh = this.rowHeight(), i = this.focus.r - 1;
    var headH = this.dom.head.offsetHeight + this.dom.filters.offsetHeight;
    var top = this.dom.scroll.scrollTop, vh = this.dom.scroll.clientHeight - headH;
    if (i * rh < top) this.dom.scroll.scrollTop = i * rh;
    else if ((i + 1) * rh > top + vh) this.dom.scroll.scrollTop = (i + 1) * rh - vh;
    this._paint();
  };

  PulliGrid.prototype._applyFocus = function () {
    this.host.querySelectorAll(".pg-cell.is-focus").forEach(function (n) { n.classList.remove("is-focus"); });
    var rowEl = this.focus.r === 0 ? this.dom.head
      : this.dom.body.querySelector('.pg-row[data-i="' + (this.focus.r - 1) + '"]');
    if (!rowEl) return;
    var cell = rowEl.children[this.focus.c];
    if (cell) cell.classList.add("is-focus");
  };

  /* ---------------- public ---------------- */
  PulliGrid.prototype.setRows = function (rows) { this.rows = rows; this.selected.clear(); this.refresh(); };
  PulliGrid.prototype.getSelected = function () {
    var s = this.selected;
    return this.rows.filter(function (r) { return s.has(r.id); });
  };
  PulliGrid.prototype.clearSelection = function () { this.selected.clear(); this._selInfo(); this._paint(true); this._head(); };

  return PulliGrid;
});
