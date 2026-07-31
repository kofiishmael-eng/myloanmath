/**
 * Recently Used Tools tracker.
 * Records which calculator pages a visitor has used, stored in localStorage
 * on their own device only — nothing is transmitted anywhere. Powers the
 * "Continue where you left off" section on the homepage.
 */
(function(window){
  var STORAGE_KEY = 'myloanmath_recent_tools';
  var MAX_ENTRIES = 5;

  function safeGet(key){
    try { return localStorage.getItem(key); } catch(e) { return null; }
  }
  function safeSet(key, value){
    try { localStorage.setItem(key, value); return true; } catch(e) { return false; }
  }

  function getRecentTools(){
    var raw = safeGet(STORAGE_KEY);
    if (!raw) return [];
    try {
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch(e) { return []; }
  }

  function recordVisit(url, title){
    var list = getRecentTools();
    // Remove any existing entry for this same page, so re-visiting bumps it to the top rather than duplicating
    list = list.filter(function(item){ return item.url !== url; });
    list.unshift({ url: url, title: title, visitedAt: new Date().toISOString() });
    if (list.length > MAX_ENTRIES) list = list.slice(0, MAX_ENTRIES);
    safeSet(STORAGE_KEY, JSON.stringify(list));
  }

  window.RecentTools = { recordVisit: recordVisit, getRecentTools: getRecentTools };
})(window);
