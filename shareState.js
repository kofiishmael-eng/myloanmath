/**
 * Shareable / bookmarkable calculator state.
 *
 * Encodes a calculator's inputs into the page URL's query string so a scenario
 * can be bookmarked or sent to someone else. Everything happens in the browser
 * — no data is transmitted anywhere, the URL is simply rewritten in place.
 *
 * Security note: the incoming URL is untrusted (anyone can craft a link and
 * send it to someone). Values are only ever assigned to element .value — never
 * to innerHTML — and every value is validated against the target element's own
 * type before being applied. Unknown parameters are ignored entirely.
 *
 * Usage on a calculator page, AFTER that page's own script has registered its
 * input listeners:
 *
 *   ShareState.init({
 *     buttonId: 'loanShareBtn',
 *     fields: { amount: 'loanPrincipal', rate: 'loanRate' }   // param -> element id
 *   });
 */
(function (window, document) {
  'use strict';

  // Accepts plain numbers with optional sign, thousands separators, and decimals.
  // Deliberately strict: anything else is discarded rather than "cleaned up".
  var NUMERIC = /^-?[0-9]{1,3}(,[0-9]{3})*(\.[0-9]+)?$|^-?[0-9]*(\.[0-9]+)?$/;
  var MAX_VALUE_LENGTH = 20;
  var MAX_PARAMS = 30;

  function isNumericField(elementNode) {
    var type = (elementNode.getAttribute('type') || 'text').toLowerCase();
    return elementNode.tagName === 'INPUT' && (type === 'text' || type === 'number');
  }

  function isCheckbox(elementNode) {
    return elementNode.tagName === 'INPUT' && (elementNode.getAttribute('type') || '').toLowerCase() === 'checkbox';
  }

  /** Returns true only if the value is safe and meaningful for this element. */
  function isAcceptable(elementNode, rawValue) {
    if (typeof rawValue !== 'string') return false;
    if (rawValue.length === 0 || rawValue.length > MAX_VALUE_LENGTH) return false;

    if (elementNode.tagName === 'SELECT') {
      // Only accept a value that is actually one of this select's own options.
      for (var i = 0; i < elementNode.options.length; i++) {
        if (elementNode.options[i].value === rawValue) return true;
      }
      return false;
    }
    if (isCheckbox(elementNode)) {
      return rawValue === '0' || rawValue === '1';
    }
    if (isNumericField(elementNode)) {
      return NUMERIC.test(rawValue) && /[0-9]/.test(rawValue);
    }
    return false;
  }

  function readValue(elementNode) {
    if (isCheckbox(elementNode)) return elementNode.checked ? '1' : '0';
    return elementNode.value;
  }

  function writeValue(elementNode, rawValue) {
    if (isCheckbox(elementNode)) elementNode.checked = (rawValue === '1');
    else elementNode.value = rawValue;
  }

  function fireChange(elementNode) {
    // Calculator pages listen on 'input', 'change', or both — send both so the
    // page recalculates exactly as if the visitor had typed the value.
    ['input', 'change'].forEach(function (eventName) {
      var evt;
      try {
        evt = new window.Event(eventName, { bubbles: true });
      } catch (e) {
        evt = document.createEvent('Event');
        evt.initEvent(eventName, true, false);
      }
      elementNode.dispatchEvent(evt);
    });
  }

  function currentParams() {
    var search = window.location.search;
    var out = {};
    if (!search || search.length < 2) return out;
    var pairs = search.slice(1).split('&');
    var count = Math.min(pairs.length, MAX_PARAMS);
    for (var i = 0; i < count; i++) {
      var eq = pairs[i].indexOf('=');
      if (eq < 1) continue;
      try {
        var key = decodeURIComponent(pairs[i].slice(0, eq).replace(/\+/g, ' '));
        var val = decodeURIComponent(pairs[i].slice(eq + 1).replace(/\+/g, ' '));
        out[key] = val;
      } catch (e) { /* malformed percent-encoding — skip this pair */ }
    }
    return out;
  }

  function buildQuery(fields) {
    var parts = [];
    Object.keys(fields).forEach(function (param) {
      var node = document.getElementById(fields[param]);
      if (!node) return;
      var value = readValue(node);
      if (value === '' || value === null || typeof value === 'undefined') return;
      parts.push(encodeURIComponent(param) + '=' + encodeURIComponent(value));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function shareUrl(fields) {
    return window.location.origin + window.location.pathname + buildQuery(fields);
  }

  function copyText(text) {
    if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
      return window.navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var scratch = document.createElement('textarea');
        scratch.value = text;
        scratch.setAttribute('readonly', '');
        scratch.style.position = 'fixed';
        scratch.style.top = '-1000px';
        document.body.appendChild(scratch);
        scratch.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(scratch);
        ok ? resolve() : reject(new Error('copy rejected'));
      } catch (err) { reject(err); }
    });
  }

  function init(config) {
    if (!config || !config.fields) return;
    var fields = config.fields;
    var applied = 0;

    // 1. Apply any inputs supplied in the URL.
    var incoming = currentParams();
    Object.keys(fields).forEach(function (param) {
      if (!Object.prototype.hasOwnProperty.call(incoming, param)) return;
      var node = document.getElementById(fields[param]);
      if (!node) return;
      var value = incoming[param];
      if (!isAcceptable(node, value)) return;
      writeValue(node, value);
      fireChange(node);
      applied++;
    });

    // 2. Keep the address bar in step with the current inputs, so "bookmark this
    //    page" captures whatever is on screen. replaceState (not pushState) so
    //    typing doesn't fill up the back button.
    var syncTimer = null;
    function syncUrl() {
      if (!window.history || !window.history.replaceState) return;
      try {
        window.history.replaceState(null, '', window.location.pathname + buildQuery(fields));
      } catch (e) { /* file:// or a blocked history API — sharing still works via the button */ }
    }
    function scheduleSync() {
      if (syncTimer) window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(syncUrl, 400);
    }
    Object.keys(fields).forEach(function (param) {
      var node = document.getElementById(fields[param]);
      if (!node) return;
      node.addEventListener('input', scheduleSync);
      node.addEventListener('change', scheduleSync);
    });

    // 3. Wire the copy-link button.
    var button = config.buttonId ? document.getElementById(config.buttonId) : null;
    if (button) {
      var idleLabel = button.textContent;
      button.addEventListener('click', function () {
        var url = shareUrl(fields);
        copyText(url).then(function () {
          button.textContent = 'Link copied!';
        })['catch'](function () {
          // Clipboard blocked (common on insecure origins) — put the link on
          // screen so it can still be copied by hand.
          button.textContent = 'Copy failed';
          window.prompt('Copy this link:', url);
        });
        window.setTimeout(function () { button.textContent = idleLabel; }, 1800);
      });
    }

    return { applied: applied, shareUrl: function () { return shareUrl(fields); }, syncUrl: syncUrl };
  }

  window.ShareState = { init: init };
})(window, document);
