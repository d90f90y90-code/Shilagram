/* ShilaBot — minimal Gemini REST client (no SDK, works inside the WebView).
   The API key never leaves the device except inside the request to Google. */
(function (G) {
  'use strict';
  const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const TIMEOUT = 25000;

  async function ask(cfg, history, text) {
    if (!cfg || !cfg.key || !text) throw new Error('missing');
    const model = /^[a-z0-9.\-]+$/.test(cfg.model || '') ? cfg.model : 'gemini-2.5-flash';
    const contents = [];
    (history || []).slice(-10).forEach(h => {
      if (!h || !h.x) return;
      contents.push({ role: h.bn || h.me ? 'model' : 'user', parts: [{ text: String(h.x).slice(0, 2000) }] });
    });
    contents.push({ role: 'user', parts: [{ text: String(text).slice(0, 4000) }] });
    // Gemini requires alternating roles; merge consecutive turns of the same role
    const turns = [];
    contents.forEach(c => {
      const last = turns[turns.length - 1];
      if (last && last.role === c.role) last.parts[0].text += '\n' + c.parts[0].text;
      else turns.push(c);
    });
    const body = { contents: turns, generationConfig: { maxOutputTokens: 600, temperature: 0.7 } };
    if (cfg.prompt) body.systemInstruction = { parts: [{ text: String(cfg.prompt).slice(0, 8000) }] };

    const ctl = 'AbortController' in G ? new AbortController() : null;
    const tid = ctl ? setTimeout(() => ctl.abort(), TIMEOUT) : 0;
    try {
      const r = await fetch(BASE + model + ':generateContent', {
        method: 'POST',
        headers: { 'x-goog-api-key': cfg.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl ? ctl.signal : undefined,
      });
      const raw = await r.text();
      if (!r.ok) {
        let msg = 'HTTP ' + r.status;
        try { const j = JSON.parse(raw); msg = (j.error && (j.error.message || j.error.status)) || msg; } catch (_) {}
        throw new Error(msg);
      }
      let j; try { j = JSON.parse(raw); } catch (_) { throw new Error('bad response'); }
      const parts = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
      const out = parts ? parts.map(p => p.text || '').join('').trim() : '';
      if (!out) throw new Error('empty response');
      return out.slice(0, 4000);
    } finally { if (tid) clearTimeout(tid); }
  }

  G.ShilaBot = { ask };
})(window);
