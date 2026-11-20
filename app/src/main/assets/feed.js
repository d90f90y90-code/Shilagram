/* ShilaFeed — RSS/Atom reader helpers. Pure parsing + CORS-aware fetching.
   No feed content is executed: everything is read as text and rendered with textContent. */
(function (G) {
  'use strict';
  const MAX_TEXT = 1200, MAX_ITEMS = 40, MAX_RAW = 3000000, TIMEOUT = 14000;

  function safeUrl(u) {
    const s = String(u == null ? '' : u).trim();
    return /^https?:\/\//i.test(s) && s.length < 2000 ? s : '';
  }
  function stripHtml(s) {
    let x = String(s == null ? '' : s).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
    x = x.replace(/<[^>]*>/g, ' ');
    const t = document.createElement('textarea'); t.innerHTML = x; // detached: never executed
    return (t.value || t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  }
  function localFirst(node, local) {
    for (const e of node.getElementsByTagName('*')) if (e.localName && e.localName.toLowerCase() === local) return e;
    return null;
  }
  function nodeText(node, names) {
    for (const n of names) { const e = node.getElementsByTagName(n)[0] || localFirst(node, n); if (e && e.textContent) { const v = e.textContent.trim(); if (v) return v; } }
    return '';
  }
  function nodeUrl(node, names) {
    for (const n of names) {
      const e = node.getElementsByTagName(n)[0] || localFirst(node, n); if (!e) continue;
      const v = safeUrl(e.getAttribute && e.getAttribute('href') || e.getAttribute && e.getAttribute('url') || e.textContent);
      if (v) return v;
    }
    return '';
  }
  function resolveUrl(src, base) {
    if (!src) return '';
    try { const u = new URL(src, base); return /^https?:$/.test(u.protocol) && u.href.length < 2000 ? u.href : ''; }
    catch (e) { return safeUrl(src); }
  }
  function imgSrc(el, base) {
    let s = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
    if (!s) { const ss = el.getAttribute('srcset'); if (ss) s = ss.split(',')[0].trim().split(/\s+/)[0]; }
    return resolveUrl(s, base);
  }
  // Lightweight readability: pick the richest container, keep text blocks and images, drop everything else.
  function extractArticle(html, base) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('script,style,noscript,iframe,form,nav,header,footer,aside,button,svg,video,audio').forEach(e => e.remove());
    const sels = ['article', '[itemprop="articleBody"]', '.entry-content', '.post-content', '.article-content', '.articleBody', '.story-content', '.detail-content', 'main', '[role="main"]', '#content', '.content'];
    let root = null, best = 0;
    for (const s of sels) for (const el of doc.querySelectorAll(s)) {
      const len = (el.textContent || '').trim().length;
      if (len > best) { best = len; root = el; }
    }
    if (!root || best < 180) root = doc.body || doc.documentElement;
    const out = [], texts = new Set(), seen = new Set(); let imgs = 0;
    const push = (tag, txt) => {
      const k = txt.slice(0, 160); if (texts.has(k)) return; texts.add(k);
      out.push({ k: 't', tag, x: txt });
    };
    const walk = el => {
      for (const node of el.children) {
        const tag = node.tagName.toLowerCase();
        if (['p', 'h1', 'h2', 'h3', 'h4', 'li', 'blockquote'].includes(tag)) {
          const txt = (node.textContent || '').replace(/\s+/g, ' ').trim();
          if (txt.length > 2 && txt.length < 4000) push(tag, txt);
          walk(node);
        } else if (tag === 'img') {
          const src = imgSrc(node, base);
          if (src && imgs < 30 && !seen.has(src)) { seen.add(src); imgs++; out.push({ k: 'i', x: src }); }
        } else if (tag === 'figure' || tag === 'div' || tag === 'section' || tag === 'td') {
          const img = node.querySelector('img');
          if (img && !node.querySelector('p, h1, h2, h3, li, blockquote')) {
            const src = imgSrc(img, base);
            if (src && imgs < 30 && !seen.has(src)) { seen.add(src); imgs++; out.push({ k: 'i', x: src }); }
          } else walk(node);
        }
      }
    };
    walk(root);
    if (!out.length) {
      (root.textContent || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?؟])\s+/)
        .filter(x => x.length > 30).slice(0, 80).forEach(x => push('p', x));
    }
    return out.slice(0, 160);
  }
  const when = v => { const d = new Date(v); return isNaN(+d) ? Date.now() : Math.min(+d, Date.now() + 86400000); };
  const itemId = (x, src) => String(x.guid || x.id || x.link || x.title || '').slice(0, 160) || src;

  function parseXml(raw, src) {
    const doc = new DOMParser().parseFromString(raw, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length || !doc.documentElement) throw new Error('feed: bad xml');
    const atom = doc.documentElement.localName === 'feed';
    const nodes = [].slice.call(doc.getElementsByTagName(atom ? 'entry' : 'item')).slice(0, MAX_ITEMS);
    return nodes.map(n => {
      const descHtml = nodeText(n, atom ? ['summary', 'content'] : ['description', 'content:encoded']);
      const title = stripHtml(nodeText(n, ['title']));
      let link = atom ? nodeUrl(n, ['link']) : nodeUrl(n, ['link']);
      if (!link && atom) { const l = localFirst(n, 'link'); if (l) link = safeUrl(l.getAttribute && l.getAttribute('href')); }
      let img = nodeUrl(n, ['thumbnail', 'content', 'image', 'enclosure']) || '';
      if (!img) { const m = descHtml.match(/<img[^>]+src=["']([^"']+)["']/i); if (m) img = safeUrl(m[1]); }
      return { id: itemId({ guid: nodeText(n, ['guid', 'id']), link, title }, src), title, link,
        desc: stripHtml(descHtml), ts: when(nodeText(n, ['pubDate', 'published', 'updated', 'date'])), img,
        html: descHtml.slice(0, 60000) };
    }).filter(x => x.title).slice(0, MAX_ITEMS);
  }
  function parseJson(j, src) {
    if (!j || !Array.isArray(j.items)) throw new Error('feed: bad json');
    return j.items.slice(0, MAX_ITEMS).map(it => {
      const title = stripHtml(it.title);
      let img = safeUrl(it.thumbnail || it.image || (it.enclosure && it.enclosure.link) || '');
      if (!img) { const m = String(it.description || it.content || '').match(/<img[^>]+src=["']([^"']+)["']/i); if (m) img = safeUrl(m[1]); }
      const html = String(it.description || it.content || '');
      return { id: itemId({ guid: it.guid, link: it.link, title }, src), title, link: safeUrl(it.link),
        desc: stripHtml(html), ts: when(it.pubDate), img, html: html.slice(0, 60000) };
    }).filter(x => x.title).slice(0, MAX_ITEMS);
  }
  // Proxy templates receive {url}. The last one answers JSON, the others raw XML.
  const PROXIES = [
    'https://api.rss2json.com/v1/api.json?rss_url={url}',
    'https://api.allorigins.win/raw?url={url}',
    'https://corsproxy.io/?{url}'
  ];
  function signal() {
    if (!('AbortController' in G)) return {};
    const c = new AbortController(), t = setTimeout(() => c.abort(), TIMEOUT);
    return { signal: c.signal, done: () => clearTimeout(t) };
  }
  async function raw(url, custom, kind) {
    const pool = kind === 'html' ? PROXIES.filter(p => !p.includes('rss2json')) : PROXIES;
    const tpl = [custom, ...pool].filter(Boolean);
    let err;
    for (const t of tpl) {
      let s;
      try {
        const target = t.includes('{url}') ? t.replace('{url}', encodeURIComponent(url)) : t + encodeURIComponent(url);
        s = signal();
        const r = await fetch(target, { signal: s.signal, cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const txt = await r.text();
        if (!txt || txt.length > MAX_RAW) throw new Error('empty/huge response');
        return txt;
      } catch (e) { err = e; }
      finally { if (s && s.done) s.done(); }
    }
    throw err || new Error('feed: unreachable');
  }
  async function load(feed, custom) {
    const url = safeUrl(feed && feed.url); if (!url) throw new Error('feed: invalid url');
    const txt = await raw(url, custom); const t = txt.trim();
    return t[0] === '{' ? parseJson(JSON.parse(t), url) : parseXml(t, url);
  }
  async function getText(url) {
    const s = signal();
    try {
      const r = await fetch(url, { signal: s.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } finally { if (s.done) s.done(); }
  }
  // Turn a site HOME PAGE into feed-like items: useful when the site has no RSS at all.
  function parseLinks(html, base) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('script,style,noscript,nav,header,footer,aside,form,button,svg').forEach(e => e.remove());
    const NAV = /^(home|homepage|about|contact|login|register|sign in|privacy|terms|search|archive|الرئيسية|من نحن|اتصل بنا|تسجيل الدخول|بحث|أرشيف)/i;
    const seenH = new Set(), seenT = new Set(), out = [];
    for (const a of doc.querySelectorAll('a[href]')) {
      const href = resolveUrl(a.getAttribute('href'), base);
      if (!href || seenH.has(href)) continue;
      const title = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (title.length < 12 || title.length > 200 || NAV.test(title) || seenT.has(title)) continue;
      let img = a.querySelector('img') || (a.parentElement && a.parentElement.querySelector('img'));
      if (!img && a.parentElement && a.parentElement.parentElement) img = a.parentElement.parentElement.querySelector('img');
      let src = img ? imgSrc(img, base) : '';
      if (src && /\/(logo|icon|avatar|sprite)[-_.]/i.test(src)) src = '';
      seenH.add(href); seenT.add(title);
      out.push({ id: href.slice(0, 160), title, link: href, desc: '', ts: Date.now(), img: src, html: '' });
      if (out.length >= 40) break;
    }
    return out;
  }
  function parseMarkdownLinks(txt, base) {
    const out = [], seen = new Set(), re = /\[([^\]]{12,200})\]\((https?:\/\/[^)\s]+)\)/g;
    let m;
    while ((m = re.exec(String(txt || ''))) && out.length < 40) {
      const link = safeUrl(m[2]); if (!link || seen.has(link)) continue;
      seen.add(link); out.push({ id: link.slice(0, 160), title: m[1].replace(/\s+/g, ' ').trim(), link, desc: '', ts: Date.now(), img: '', html: '' });
    }
    return out;
  }
  async function site(feed, custom) {
    const url = safeUrl(feed && feed.url); if (!url) throw new Error('site: invalid url');
    let html = '';
    try { html = await raw(url, custom, 'html'); } catch (e) {}
    if (html && html[0] !== '{') { const links = parseLinks(html, url); if (links.length) return links; }
    try { const md = await getText('https://r.jina.ai/' + url); const links = parseMarkdownLinks(md, url); if (links.length) return links; } catch (e) {}
    throw new Error('site: no links found');
  }
  // Jina returns clean markdown for pages that block normal fetching or render via JS.
  function markdownBlocks(md, base) {
    const out = [], seen = new Set();
    for (let line of String(md || '').split(/\r?\n/)) {
      line = line.replace(/^\s*[-*+]\s+/, '').trim();
      if (!line || /^(Title:|URL Source:|Published Time:|Markdown Content:)/i.test(line)) continue;
      const imgs = line.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi) || [];
      imgs.forEach(m => { const u = safeUrl((m.match(/\(([^)]+)\)/) || [])[1]); if (u && !seen.has(u)) { seen.add(u); out.push({ k: 'i', x: u }); } });
      const title = /^(#{1,4})\s+(.+)$/.exec(line);
      const quote = /^>\s*(.+)$/.exec(line);
      let x = line.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
        .replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
      if (!x || x.length < 2) continue;
      out.push({ k: 't', tag: title ? 'h' + Math.min(4, title[1].length) : (quote ? 'blockquote' : 'p'), x });
    }
    return out.slice(0, 160);
  }
  async function article(item, custom) {
    if (Array.isArray(item && item.blocks) && item.blocks.length) return item.blocks;
    const base = safeUrl(item && item.link), saved = String(item && item.html || '');
    let source = '', err;
    if (base) {
      try { source = await raw(base, custom, 'html'); }
      catch (e) { err = e; }
    }
    let blocks = source && source[0] !== '{' ? extractArticle(source, base || 'https://example.com/') : [];
    if (!blocks.length && saved) blocks = extractArticle(saved, base || 'https://example.com/');
    if (!blocks.length && base) {
      try { blocks = markdownBlocks(await getText('https://r.jina.ai/' + base), base); }
      catch (e) { err = e; }
    }
    if (!blocks.length) throw err || new Error('article: no content');
    return blocks;
  }
  G.ShilaFeed = { safeUrl, stripHtml, parseXml, parseJson, load, site, article, parseLinks, extractArticle, PROXIES, MAX_ITEMS };
})(window);
