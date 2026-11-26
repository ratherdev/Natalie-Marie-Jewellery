/**
 * Gift with purchase (GWP)
 *
 * Campaigns come from [data-gwp-config] (snippets/gwp-block.liquid): up to 3 campaigns set in the
 * theme customizer (Theme settings > Gift with purchase) plus optional `gwp_campaign` metaobjects.
 *
 * - Scheduling: a campaign runs when it's on and the current time (Sydney, checked in the browser)
 *   is between its start and end. Cached pages don't delay a start or end.
 * - Mode "priority": only the highest-priority running campaign shows. Mode "tiers": every running
 *   campaign shows, and each one whose threshold is reached adds its own gift.
 * - Gifts: a gift product, or the first in-stock product from a gift collection (e.g. an automated
 *   collection of products tagged gwp-gift), so a second gift takes over when the first sells out.
 * - Tags: "only count" / "never count" product tags decide which bag items count toward a threshold.
 * - syncGift() adds or removes gifts so the cart matches, with property `_gwp: <campaign handle>`.
 *   It hooks into the theme's existing cart (theme.js CartSection) and never replaces the drawer:
 *   it runs when the cart markup is re-rendered, on page load and when the drawer opens, and after
 *   changing the cart it fires the theme's own `cart:refresh` event.
 * - Testing on a copy theme: ?gwp_now=2026-11-25T09:00 (Sydney) simulates the time. Ignored on the
 *   live theme.
 */
