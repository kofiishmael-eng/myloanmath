/**
 * Inline help tooltips for calculator inputs.
 *
 * Usage: give any label a data-help attribute and this attaches a button after
 * the label text. No markup duplication, and pages that don't use it pay
 * nothing beyond one small script.
 *
 *   <label for="homePrice" data-help="What the seller is asking...">Home price</label>
 *
 * Built as a <button> with aria-expanded and a linked panel rather than a
 * title= attribute, because title text is unreachable by keyboard, invisible on
 * touch devices, and not announced reliably by screen readers.
 */
(function (window, document) {
  'use strict';

  var counter = 0;

  function closeAll(except) {
    var open = document.querySelectorAll('.help-panel.is-open');
    Array.prototype.forEach.call(open, function (panel) {
      if (panel === except) return;
      panel.classList.remove('is-open');
      var btn = document.getElementById(panel.getAttribute('data-owner'));
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function attach(label) {
    var text = label.getAttribute('data-help');
    if (!text) return;

    counter++;
    var btnId = 'help-btn-' + counter;
    var panelId = 'help-panel-' + counter;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'help-toggle';
    btn.id = btnId;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', panelId);
    // The accessible name has to say what it explains, or a screen-reader user
    // hears a row of buttons all called "help".
    btn.setAttribute('aria-label', 'What is ' + label.textContent.trim() + '?');
    btn.textContent = '?';

    var panel = document.createElement('div');
    panel.className = 'help-panel';
    panel.id = panelId;
    panel.setAttribute('data-owner', btnId);
    panel.setAttribute('role', 'note');
    panel.textContent = text;

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var isOpen = panel.classList.contains('is-open');
      closeAll(panel);
      panel.classList.toggle('is-open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });

    label.appendChild(btn);
    // the panel sits after the whole field so it can span the full width
    var field = label.parentNode;
    field.appendChild(panel);
  }

  function init() {
    var labels = document.querySelectorAll('label[data-help]');
    Array.prototype.forEach.call(labels, attach);

    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('.help-toggle, .help-panel')) closeAll(null);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll(null);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.HelpTips = { init: init };
})(window, document);
