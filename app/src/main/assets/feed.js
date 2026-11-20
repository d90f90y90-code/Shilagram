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
        desc: stripHtml(descHtml), ts: when(nodeText(n, ['pubDate', 'published', 'updated', 'date'])), img };
    }).filter(x => x.title).slice(0, MAX_ITEMS);
  }
  function parseJson(j, src) {
    if (!j || !Array.isArray(j.items)) throw new Error('feed: bad json');
    return j.items.slice(0, MAX_ITEMS).map(it => {
      const title = stripHtml(it.title);
      let img = safeUrl(it.thumbnail || it.image || (it.enclosure && it.enclosure.link) || '');
      if (!img) { const m = String(it.description || it.content || '').match(/<img[^>]+src=["']([^"']+)["']/i); if (m) img = safeUrl(m[1]); }
      return { id: itemId({ guid: it.guid, link: it.link, title }, src), title, link: safeUrl(it.link),
        desc: stripHtml(it.description || it.content || ''), ts: when(it.pubDate), img };
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
  async function raw(url, custom) {
    const tpl = [custom, ...PROXIES].filter(Boolean);
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
  G.ShilaFeed = { safeUrl, stripHtml, parseXml, parseJson, load, PROXIES, MAX_ITEMS };
})(window);