(function () {
  'use strict';

  var GIFT_PROPERTY = '_gwp';
  var MAX_STEPS = 8; // upper bound on cart writes per sync, so a bad state can never loop
  var running = false;
  var queued = false;
  var soldOut = {}; // variant ids that /cart/add.js refused during this page view

  /* ---------- config ---------- */

  function rootUrl() {
    return (window.routes && window.routes.rootUrlWithoutSlash) || '';
  }

  function readConfig() {
    var el = document.querySelector('[data-gwp-config]');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      if (window.console) console.warn('[gwp] config is not valid JSON', e);
      return null;
    }
  }

  function cleanTags(list) {
    return (list || []).map(function (t) { return String(t).trim().toLowerCase(); })
      .filter(function (t) { return t; });
  }

  /* ---------- time ---------- */

  function tzOffsetMinutes(ts, tz) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(new Date(ts));
      var m = {};
      parts.forEach(function (p) { m[p.type] = p.value; });
      var asUtc = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour % 24, +m.minute, +m.second);
      return (asUtc - ts) / 60000;
    } catch (e) {
      return 0;
    }
  }

  // "YYYY-MM-DD HH:MM" (or "YYYY-MM-DD") in the shop's timezone -> seconds since epoch.
  // Blank -> null (no limit). Unreadable -> NaN (campaign treated as not running).
  function parseLocal(value, tz, endOfDay) {
    if (value === null || value === undefined || value === '') return null;
    var m = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
    if (!m) return NaN;
    var hasTime = m[4] !== undefined;
    var h = hasTime ? +m[4] : (endOfDay ? 23 : 0);
    var mi = hasTime ? +m[5] : (endOfDay ? 59 : 0);
    var s = !hasTime && endOfDay ? 59 : 0;
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], h, mi, s);
    var ts = guess;
    for (var i = 0; i < 2; i++) ts = guess - tzOffsetMinutes(ts, tz) * 60000;
    return ts / 1000;
  }

  function isLiveTheme() {
    return !(window.Shopify && window.Shopify.theme) || window.Shopify.theme.role === 'main';
  }

  function nowSeconds(config) {
    if (!isLiveTheme()) {
      var override = new URLSearchParams(window.location.search).get('gwp_now');
      if (override) {
        var t = parseLocal(override, config.timezone, false);
        if (t === t && t !== null) return t; // not NaN
      }
    }
    return Date.now() / 1000;
  }

  function window_(c, config) {
    var start = c.startAt != null ? c.startAt : parseLocal(c.start, config.timezone, false);
    var end = c.endAt != null ? c.endAt : parseLocal(c.end, config.timezone, true);
    return { start: start, end: end };
  }

  /* ---------- campaigns ---------- */

  function runningCampaigns(config) {
    var now = nowSeconds(config);
    var live = (config.campaigns || []).filter(function (c) {
      if (!c || c.active !== true || !(Number(c.threshold) > 0)) return false;
      var w = window_(c, config);
      if (w.start !== w.start || w.end !== w.end) { // NaN: unreadable date
        if (window.console) console.warn('[gwp] unreadable start/end for', c.handle, c.start, c.end);
        return false;
      }
      return (w.start === null || now >= w.start) && (w.end === null || now < w.end);
    });
    live.sort(function (a, b) { return (Number(b.priority) || 0) - (Number(a.priority) || 0); });
    if (config.mode === 'tiers') {
      return live.sort(function (a, b) { return Number(a.threshold) - Number(b.threshold); });
    }
    return live.slice(0, 1);
  }

  function allGiftIds(config) {
    var ids = {};
    (config.campaigns || []).forEach(function (c) {
      (c && c.gifts || []).forEach(function (g) { if (g && g.variantId) ids[g.variantId] = true; });
    });
    return ids;
  }

  function availableGifts(c) {
    return (c.gifts || []).filter(function (g) {
      return g && g.variantId && g.available && !soldOut[g.variantId];
    });
  }

  /* ---------- money ---------- */

  function rate() {
    var r = window.Shopify && window.Shopify.currency && parseFloat(window.Shopify.currency.rate);
    return r > 0 ? r : 1;
  }

  function currencyCode() {
    return (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'AUD';
  }

  // Threshold is set in shop currency (AUD dollars); cart amounts are in presentment-currency cents.
  function thresholdCents(c) {
    return Math.round(Number(c.threshold) * 100 * rate());
  }

  function formatMoney(cents, withCode) {
    var amount = cents / 100;
    var whole = Math.round(amount * 100) % 100 === 0;
    var text = '$' + amount.toLocaleString('en-AU', {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2
    });
    return withCode === false ? text : text + ' ' + currencyCode();
  }

  /* ---------- cart maths ---------- */

  function makeIsGift(config) {
    var ids = allGiftIds(config);
    return function (item) {
      return !!(item.properties && item.properties[GIFT_PROPERTY]) || !!ids[item.variant_id];
    };
  }

  function counts(item, c, config) {
    var tags = cleanTags((config.lines || {})[item.key]);
    var include = cleanTags(c.includeTags);
    var exclude = cleanTags(c.excludeTags);
    if (include.length && !include.some(function (t) { return tags.indexOf(t) > -1; })) return false;
    if (exclude.some(function (t) { return tags.indexOf(t) > -1; })) return false;
    return true;
  }

  // "after": what the customer pays for the counted items, after line discounts (NMJ15) and their
  // share of any order-level discount. With no tag rules this equals the cart subtotal.
  // "before": original line prices of the counted items, before any discount.
  function basisCents(cart, c, config, isGift) {
    var basis = c.thresholdBasis || config.basisDefault || 'after';
    var items = cart.items.filter(function (i) { return !isGift(i); });
    var counted = items.filter(function (i) { return counts(i, c, config); });
    var sum = function (list, key) { return list.reduce(function (t, i) { return t + (i[key] || 0); }, 0); };

    if (basis === 'before') return sum(counted, 'original_line_price');

    var allFinal = sum(items, 'final_line_price');
    var countedFinal = sum(counted, 'final_line_price');
    var orderDiscount = (cart.cart_level_discount_applications || []).reduce(function (t, d) {
      return t + (d.total_allocated_amount || 0);
    }, 0);
    var share = allFinal > 0 ? orderDiscount * (countedFinal / allFinal) : 0;
    return Math.max(0, Math.round(countedFinal - share));
  }

  function plan(cart, config) {
    var isGift = makeIsGift(config);
    var hasItems = cart.items.some(function (i) { return !isGift(i); });
    var states = runningCampaigns(config).map(function (c) {
      var options = availableGifts(c);
      var existing = cart.items.filter(function (i) {
        return i.properties && i.properties[GIFT_PROPERTY] === c.handle;
      })[0];
      var gift = existing && options.filter(function (o) { return o.variantId === existing.variant_id; })[0];
      gift = gift || options[0] || null;
      var threshold = thresholdCents(c);
      var basis = basisCents(cart, c, config, isGift);
      var qty = 0;
      if (hasItems && gift && basis >= threshold) {
        qty = config.onePerOrder === false ? Math.max(1, Math.floor(basis / threshold)) : 1;
      }
      return { campaign: c, gift: gift, threshold: threshold, basis: basis, qty: qty };
    });
    return { states: states, isGift: isGift, hasItems: hasItems };
  }

  // The next single cart write needed, or null when the cart is correct.
  function nextAction(cart, p) {
    var want = {};
    p.states.forEach(function (s) {
      if (s.qty > 0) want[s.campaign.handle] = { variantId: s.gift.variantId, qty: s.qty };
    });

    var seen = {};
    var giftLines = cart.items.filter(p.isGift);
    for (var n = 0; n < giftLines.length; n++) {
      var line = giftLines[n];
      var handle = line.properties && line.properties[GIFT_PROPERTY];
      var w = handle && want[handle];
      // Remove gifts no longer earned, from ended campaigns, added without the property
      // (direct links), the wrong gift product, or duplicates.
      if (!w || line.variant_id !== w.variantId || seen[handle]) {
        return { type: 'change', id: line.key, quantity: 0 };
      }
      seen[handle] = line;
    }

    var handles = Object.keys(want);
    for (var h = 0; h < handles.length; h++) {
      var key = handles[h];
      if (seen[key] && seen[key].quantity !== want[key].qty) {
        return { type: 'change', id: seen[key].key, quantity: want[key].qty };
      }
      if (!seen[key]) {
        return { type: 'add', variantId: want[key].variantId, quantity: want[key].qty, handle: key };
      }
    }
    return null;
  }

  /* ---------- cart API ---------- */

  function fetchCart() {
    return fetch(rootUrl() + '/cart.js', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    }).then(function (r) { return r.json(); });
  }

  function post(path, body) {
    return fetch(rootUrl() + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(body)
    });
  }

  function apply(action) {
    if (action.type === 'change') {
      return post('/cart/change.js', { id: action.id, quantity: action.quantity });
    }
    var properties = {};
    properties[GIFT_PROPERTY] = action.handle;
    return post('/cart/add.js', {
      items: [{ id: action.variantId, quantity: action.quantity, properties: properties }]
    }).then(function (res) {
      if (!res.ok) soldOut[action.variantId] = true; // 422 = sold out or unavailable
      return res;
    });
  }

  /* ---------- rendering ---------- */

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Escapes the text, fills the tokens, then turns *words* into <em>words</em>.
  function richText(template, tokens) {
    var html = escapeHtml(template);
    Object.keys(tokens).forEach(function (key) {
      html = html.split('{' + key + '}').join(tokens[key]);
    });
    return html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }

  function campaignHtml(s, cart, config) {
    var c = s.campaign;
    var unlocked = s.qty > 0 && cart.items.some(function (i) {
      return i.variant_id === s.gift.variantId && i.properties && i.properties[GIFT_PROPERTY] === c.handle;
    });
    var pct = Math.min(100, Math.max(0, (s.basis / s.threshold) * 100));
    var giftName = s.gift.title || 'gift';
    var tokens = {
      remaining: escapeHtml(formatMoney(Math.max(0, s.threshold - s.basis))),
      threshold: escapeHtml(formatMoney(s.threshold)),
      gift: escapeHtml(giftName.toLowerCase())
    };
    var headline = unlocked
      ? richText(c.messageUnlocked || 'You’ve unlocked a complimentary *{gift}*', tokens)
      : richText(c.messageProgress || 'Spend {remaining} more to receive a complimentary *{gift}*', tokens);

    var lines = unlocked
      ? ['Complimentary · Added to your bag']
      : ['Complimentary with orders over ' + formatMoney(s.threshold), 'Limited availability, while stocks last'];
    if (unlocked && c.personalisationRequired && config.personalisationNote) {
      lines.push(config.personalisationNote);
    }

    return '<div class="Gwp__Campaign" data-gwp-campaign="' + escapeHtml(c.handle) + '">' +
      (c.label ? '<p class="Gwp__Label">' + escapeHtml(c.label) + '</p>' : '') +
      '<p class="Gwp__Headline">' + headline + '</p>' +
      '<div class="Gwp__Bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '">' +
        '<span class="Gwp__BarFill" style="width:' + pct + '%"></span>' +
      '</div>' +
      '<div class="Gwp__BarLabels"><span>' + escapeHtml(formatMoney(0, false)) + '</span><span>' + tokens.threshold + '</span></div>' +
      '<div class="Gwp__Gift">' +
        '<div class="Gwp__Thumb">' + (s.gift.image ? '<img src="' + escapeHtml(s.gift.image) + '" alt="" loading="lazy" width="96" height="96">' : '') + '</div>' +
        '<div class="Gwp__GiftInfo">' +
          '<p class="Gwp__GiftName">' + escapeHtml(giftName) + '</p>' +
          lines.map(function (l) { return '<p class="Gwp__GiftText">' + escapeHtml(l) + '</p>'; }).join('') +
          '<span class="Gwp__Tag">' + (unlocked ? '✓ Added to bag' : 'Unlocks at ' + tokens.threshold) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function render(cart, config) {
    var p = plan(cart, config);
    var visible = p.hasItems ? p.states.filter(function (s) { return s.gift; }) : [];
    var blocks = document.querySelectorAll('[data-gwp]');
    for (var b = 0; b < blocks.length; b++) {
      var block = blocks[b];
      var inner = block.querySelector('[data-gwp-inner]');
      block.setAttribute('data-gwp-ready', '');
      if (!visible.length || !inner) {
        block.hidden = true;
        continue;
      }
      inner.innerHTML = visible.map(function (s) { return campaignHtml(s, cart, config); }).join('');
      block.hidden = false;
    }
  }

  /* ---------- sync ---------- */

  function refreshTheme() {
    document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
  }

  function syncGift() {
    if (running) {
      queued = true;
      return Promise.resolve();
    }
    var config = readConfig();
    if (!config) return Promise.resolve();

    running = true;
    var changed = false;
    var steps = 0;

    function step() {
      return fetchCart().then(function (cart) {
        var action = steps < MAX_STEPS ? nextAction(cart, plan(cart, config)) : null;
        if (!action) {
          render(cart, config);
          return null;
        }
        steps++;
        changed = true;
        return apply(action).then(step);
      });
    }

    return step()
      .catch(function (e) {
        if (window.console) console.warn('[gwp] sync failed', e);
      })
      .then(function () {
        running = false;
        if (changed) {
          refreshTheme(); // the re-render triggers one more (no-op) sync via the observer
        } else if (queued) {
          queued = false;
          syncGift();
        }
      });
  }

  // Run when the theme swaps in new cart markup (drawer and /cart page) that hasn't been rendered.
  var timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(syncGift, 50);
  }

  function observe() {
    var roots = document.querySelectorAll('#sidebar-cart, [data-section-type="cart"]');
    if (!roots.length || !window.MutationObserver) return;
    var observer = new MutationObserver(function () {
      if (document.querySelector('[data-gwp]:not([data-gwp-ready])')) schedule();
    });
    for (var i = 0; i < roots.length; i++) {
      observer.observe(roots[i], { childList: true, subtree: true });
    }
  }

  function init() {
    observe();
    syncGift();
    document.addEventListener('click', function (e) {
      var opener = e.target.closest && e.target.closest('[data-action="open-drawer"][data-drawer-id="sidebar-cart"]');
      if (opener) schedule();
    });
  }

  window.NMJGwp = { syncGift: syncGift };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
