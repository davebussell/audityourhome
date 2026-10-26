/*
 * AuditYourHome glossary terms: tooltips and tap-to-define popovers for a.gl links, plus
 * window.AYHGloss.link(element) for content rendered in the browser. No dependencies.
 * Data: #gl-data (terms linked on this page, written by tools/glossary/link.mjs) and #gl-full
 * (every term and its patterns, from src/components/GlossaryRuntime.astro). The matching rules mirror
 * src/lib/glossary-patterns.mjs: keep the two in step.
 */
(function () {
  'use strict';
  if (window.AYHGloss) return;

  var defs = {};
  function readJSON(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent || 'null'); } catch (e) { return null; }
  }
  var data = readJSON('gl-data');
  if (data) for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) defs[k] = data[k];
  var full = readJSON('gl-full');
  if (full && full.terms) full.terms.forEach(function (x) { if (!defs[x.g]) defs[x.g] = { t: x.t, s: x.s, h: x.h, q: x.q }; });

  var mq = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
  function hoverable() { return !!(mq && mq.matches); }
  function matches(el, sel) { try { return el.matches(sel); } catch (e) { return false; } }
  function glFrom(t) { return t && t.closest ? t.closest('a.gl[data-gl]') : null; }

  var tip = null, tipFor = null, pop = null, popFor = null;

  function place(box, a) {
    var r = a.getBoundingClientRect();
    box.style.left = '0px';
    box.style.top = '0px';
    box.hidden = false;
    var bw = box.offsetWidth, bh = box.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var left = Math.max(8, Math.min(r.left, vw - bw - 8));
    var below = r.bottom + 8 + bh <= vh || r.top - 8 - bh < 0;
    var top = below ? r.bottom + 8 : r.top - 8 - bh;
    box.style.left = Math.round(left + window.pageXOffset) + 'px';
    box.style.top = Math.round(top + window.pageYOffset) + 'px';
    box.setAttribute('data-side', below ? 'below' : 'above');
  }

  function showTip(a) {
    var d = defs[a.getAttribute('data-gl')];
    if (!d || !d.s) return;
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'gl-tip';
      tip.id = 'gl-tip';
      tip.setAttribute('role', 'tooltip');
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    if (tipFor && tipFor !== a) tipFor.removeAttribute('aria-describedby');
    tip.textContent = d.s;
    tipFor = a;
    a.setAttribute('aria-describedby', 'gl-tip');
    place(tip, a);
  }
  function hideTip() {
    if (tip) tip.hidden = true;
    if (tipFor) tipFor.removeAttribute('aria-describedby');
    tipFor = null;
  }

  function openPop(a) {
    var d = defs[a.getAttribute('data-gl')];
    if (!d) return false;
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'gl-pop';
      pop.id = 'gl-pop';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-modal', 'false');
      pop.setAttribute('aria-labelledby', 'gl-pop-t');
      pop.setAttribute('aria-describedby', 'gl-pop-s');
      pop.hidden = true;
      var t = document.createElement('p'); t.className = 'gl-pop-t'; t.id = 'gl-pop-t';
      var s = document.createElement('p'); s.className = 'gl-pop-s'; s.id = 'gl-pop-s';
      var more = document.createElement('a'); more.className = 'gl-pop-more';
      var x = document.createElement('button'); x.type = 'button'; x.className = 'gl-pop-x'; x.setAttribute('aria-label', 'Close'); x.textContent = '×';
      x.addEventListener('click', function () { closePop(true); });
      pop.appendChild(t); pop.appendChild(s); pop.appendChild(more); pop.appendChild(x);
      document.body.appendChild(pop);
    }
    pop.querySelector('.gl-pop-t').textContent = d.t || a.textContent;
    pop.querySelector('.gl-pop-s').textContent = d.s || '';
    var link = pop.querySelector('.gl-pop-more');
    link.href = d.h || a.getAttribute('href');
    link.textContent = (d.q || 'What is ' + (d.t || a.textContent) + '?') + ' →';
    if (popFor && popFor !== a) popFor.removeAttribute('aria-expanded');
    popFor = a;
    a.setAttribute('aria-expanded', 'true');
    a.setAttribute('aria-controls', 'gl-pop');
    place(pop, a);
    return true;
  }
  function closePop(refocus) {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    if (popFor) {
      popFor.removeAttribute('aria-expanded');
      if (refocus && document.contains(popFor)) popFor.focus();
    }
    popFor = null;
  }

  document.addEventListener('mouseover', function (e) {
    if (!hoverable()) return;
    var a = glFrom(e.target);
    if (a && a !== tipFor) showTip(a);
  });
  document.addEventListener('mouseout', function (e) {
    if (!tipFor) return;
    var a = glFrom(e.target);
    if (a !== tipFor) return;
    var to = e.relatedTarget;
    if (!to || !tipFor.contains(to)) hideTip();
  });
  document.addEventListener('focusin', function (e) {
    var a = glFrom(e.target);
    if (a && (hoverable() || matches(a, ':focus-visible'))) showTip(a);
  });
  document.addEventListener('focusout', function (e) {
    if (glFrom(e.target) === tipFor) hideTip();
  });
  document.addEventListener('click', function (e) {
    var a = glFrom(e.target);
    if (a) {
      var touch = !hoverable() || (e.pointerType && e.pointerType !== 'mouse');
      if (!touch || e.metaKey || e.ctrlKey || e.shiftKey) return; // mouse or modified click: follow the link
      if (popFor === a && pop && !pop.hidden) { closePop(false); return; } // second tap: follow it
      if (openPop(a)) { e.preventDefault(); hideTip(); }
      return;
    }
    if (pop && !pop.hidden && !pop.contains(e.target)) closePop(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (pop && !pop.hidden) closePop(true);
      hideTip();
    }
  });
  window.addEventListener('resize', function () { hideTip(); closePop(false); });

  // ------------------------------------------------------------------ dynamic content
  var matchers = null;
  var B0 = '(?<![\\p{L}\\p{N}])', B1 = '(?![\\p{L}\\p{N}])', SEP = '[\\s\\u00a0\\-\\u2010\\u2011]';
  var ALNUM = null;
  function esc(s) { return s.replace(/[\\^$.*+?()[\]{}|\/]/g, '\\$&'); }
  function ciSrc(p) {
    var words = p.split(/[\s\u00a0\-\u2010\u2011]+/).filter(Boolean).map(esc);
    var src = words.join(SEP), last = p.charAt(p.length - 1);
    if (/[a-z]/i.test(last) && !/s$/i.test(p)) src += '(?:es|s)?';
    return (ALNUM.test(p.charAt(0)) ? B0 : '') + src + (ALNUM.test(last) ? B1 : '');
  }
  function csSrc(t) {
    var src = esc(t).replace(/ /g, '[\\s\\u00a0]');
    return (ALNUM.test(t.charAt(0)) ? B0 : '') + src + (ALNUM.test(t.charAt(t.length - 1)) ? B1 : '');
  }
  function buildMatchers() {
    if (matchers || !full || !full.terms) return matchers;
    var ci = {}, cs = {}, loose = [];
    function add(map, key, item) { (map[key] || (map[key] = [])).push(item); }
    try {
      ALNUM = new RegExp('[\\p{L}\\p{N}]', 'u');
      var first = new RegExp('^[\\p{L}\\p{N}]+', 'u');
      full.terms.forEach(function (x) {
        (x.ci || []).forEach(function (raw) {
          var p = raw.trim(), f = first.exec(p);
          var item = { slug: x.g, re: new RegExp(ciSrc(p), f ? 'iuy' : 'giu'), w: p.length };
          if (!f) { loose.push(item); return; }
          var key = f[0].toLowerCase();
          add(ci, key, item);
          if (f[0].length === p.length && /[a-z]$/i.test(p) && !/s$/i.test(p)) { add(ci, key + 's', item); add(ci, key + 'es', item); }
        });
        (x.cs || []).forEach(function (raw) {
          var t = raw.trim(), f = first.exec(t);
          var item = { slug: x.g, re: new RegExp(csSrc(t), f ? 'uy' : 'gu'), w: t.length };
          if (f) add(cs, f[0], item); else loose.push(item);
        });
        (x.re || []).forEach(function (src) { loose.push({ slug: x.g, re: new RegExp(src, 'gu'), w: 5 }); });
      });
    } catch (e) {
      return null; // an engine without lookbehind or \p{}: no dynamic linking, tooltips still work
    }
    [ci, cs].forEach(function (map) { for (var k in map) map[k].sort(function (a, b) { return b.w - a.w; }); });
    matchers = { ci: ci, cs: cs, loose: loose, tokens: new RegExp('[\\p{L}\\p{N}]+', 'gu') };
    return matchers;
  }
  function tryList(list, text, at, out) {
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      c.re.lastIndex = at;
      var m = c.re.exec(text);
      if (m && m.index === at && m[0].length) { out.push({ start: at, end: at + m[0].length, slug: c.slug }); return; }
    }
  }
  function find(text, m, used) {
    var all = [], t;
    var tok = m.tokens;
    tok.lastIndex = 0;
    while ((t = tok.exec(text))) {
      if (Object.prototype.hasOwnProperty.call(m.ci, t[0].toLowerCase())) tryList(m.ci[t[0].toLowerCase()], text, t.index, all);
      if (Object.prototype.hasOwnProperty.call(m.cs, t[0])) tryList(m.cs[t[0]], text, t.index, all);
    }
    m.loose.forEach(function (l) {
      l.re.lastIndex = 0;
      var x;
      while ((x = l.re.exec(text))) {
        if (!x[0].length) { l.re.lastIndex++; continue; }
        all.push({ start: x.index, end: x.index + x[0].length, slug: l.slug });
      }
    });
    if (!all.length) return all;
    all.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    var out = [], lastEnd = -1;
    all.forEach(function (c) {
      if (c.start < lastEnd) return;
      lastEnd = c.end;
      if (used[c.slug] || !defs[c.slug]) return;
      used[c.slug] = 1;
      out.push(c);
    });
    return out;
  }
  var SKIP = 'a,button,label,select,option,textarea,input,script,style,code,pre,svg,summary,h1,h2,h3,h4,h5,h6,' +
    'nav,header,footer,legend,dialog,[data-no-gloss],.no-gloss,.sr-only,.eyebrow,.chip,.btn,.name,.pname,.rb-name,.ap-name,[aria-hidden="true"]';

  /** Link the first use of each term inside root that isn't linked anywhere on the page yet. */
  function link(root) {
    var m = buildMatchers();
    if (!m || !root) return 0;
    var used = {};
    Array.prototype.forEach.call(document.querySelectorAll('a.gl[data-gl]'), function (a) { used[a.getAttribute('data-gl')] = 1; });
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!/[A-Za-z0-9]/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        return !p || p.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    var count = 0;
    nodes.forEach(function (node) {
      var text = node.nodeValue;
      var hits = find(text, m, used);
      if (!hits.length) return;
      var frag = document.createDocumentFragment(), pos = 0;
      hits.forEach(function (h) {
        if (h.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, h.start)));
        var a = document.createElement('a');
        a.className = 'gl';
        a.href = defs[h.slug].h;
        a.setAttribute('data-gl', h.slug);
        a.textContent = text.slice(h.start, h.end);
        frag.appendChild(a);
        pos = h.end;
        count++;
      });
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    });
    return count;
  }

  /** Link an element now and again whenever its content changes (debounced). */
  function watch(elm) {
    if (!window.MutationObserver) { link(elm); return; }
    var timer = null;
    var obs = new MutationObserver(function () { if (!timer) timer = setTimeout(run, 250); });
    function run() {
      timer = null;
      obs.disconnect();
      link(elm);
      obs.observe(elm, { childList: true, subtree: true, characterData: true });
    }
    run();
  }

  var fullEl = document.getElementById('gl-full');
  var live = fullEl && fullEl.getAttribute('data-live');
  if (live) {
    try { Array.prototype.forEach.call(document.querySelectorAll(live), watch); } catch (e) { /* bad selector */ }
  }

  window.AYHGloss = { link: link, watch: watch, define: function (slug) { return defs[slug] || null; } };
})();
