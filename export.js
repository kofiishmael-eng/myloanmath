/**
 * CSV export for calculator schedules.
 *
 * Entirely client-side: the file is built as a Blob and handed to the browser
 * via an object URL. Nothing is uploaded, which keeps the site's "your figures
 * never leave your device" property intact — a server-side export would quietly
 * break the one privacy claim the site makes structurally rather than by policy.
 *
 * Two details that are easy to get wrong:
 *
 *  - Excel will not read a UTF-8 CSV correctly without a byte-order mark, so
 *    one is prepended. Without it, currency symbols and accented characters
 *    come out mangled in the application most people will open this in.
 *
 *  - Fields containing a comma, quote or newline must be wrapped in quotes with
 *    internal quotes doubled. A schedule row like "Aug 2026, payment 1" would
 *    otherwise split into two columns.
 */
(function (window, document) {
  'use strict';

  function escapeCell(value) {
    if (value === null || value === undefined) return '';
    var s = String(value);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /** rows: array of arrays. The first row is treated as the header. */
  function toCsv(rows) {
    return rows.map(function (row) {
      return row.map(escapeCell).join(',');
    }).join('\r\n');
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function download(filename, rows, meta) {
    var out = [];
    if (meta && meta.length) {
      meta.forEach(function (line) { out.push([line]); });
      out.push([]);
    }
    out = out.concat(rows);

    // \ufeff is the byte-order mark Excel needs to read this as UTF-8.
    var blob = new Blob(['\ufeff' + toCsv(out)], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/[^a-zA-Z0-9._-]/g, '-') + '-' + today() + '.csv';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // revoke on the next tick, otherwise Safari can cancel the download
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /**
   * Wire a button. getRows() returns { rows, meta } at click time rather than
   * at wiring time, so the export always reflects the current inputs rather
   * than whatever was on screen when the page loaded.
   */
  function attach(buttonId, filename, getRows) {
    var btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var original = btn.textContent;
      try {
        var data = getRows();
        if (!data || !data.rows || !data.rows.length) throw new Error('nothing to export');
        download(filename, data.rows, data.meta);
        btn.textContent = 'Downloaded';
      } catch (e) {
        btn.textContent = 'Nothing to export';
      }
      setTimeout(function () { btn.textContent = original; }, 1800);
    });
  }

  window.CsvExport = { attach: attach, download: download, toCsv: toCsv };
})(window, document);
