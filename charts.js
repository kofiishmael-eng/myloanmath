/**
 * Shared inline-SVG charts.
 *
 * No charting library. Every chart here is a handful of <rect> and <polyline>
 * elements built as a string, which means:
 *   - nothing extra to download on top of the 95 KB finance.js already loading
 *   - they print, because there is no canvas and no post-load layout
 *   - they inherit the site's CSS custom properties, so they follow the theme
 *
 * Every chart carries role="img" and an aria-label describing what it shows,
 * because a chart that is only decorative to a screen reader is worse than no
 * chart at all — it takes up space and conveys nothing.
 */
(function (window) {
  'use strict';

  var PALETTE = ['var(--accent)', 'var(--brass)', '#7B8F7E', '#B08968', '#9AA79B', '#C4B99A'];

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function money(n) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  /**
   * Horizontal stacked bar with a key beneath.
   * parts: [{ label, value }]  — zero and negative values are dropped.
   */
  function composition(parts, opts) {
    opts = opts || {};
    parts = parts.filter(function (p) { return p.value > 0; });
    var total = parts.reduce(function (s, p) { return s + p.value; }, 0);
    if (!parts.length || total <= 0) return '';

    var described = parts.map(function (p) {
      return p.label + ' ' + Math.round((p.value / total) * 100) + '%';
    }).join(', ');

    var bar = '<div class="comp-bar" role="img" aria-label="' + esc(opts.title || 'Breakdown') + ': ' + esc(described) + '">';
    parts.forEach(function (p, i) {
      var pct = (p.value / total) * 100;
      bar += '<span style="width:' + pct.toFixed(2) + '%;background:' + (p.color || PALETTE[i % PALETTE.length]) + ';"></span>';
    });
    bar += '</div><div class="comp-key">';
    parts.forEach(function (p, i) {
      bar += '<span><i style="background:' + (p.color || PALETTE[i % PALETTE.length]) + '"></i>' +
        esc(p.label) + ' ' + Math.round((p.value / total) * 100) + '%</span>';
    });
    return bar + '</div>';
  }

  /**
   * Two bars showing how one unit compares in size to another — the visual
   * answer to "how big is a kilogram compared to a pound".
   */
  function unitCompare(a, b, opts) {
    opts = opts || {};
    var max = Math.max(a.value, b.value);
    if (!(max > 0)) return '';
    var wa = (a.value / max) * 100, wb = (b.value / max) * 100;
    var ratio = a.value >= b.value ? (a.value / b.value) : (b.value / a.value);
    var bigger = a.value >= b.value ? a.label : b.label;
    var smaller = a.value >= b.value ? b.label : a.label;

    var label = 'One ' + bigger + ' is ' + (Math.round(ratio * 1000) / 1000) + ' times ' + smaller;
    var h = '<div class="unit-compare" role="img" aria-label="' + esc(label) + '">';
    [[a, wa, PALETTE[0]], [b, wb, PALETTE[1]]].forEach(function (row) {
      h += '<div class="uc-row"><span class="uc-label">' + esc(row[0].label) + '</span>' +
           '<span class="uc-track"><span class="uc-fill" style="width:' + row[1].toFixed(2) + '%;background:' + row[2] + '"></span></span>' +
           '<span class="uc-value">' + esc(row[0].display) + '</span></div>';
    });
    h += '</div><p class="uc-note">One ' + esc(bigger) + ' is about <strong>' +
      (Math.round(ratio * 1000) / 1000) + '&times;</strong> one ' + esc(smaller) + '.</p>';
    return h;
  }

  /**
   * Stacked column chart over time — contributions against growth, or
   * principal against interest.
   * rows: [{ label, parts:[v1, v2] }]
   */
  function stackedColumns(rows, seriesNames, opts) {
    opts = opts || {};
    if (!rows || !rows.length) return '';
    var max = 0;
    rows.forEach(function (r) {
      var t = r.parts.reduce(function (s, v) { return s + v; }, 0);
      if (t > max) max = t;
    });
    if (max <= 0) return '';

    var n = rows.length, w = 100 / n, gap = w * 0.18;
    var svg = '<svg viewBox="0 0 100 60" preserveAspectRatio="none" class="chart-svg" role="img" aria-label="' +
      esc(opts.title || 'Values over time') + ', ending at ' + money(max) + '">';
    rows.forEach(function (r, i) {
      var y = 60;
      r.parts.forEach(function (v, j) {
        if (v <= 0) return;
        var hgt = (v / max) * 58;
        y -= hgt;
        svg += '<rect x="' + (i * w + gap / 2).toFixed(2) + '" y="' + y.toFixed(2) +
          '" width="' + (w - gap).toFixed(2) + '" height="' + hgt.toFixed(2) +
          '" fill="' + PALETTE[j % PALETTE.length] + '" opacity="0.9"></rect>';
      });
    });
    svg += '</svg>';

    var key = '<div class="comp-key">';
    seriesNames.forEach(function (nm, j) {
      key += '<span><i style="background:' + PALETTE[j % PALETTE.length] + '"></i>' + esc(nm) + '</span>';
    });
    key += '</div>';

    var axis = '<div class="chart-axis"><span>' + esc(rows[0].label) + '</span><span>' +
      esc(rows[rows.length - 1].label) + '</span></div>';
    return '<div class="chart-wrap">' + svg + axis + key + '</div>';
  }

  /** Single declining line — a loan balance falling to zero. */
  function balanceLine(values, opts) {
    opts = opts || {};
    if (!values || values.length < 2) return '';
    var max = Math.max.apply(null, values);
    if (max <= 0) return '';
    var pts = values.map(function (v, i) {
      var x = (i / (values.length - 1)) * 100;
      var y = 58 - (v / max) * 56;
      return x.toFixed(2) + ',' + y.toFixed(2);
    }).join(' ');
    var area = '0,58 ' + pts + ' 100,58';
    var svg = '<svg viewBox="0 0 100 60" preserveAspectRatio="none" class="chart-svg" role="img" aria-label="' +
      esc(opts.title || 'Balance over time') + ', falling from ' + money(max) + ' to zero">' +
      '<polygon points="' + area + '" fill="var(--accent)" opacity="0.14"></polygon>' +
      '<polyline points="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="1.4" vector-effect="non-scaling-stroke"></polyline>' +
      '</svg>';
    var axis = '<div class="chart-axis"><span>' + esc(opts.startLabel || 'Start') + '</span><span>' +
      esc(opts.endLabel || 'Paid off') + '</span></div>';
    return '<div class="chart-wrap">' + svg + axis + '</div>';
  }

  window.Charts = {
    composition: composition,
    unitCompare: unitCompare,
    stackedColumns: stackedColumns,
    balanceLine: balanceLine,
    PALETTE: PALETTE
  };
})(window);
