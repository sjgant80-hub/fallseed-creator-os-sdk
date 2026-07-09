// fallseed-creator-os SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from fallseed-creator-os/index.html · 102991 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

/*!
 * Fall Kit · v1.0.0 · the shared cascade for every estate seed
 *
 * Inlineable JS module. Drop into any seed via <script> or copy-paste inline.
 * Preserves single-HTML sovereignty (no external deps until user opts in to T2 WebLLM).
 *
 * What it gives every seed:
 *  - AI tier picker: T0 (off · default) · T2 (WebLLM in-browser, 5 models 1B-70B) · T3 (BYOK Anthropic/OpenAI/Google)
 *  - Universal entry: FallKit.aiComplete(systemPrompt, userMsg, maxTokens) → string|null
 *  - AI chip UI in header
 *  - WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN)
 *  - Help section partial: FallKit.helpSection()
 *  - Settings panel: FallKit.openSettings()
 *
 * Doctrine (per botler CLAUDE.md):
 *  - T0 fallback ALWAYS works · aiComplete returns null · caller MUST degrade gracefully
 *  - NEVER hide a feature behind AI · NEVER proxy API keys · NEVER log keys
 *  - WebLLM is lazy-loaded · model weights download ONLY on user opt-in
 *
 * Estate-first canonical references:
 *  - WebLLM pattern: Downloads/botler/index.html (T0/T2/T3 cascade)
 *  - WebRTC pattern: Downloads/fallnet/fallnet-shim.js (raw RTCPeerConnection)
 *  - Mesh channel:   'fall-signal'
 */
(function (root) {
  'use strict';
  const FALL_KIT_VERSION = '1.2.0';
  const KCC_MINT_URL = 'https://sjgant80-hub.github.io/kcc-mint/';
  // ─── Model registry ──────────────────────────────────────────────
  const WEBLLM_MODELS = {
    'llama-1b':  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',   size: '~700MB', label: '1B · fast · any laptop / phone' },
    'llama-3b':  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',   size: '~2GB',   label: '3B · balanced · default · most laptops' },
    'qwen-7b':   { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',     size: '~5GB',   label: '7B · capable · needs decent GPU (M-series Mac / 8GB+ VRAM)' },
    'llama-8b':  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',   size: '~5GB',   label: '8B · common · needs decent GPU' },
    'llama-70b': { id: 'Llama-3.1-70B-Instruct-q4f16_1-MLC',  size: '~40GB',  label: '70B · frontier · needs serious GPU + 64GB+ RAM' },
  };
  const DEFAULT_MODEL = 'llama-3b';
  const T3_PROVIDERS = {
    anthropic: { label: 'Anthropic Claude', models: ['claude-sonnet-4-5','claude-opus-4-7','claude-haiku-4-5'], default: 'claude-sonnet-4-5', url: 'https://api.anthropic.com/v1/messages' },
    openai:    { label: 'OpenAI',           models: ['gpt-4o','gpt-4o-mini','o1-mini'],                          default: 'gpt-4o-mini',      url: 'https://api.openai.com/v1/chat/completions' },
    google:    { label: 'Google Gemini',    models: ['gemini-1.5-pro','gemini-1.5-flash','gemini-2.0-flash-exp'], default: 'gemini-1.5-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  };
  // ─── State ───────────────────────────────────────────────────────
  const STATE = {
    config: loadConfig(),
    ai: { ready: false, loading: false, progress: 0, engine: null, model: null },
    mesh: { active: false, peers: new Map(), bc: null, signal: null },
  };
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem('fall-kit.config') || '{}'); }
    catch (e) { return {}; }
  }
  function saveConfig() {
    try { localStorage.setItem('fall-kit.config', JSON.stringify(STATE.config)); } catch (e) {}
  }
  // ─── DOM helpers ─────────────────────────────────────────────────
  function $(s, root) { return (root || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  // ─── AI tier ─────────────────────────────────────────────────────
  function aiTier() { return STATE.config.ai_tier || 'T0'; }
  function renderAiChip() {
    const chip = $('#fk-ai-chip');
    if (!chip) return;
    const txt = $('#fk-ai-chip-text');
    chip.classList.remove('fk-chip-live', 'fk-chip-loading', 'fk-chip-warn');
    const tier = aiTier();
    if (tier === 'T0') { txt.textContent = 'T0 · off'; }
    else if (tier === 'T2') {
      if (STATE.ai.ready) { txt.textContent = 'T2 ' + (WEBLLM_MODELS[STATE.config.webllm_model || DEFAULT_MODEL]?.label.split(' · ')[0] || '') + ' · ready'; chip.classList.add('fk-chip-live'); }
      else if (STATE.ai.loading) { txt.textContent = 'T2 loading ' + Math.round(STATE.ai.progress) + '%'; chip.classList.add('fk-chip-loading'); }
      else { txt.textContent = 'T2 · click to load'; chip.classList.add('fk-chip-warn'); }
    } else if (tier === 'T3') {
      if (STATE.config.api_key) { txt.textContent = 'T3 ' + (T3_PROVIDERS[STATE.config.api_provider]?.label || 'BYOK') + ' · active'; chip.classList.add('fk-chip-live'); }
      else { txt.textContent = 'T3 · no key set'; chip.classList.add('fk-chip-warn'); }
    }
  }
  async function loadWebLLM(modelKey) {
    if (STATE.ai.loading) return;
    const key = modelKey || STATE.config.webllm_model || DEFAULT_MODEL;
    const model = WEBLLM_MODELS[key];
    if (!model) { console.error('fall-kit: unknown model', key); return; }
    if (STATE.ai.ready && STATE.ai.model === model.id) return;
    STATE.ai.loading = true; STATE.ai.progress = 0; renderAiChip();
    notify('Loading WebLLM · ' + model.label + ' · ' + model.size + ' first time', 'info');
    try {
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
      const engine = await CreateMLCEngine(model.id, {
        initProgressCallback: p => { STATE.ai.progress = (p.progress || 0) * 100; renderAiChip(); }
      });
      STATE.ai.engine = engine;
      STATE.ai.model = model.id;
      STATE.ai.ready = true;
      STATE.ai.loading = false;
      STATE.config.webllm_model = key; saveConfig();
      renderAiChip();
      notify('WebLLM ready · sovereign mode · ' + model.label.split(' · ')[0], 'ok');
    } catch (e) {
      console.error('fall-kit: WebLLM load failed', e);
      STATE.ai.loading = false; renderAiChip();
      notify('WebLLM load failed · ' + e.message, 'err');
    }
  }
  async function aiComplete(systemPrompt, userMsg, maxTokens) {
    maxTokens = maxTokens || 600;
    const tier = aiTier();
    if (tier === 'T2' && STATE.ai.ready && STATE.ai.engine) {
      const r = await STATE.ai.engine.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
        max_tokens: maxTokens,
      });
      return r.choices[0].message.content;
    }
    if (tier === 'T3' && STATE.config.api_key && STATE.config.api_provider) {
      return await aiCloudCall(systemPrompt, userMsg, maxTokens);
    }
    return null;
  }
  async function aiCloudCall(sys, msg, maxTokens) {
    const provider = STATE.config.api_provider;
    const key = STATE.config.api_key;
    const model = STATE.config.api_model || T3_PROVIDERS[provider]?.default;
    if (provider === 'anthropic') {
      const r = await fetch(T3_PROVIDERS.anthropic.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      return j.content[0].text;
    }
    if (provider === 'openai') {
      const r = await fetch(T3_PROVIDERS.openai.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('OpenAI ' + r.status);
      const j = await r.json();
      return j.choices[0].message.content;
    }
    if (provider === 'google') {
      const r = await fetch(T3_PROVIDERS.google.url + model + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: sys + '\n\n---\n\n' + msg }] }], generationConfig: { maxOutputTokens: maxTokens } }),
      });
      if (!r.ok) throw new Error('Google ' + r.status);
      const j = await r.json();
      return j.candidates[0].content.parts[0].text;
    }
    throw new Error('unknown provider: ' + provider);
  }
  // ─── WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN) ───
  const MESH_CHANNEL = 'fall-signal';
  const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  function meshStart(opts) {
    if (STATE.mesh.active) return;
    opts = opts || {};
    const seedId = opts.seedId || (location.pathname + '#' + Math.random().toString(36).slice(2, 8));
    STATE.mesh.seedId = seedId;
    try { STATE.mesh.bc = new BroadcastChannel(MESH_CHANNEL); }
    catch (e) { console.warn('fall-kit: BroadcastChannel unavailable'); return; }
    STATE.mesh.bc.onmessage = e => {
      const m = e.data;
      if (!m || !m.kind || m.peerId === seedId) return;
      if (opts.onMessage) opts.onMessage(m);
    };
    STATE.mesh.bc.postMessage({ kind: 'fall-kit:hello', peerId: seedId, ts: Date.now(), seedName: opts.seedName || 'unknown' });
    STATE.mesh.active = true;
    notify('Mesh active · channel ' + MESH_CHANNEL, 'ok');
  }
  function meshPost(kind, payload) {
    if (!STATE.mesh.active || !STATE.mesh.bc) return false;
    STATE.mesh.bc.postMessage({ kind: kind, peerId: STATE.mesh.seedId, ts: Date.now(), payload: payload });
    return true;
  }
  // ─── Toast ───────────────────────────────────────────────────────
  function notify(msg, kind) {
    let t = $('#fk-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'fk-toast';
      t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(20px);background:#c08a3a;color:#0a0a0a;padding:9px 18px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:0;transition:all .22s;z-index:10000;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = kind === 'err' ? '#a14a2a' : kind === 'ok' ? '#6b8d4a' : '#c08a3a';
    t.style.color = kind === 'err' ? '#fff' : '#0a0a0a';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2400);
  }
  // ─── Settings modal ──────────────────────────────────────────────
  function openSettings() {
    let bg = $('#fk-modal-bg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'fk-modal-bg';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;z-index:9999';
      bg.onclick = e => { if (e.target.id === 'fk-modal-bg') closeSettings(); };
      document.body.appendChild(bg);
    }
    const tier = aiTier();
    const provider = STATE.config.api_provider || 'anthropic';
    const providerCfg = T3_PROVIDERS[provider];
    bg.innerHTML = `
      <div style="background:#13121a;border:1px solid #c08a3a;border-radius:5px;max-width:600px;width:100%;padding:22px 24px;color:#ebe3d2;font-family:system-ui,-apple-system,sans-serif;font-size:13.5px;line-height:1.55">
        <div style="margin-bottom:14px"><label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Tier</label>
          <select id="fk-tier" style="width:100%;padding:8px 11px;background:#1a1922;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13.5px;font-family:inherit">
            <option value="T0"${tier==='T0'?' selected':''}>T0 · off (default · the seed works fully without AI)</option>
            <option value="T2"${tier==='T2'?' selected':''}>T2 · WebLLM in-browser · sovereign · pick a model below</option>
            <option value="T3"${tier==='T3'?' selected':''}>T3 · BYOK · Anthropic / OpenAI / Google · stored in your browser only</option>
          </select>
        </div>
        <div id="fk-t2-block" style="display:${tier==='T2'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">WebLLM model · 1B → 70B cascade</label>
          <select id="fk-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit">
            ${Object.entries(WEBLLM_MODELS).map(([k,m]) => `<option value="${k}"${(STATE.config.webllm_model||DEFAULT_MODEL)===k?' selected':''}>${esc(m.label)} · ${esc(m.size)}</option>`).join('')}
          </select>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button id="fk-load-llm" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">${STATE.ai.ready?'✓ Loaded · switch':'Load model (one-time download)'}</button>
            <span id="fk-llm-status" style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.04em">${STATE.ai.ready?'ready':STATE.ai.loading?Math.round(STATE.ai.progress)+'%':'not loaded'}</span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">First load downloads the model from @mlc-ai/web-llm CDN. Cached forever after. Inference is 100% local — open DevTools → Network during use, nothing leaves.</div>
        </div>
        <div id="fk-t3-block" style="display:${tier==='T3'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">BYOK provider</label>
          <select id="fk-provider" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${Object.entries(T3_PROVIDERS).map(([k,p]) => `<option value="${k}"${provider===k?' selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Model</label>
          <select id="fk-api-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${providerCfg.models.map(m => `<option value="${m}"${(STATE.config.api_model||providerCfg.default)===m?' selected':''}>${esc(m)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">API key</label>
          <input type="password" id="fk-key" value="${esc(STATE.config.api_key || '')}" placeholder="${STATE.config.api_key ? '(set · leave empty to keep)' : 'sk-ant-... or sk-... or AIza...'}" autocomplete="off" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:ui-monospace,Menlo,monospace">
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">Key lives in this browser only (localStorage). Sent direct to the provider — never to us. Wipe with Reset.</div>
        </div>
        <div style="margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Cross-seed mesh</label>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="fk-mesh-toggle" style="padding:6px 12px;background:${STATE.mesh.active?'#6b8d4a':'#1a1922'};color:${STATE.mesh.active?'#fff':'#a89e88'};border:1px solid ${STATE.mesh.active?'#6b8d4a':'#3a342c'};border-radius:3px;font-size:11px;cursor:pointer;font-family:inherit">${STATE.mesh.active?'✓ Active · disconnect':'Activate mesh'}</button>
            <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6e6a5e;letter-spacing:.04em">channel · <code style="background:#22212c;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code></span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">BroadcastChannel for same-device · WebRTC for cross-device (planned). Other estate seeds on the same channel discover each other automatically.</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button onclick="FallKit.closeSettings()" style="padding:7px 14px;background:transparent;color:#a89e88;border:1px solid #3a342c;border-radius:3px;font-size:12px;cursor:pointer;font-family:inherit">Close</button>
          <button id="fk-save" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">Save</button>
        </div>
      </div>`;
    // Wire interactions
    $('#fk-tier').onchange = () => {
      const t = $('#fk-tier').value;
      $('#fk-t2-block').style.display = t === 'T2' ? 'block' : 'none';
      $('#fk-t3-block').style.display = t === 'T3' ? 'block' : 'none';
    };
    $('#fk-provider') && ($('#fk-provider').onchange = () => {
      const p = $('#fk-provider').value;
      const sel = $('#fk-api-model');
      sel.innerHTML = T3_PROVIDERS[p].models.map(m => `<option value="${m}">${esc(m)}</option>`).join('');
    });
    $('#fk-load-llm') && ($('#fk-load-llm').onclick = () => {
      const m = $('#fk-model').value;
      loadWebLLM(m);
    });
    $('#fk-mesh-toggle').onclick = () => {
      if (STATE.mesh.active) { STATE.mesh.bc?.close(); STATE.mesh.active = false; STATE.mesh.bc = null; notify('Mesh disconnected'); }
      else meshStart({ seedName: STATE.config.seedName || 'seed' });
      openSettings();  // refresh modal
    };
    $('#fk-save').onclick = () => {
      STATE.config.ai_tier = $('#fk-tier').value;
      if ($('#fk-model')) STATE.config.webllm_model = $('#fk-model').value;
      if ($('#fk-provider')) STATE.config.api_provider = $('#fk-provider').value;
      if ($('#fk-api-model')) STATE.config.api_model = $('#fk-api-model').value;
      const newKey = $('#fk-key')?.value;
      if (newKey) STATE.config.api_key = newKey;
      saveConfig(); renderAiChip(); notify('Saved', 'ok'); closeSettings();
    };
  }
  function closeSettings() { const bg = $('#fk-modal-bg'); if (bg) bg.remove(); }
  // ─── Help section (returns HTML string for inclusion in seed Help tabs) ───
  function helpSection() {
    return `<div style="background:rgba(192,138,58,.05);border:1px solid #3a342c;border-radius:4px;padding:18px 22px;margin:14px 0">
      <p style="font-size:13px;color:#a89e88;line-height:1.7;margin-bottom:10px">This seed runs fully without AI (<strong style="color:#c08a3a">T0</strong>, default). Enable a tier in settings if you want AI-assist features:</p>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">Tier</th><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">What it is</th></tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T0</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">Off. The seed works fully. No AI · no downloads · no API calls.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T2</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">WebLLM in-browser. Pick a model: 1B (700MB, fast) → 3B (2GB, balanced) → 7B (5GB, capable) → 70B (40GB, frontier). One-time download, runs offline forever after. Zero data leaves your device.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T3</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">BYOK · Anthropic Claude · OpenAI GPT · Google Gemini. You bring the API key, you pay the provider direct. Key stays in your browser, sent direct to the provider, never proxied.</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:#6e6a5e;line-height:1.6;margin-top:10px">Open the AI chip in the header to switch tier or check status. Cross-seed mesh activates a BroadcastChannel on <code style="background:#1a1922;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code> so other estate seeds on the same device discover this one.</p>
    </div>`;
  }
  // ─── CSS for AI chip ─────────────────────────────────────────────
  function injectCss() {
    const s = document.createElement('style');
    s.id = 'fk-css';
    s.textContent = `
      #fk-ai-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:3px; font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; font-weight:600; cursor:pointer; border:1px solid #3a342c; background:#1a1922; color:#a89e88; user-select:none; vertical-align:middle }
      #fk-ai-chip:hover { border-color:#c08a3a; color:#ebe3d2 }
      #fk-ai-chip.fk-chip-live { border-color:#6b8d4a; color:#6b8d4a; background:rgba(107,141,74,.10) }
      #fk-ai-chip.fk-chip-loading { border-color:#e8a83a; color:#e8a83a; background:rgba(232,168,58,.10) }
      #fk-ai-chip.fk-chip-warn { border-color:#a14a2a; color:#a14a2a; background:rgba(161,74,42,.08) }
      #fk-ai-chip .fk-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0 }
      #fk-ai-chip.fk-chip-loading .fk-dot { animation:fk-pulse 1s infinite }
      @keyframes fk-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
      .fk-ai-assist { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; font-size:11px; border:1px solid #c08a3a; color:#c08a3a; background:transparent; border-radius:3px; cursor:pointer; font-family:inherit }
      .fk-ai-assist:hover { background:#c08a3a; color:#0a0a0a }
      .fk-ai-assist::before { content:'✦'; font-size:12px }
    `;
    document.head.appendChild(s);
  }
  // ─── KCC Mint launcher (v1.2 · fork-this-seed shortcut) ──────────
  function openMint() {
    const slug = (STATE.config.seedName || location.hostname.split('.')[0] || 'seed').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const url = location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({ fork: '1', parent_slug: slug, parent_name: name, parent_url: url, parent_desc: desc });
  }
  // ─── Init ────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    injectCss();
    if (opts.seedName) STATE.config.seedName = opts.seedName;
    if ($('#fk-ai-chip')) { renderAiChip(); return { version: FALL_KIT_VERSION, mounted: false }; }
    const chip = document.createElement('button');
    chip.id = 'fk-ai-chip';
    chip.title = 'AI cascade · click to configure tier and model';
    chip.innerHTML = '<span class="fk-dot"></span><span id="fk-ai-chip-text">T0 · off</span>';
    chip.onclick = openSettings;
    // Try anchor first, fall back to floating bottom-right
    const anchor = opts.chipAnchor ? $(opts.chipAnchor) : null;
    if (anchor) { anchor.appendChild(chip); }
    else {
      chip.style.cssText += ';position:fixed;bottom:14px;left:14px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      document.body.appendChild(chip);
    }
    // v1.2 · floating mint button next to chip
    if (!$('#fk-mint-btn') && !opts.hideMint) {
      const mintBtn = document.createElement('button');
      mintBtn.id = 'fk-mint-btn';
      mintBtn.title = 'Mint a fork of this seed as a KCC bundle · provenance economy';
      mintBtn.innerHTML = '<span style="font-size:13px">✦</span> mint fork';
      mintBtn.style.cssText = 'position:fixed;bottom:14px;left:130px;z-index:9998;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;cursor:pointer;border:1px solid #c08a3a;color:#c08a3a;background:rgba(10,10,15,.7);box-shadow:0 4px 14px rgba(0,0,0,.4)';
      mintBtn.onmouseover = () => { mintBtn.style.background = '#c08a3a'; mintBtn.style.color = '#0a0a0a'; };
      mintBtn.onmouseout  = () => { mintBtn.style.background = 'rgba(10,10,15,.7)'; mintBtn.style.color = '#c08a3a'; };
      mintBtn.onclick = openMint;
      document.body.appendChild(mintBtn);
    }
    renderAiChip();
    return { version: FALL_KIT_VERSION, mounted: true };
  }
  // ─── Public API ──────────────────────────────────────────────────
  root.FallKit = {
    version: FALL_KIT_VERSION,
    init: init,
    aiTier: aiTier,
    aiComplete: aiComplete,
    loadWebLLM: loadWebLLM,
    openSettings: openSettings,
    closeSettings: closeSettings,
    renderAiChip: renderAiChip,
    helpSection: helpSection,
    meshStart: meshStart,
    meshPost: meshPost,
    notify: notify,
    openMint: openMint,  // v1.2 · launch kcc-mint with this seed prefilled as parent
    MODELS: WEBLLM_MODELS,
    PROVIDERS: T3_PROVIDERS,
    state: STATE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
  // fall-kit init · auto-mounts a floating AI chip bottom-left
  (function () {
    function go() { if (typeof FallKit !== 'undefined') FallKit.init({ seedName: "fallseed-creator-os" }); }
    else go();
  })();
'use strict';
const SEED_DEFAULT = {
  manifest: {
    name: 'creator-os',
    vertical: 'Personal OS · behaviour-tier seed · 6 persona presets',
    version: '2.0.0',
    prime: 1213,
    level: 2,
    parent: null,
    primeWindow: [1213],
    bundleRoles: ['persona-switcher', 'goals-tracker', 'routine-tracker', 'journal', 'knowledge-base'],
    meshChannel: 'fall-creator',
    bloomVector: [4, 5, 5, 4, 4, 3, 2],
    foldSequence: '●〜┃♡△◐',
  },
  personas: {
    creator: {
      name: 'Creator', glyph: '◉',
      description: 'Make, ship, refine. The output is the proof. Goals are creative output; routines are creation rituals; dashboards show what you have shipped.',
      goalTemplates: [
        { title: 'Ship 12 pieces this quarter', category: 'output' },
        { title: 'Daily creation habit (5 days/week)', category: 'habit' },
        { title: 'Grow audience to Y by Z date', category: 'reach' },
        { title: 'Develop a signature voice / style', category: 'craft' },
        { title: 'Open a paid revenue stream from creation', category: 'monetise' },
      ],
      routineTemplates: [
        { title: 'Morning creation block · 90 min', cadence: 'daily' },
        { title: 'Weekly publish · pick one to ship', cadence: 'weekly' },
        { title: 'Friday reflection · what shipped, what did not', cadence: 'weekly' },
        { title: 'Monthly portfolio review', cadence: 'monthly' },
      ],
      journalPrompts: ['What did I make today (no judgement, just inventory)?', 'Where did the resistance show up?', 'What is the one thing that should ship this week?'],
      knowledgeCategories: ['inspiration', 'tooling', 'craft notes', 'process', 'audience'],
      agentTasks: [
        'Summarise this week\'s outputs into a thread / email',
        'Pull yesterday\'s notes into a creation brief for today',
        'Critique my latest draft against my voice notes',
        'Suggest 3 follow-on pieces from this published work',
      ],
      dashboardWidgets: ['shipped this week', 'creation streak (days)', 'WIP count', 'top inspiration sources']
    },
    investor: {
      name: 'Investor', glyph: '◇',
      description: 'Capital flows, positions, conviction. Goals are portfolio outcomes; routines are review cadence; journal captures thesis vs. result.',
      goalTemplates: [
        { title: 'Maintain target asset allocation (X% equities, Y% bonds, Z% alt)', category: 'allocation' },
        { title: 'Achieve X% annualised return over rolling 3y', category: 'return' },
        { title: 'Build N months emergency reserve', category: 'reserve' },
        { title: 'Reduce single-asset concentration below X%', category: 'risk' },
        { title: 'Document every position thesis before adding', category: 'discipline' },
      ],
      routineTemplates: [
        { title: 'Weekly position review · 30 min', cadence: 'weekly' },
        { title: 'Monthly rebalance check', cadence: 'monthly' },
        { title: 'Quarterly thesis audit · what held, what broke', cadence: 'monthly' },
        { title: 'Annual tax-loss harvest pass', cadence: 'monthly' },
      ],
      journalPrompts: ['What position did I open / close this week? Why?', 'Where did my thesis play out, and where was I wrong?', 'What is the one risk I am underestimating right now?'],
      knowledgeCategories: ['thesis library', 'positions', 'risk notes', 'tax', 'reading'],
      agentTasks: [
        'Summarise this week\'s market context against my open theses',
        'Stress-test current allocation against a 30% drawdown',
        'Pull together a tax-loss-harvest candidates list',
        'Draft a one-page memo for [position]',
      ],
      dashboardWidgets: ['allocation drift', 'YTD return vs benchmark', 'positions opened/closed (30d)', 'cash runway months']
    },
    researcher: {
      name: 'Researcher', glyph: '◈',
      description: 'Deep reading, careful synthesis, traceable claims. Goals are knowledge built; routines are reading cadence; journal captures notes and questions.',
      goalTemplates: [
        { title: 'Read 24 papers this quarter (with notes)', category: 'reading' },
        { title: 'Maintain a Zettelkasten of N+ atomic notes', category: 'synthesis' },
        { title: 'Ship 1 written synthesis per month', category: 'output' },
        { title: 'Build literature map for [topic]', category: 'depth' },
        { title: 'Replicate one finding per quarter', category: 'rigour' },
      ],
      routineTemplates: [
        { title: 'Morning deep-read · 60 min · no distractions', cadence: 'daily' },
        { title: 'Weekly synthesis · turn notes into one paragraph', cadence: 'weekly' },
        { title: 'Monthly literature scan · what is new', cadence: 'monthly' },
        { title: 'Quarterly thesis review · what do I now believe', cadence: 'monthly' },
      ],
      journalPrompts: ['What did today\'s reading change?', 'What question is sharpening?', 'What is the next paper or thread to pull?'],
      knowledgeCategories: ['papers', 'atomic notes', 'questions', 'syntheses', 'replications'],
      agentTasks: [
        'Summarise this paper into 5 claims + 5 caveats',
        'Find related work to [topic / paper]',
        'Draft a literature-map prompt for [field]',
        'Adversarially critique my latest synthesis',
      ],
      dashboardWidgets: ['papers read this month', 'open questions', 'syntheses shipped', 'top-cited authors in notes']
    },
    writer: {
      name: 'Writer', glyph: '◍',
      description: 'Words shipped, voice developed, audience grown. Goals are word counts and pieces; routines are writing rituals; journal is morning pages.',
      goalTemplates: [
        { title: 'Ship 4 pieces this month (essays / posts / chapters)', category: 'output' },
        { title: 'Write 1,000 words/day, 5 days/week', category: 'volume' },
        { title: 'Grow subscriber list to N', category: 'audience' },
        { title: 'Finish [project] draft by Z date', category: 'project' },
        { title: 'Develop signature voice (audit quarterly)', category: 'craft' },
      ],
      routineTemplates: [
        { title: 'Morning pages · 30 min · stream of consciousness', cadence: 'daily' },
        { title: 'Daily 1,000-word block', cadence: 'daily' },
        { title: 'Weekly publish · pick one to ship', cadence: 'weekly' },
        { title: 'Monthly subscriber note', cadence: 'monthly' },
      ],
      journalPrompts: ['What did I write today (count + topic)?', 'Where did the sentence break down?', 'What does my voice sound like right now?'],
      knowledgeCategories: ['drafts', 'fragments', 'inspiration', 'voice notes', 'reader replies'],
      agentTasks: [
        'Tighten this paragraph without losing meaning',
        'Draft 3 alternative openings for [piece]',
        'Pull 5 quotes I marked this week into a thread',
        'Critique my voice consistency across these 3 pieces',
      ],
      dashboardWidgets: ['words this week', 'pieces shipped', 'subscriber count', 'draft pipeline']
    },
    nomad: {
      name: 'Nomad', glyph: '◐',
      description: 'Light footprint, work anywhere, optimise the admin. Goals are location experience and operational fitness; routines are travel-friendly.',
      goalTemplates: [
        { title: 'Visit N new cities / countries this year', category: 'experience' },
        { title: 'Maintain remote-work capability from any base', category: 'capability' },
        { title: 'Keep monthly burn under $X', category: 'finance' },
        { title: 'Document each base in a one-page note', category: 'memory' },
        { title: 'Build a network of N+ local contacts globally', category: 'network' },
      ],
      routineTemplates: [
        { title: 'Weekly admin sweep · visas, tax, banks · 1 hr', cadence: 'weekly' },
        { title: 'Monthly burn review', cadence: 'monthly' },
        { title: 'Quarterly base rotation review · where next', cadence: 'monthly' },
        { title: 'Annual residency / tax check', cadence: 'monthly' },
      ],
      journalPrompts: ['What worked / failed about this base?', 'What did I see / learn this week?', 'What is the next move (place + reason)?'],
      knowledgeCategories: ['bases', 'contacts', 'tax notes', 'gear', 'visa status'],
      agentTasks: [
        'Compile a one-page note for [city]',
        'Compare tax implications of bases X vs Y',
        'Draft a 30-day plan for [base]',
        'Pull together this month\'s receipts into a category report',
      ],
      dashboardWidgets: ['days at current base', 'monthly burn vs budget', 'visa expiry next', 'bases this year']
    },
    monk: {
      name: 'Monk', glyph: '◌',
      description: 'Less, slower, deeper. Goals are reduction and attention; routines are practice (meditation, sleep, silence); journal is contemplation.',
      goalTemplates: [
        { title: 'Maintain daily meditation practice (20+ min)', category: 'practice' },
        { title: 'Reduce digital surface (apps / accounts / subscriptions)', category: 'reduction' },
        { title: 'Sleep 8 hours, asleep by 22:30', category: 'rest' },
        { title: 'Read 12 books this year (deep, not many)', category: 'depth' },
        { title: 'Practice one silence-day per month', category: 'silence' },
      ],
      routineTemplates: [
        { title: 'Morning sit · 20+ min · before screens', cadence: 'daily' },
        { title: 'Evening offline · no screens after 21:00', cadence: 'daily' },
        { title: 'Weekly digital declutter · unsubscribe / delete', cadence: 'weekly' },
        { title: 'Monthly silence day', cadence: 'monthly' },
      ],
      journalPrompts: ['What did I notice today that I would normally miss?', 'What did I add that I could have not added?', 'What stayed quiet?'],
      knowledgeCategories: ['practice notes', 'readings', 'subtractions', 'rest data', 'questions'],
      agentTasks: [
        'Suggest 5 things in my notes I could delete',
        'Pull this week\'s sit notes into a single paragraph',
        'Find passages from my readings on [theme]',
        'Audit my apps / subscriptions and propose 3 to drop',
      ],
      dashboardWidgets: ['meditation streak (days)', 'sleep average (7-day)', 'subtractions this month', 'silence days completed']
    }
  },
  buildPromptSystem: `You are FallSeed-Build, the generative substrate of the FallSeed Creator-OS wedge.
You generate sovereign single-HTML tools that extend a personal operating system organised around a chosen persona (Creator / Investor / Researcher / Writer / Nomad / Monk or a custom one). Every tool you produce MUST:
1. Be a COMPLETE single HTML file starting with <!DOCTYPE html> and ending with <\/html>.
2. Include all CSS inline using the FallSeed dark palette: --void #0b0a0f, --brass #b8974a, --amber #ff8c00, --cream #e6e1d6.
3. Include all JavaScript inline. Use 'use strict'. Any literal close-script tag in a string MUST be written as <\/script>.
4. Store data in IndexedDB keyed by the tool name. Use auto-increment integer ids.
5. Open a BroadcastChannel named 'fall-creator' for mesh sync with the existing Creator-OS wedge.
6. Broadcast 'hello' to 'fall-signal' channel on boot with {source, type:'hello', prime, version, level, parent}.
7. Include a P3 audit chain: prevHash + SHA-256 chained entries on every state mutation. Use the Web Crypto API.
8. Include a T0 Q&A panel that pattern-matches user questions against hard-coded persona-specific guidance.
9. Include a seedDemo() function that populates 2-3 sample records on first boot (isDemo:true flag).
10. Have at least 3 tabs: a main list view, a settings panel with Export/Import/Wipe, and a Q&A panel.
11. Include a modal pattern for add/edit forms.
12. Use the same CSS class names as the rest of the wedge: nav.tabs, .card, .btn, .btn.brass, .btn.sm, .toast, .modal-bg, .modal, .field, .row.
13. Include a disclaimer at the top of the main view stating this is operational scaffolding, not licensed advice.
14. Include a manifest data: URL for PWA installability.
15. Set <meta name="prime" content="XXXX"> where XXXX is a prime > 1213 not already used in the wedge.
16. Name the tool with prefix 'fallcr' (e.g. fallcrhabit, fallcrgoals, fallcrjournal). Lowercase no-space single-word suffix.
When the user describes a tool they need, output ONLY the complete HTML file. No preamble, no markdown code fences. Start with <!DOCTYPE html> and end with <\/html>.`
};
const PROVIDERS = [
  { id:'webllm', name:'WebLLM', tier:'T1', tierLabel:'sovereign', priority:1, model:'Llama-3.2-3B-Instruct-q4f16_1-MLC', defaultEnabled:false, supportsStream:true, pricePer1MIn:0, pricePer1MOut:0, note:'In-browser via WebGPU. First load ~2GB. Free, offline, no key.' },
  { id:'ollama', name:'Ollama (local)', tier:'T2', tierLabel:'sovereign', priority:2, endpoint:'http://localhost:11434/v1/chat/completions', model:'llama3.2', defaultEnabled:true, supportsStream:true, pricePer1MIn:0, pricePer1MOut:0, note:'localhost:11434 · install ollama · OLLAMA_ORIGINS=* for CORS' },
  { id:'lmstudio', name:'LM Studio (local)', tier:'T2', tierLabel:'sovereign', priority:3, endpoint:'http://localhost:1234/v1/chat/completions', model:'loaded', defaultEnabled:true, supportsStream:true, pricePer1MIn:0, pricePer1MOut:0, note:'localhost:1234 · loads any GGUF · enable CORS in Server tab' },
  { id:'groq', name:'Groq', tier:'T3-free', tierLabel:'free', priority:4, endpoint:'https://api.groq.com/openai/v1/chat/completions', model:'llama-3.3-70b-versatile', requiresKey:true, freeTier:true, defaultEnabled:true, supportsStream:true, pricePer1MIn:0, pricePer1MOut:0, signupUrl:'https://console.groq.com/keys', note:'30 req/min · 14k tokens/min · Llama 3.3 70B · fastest cloud' },
  { id:'openrouter-free', name:'OpenRouter free', tier:'T3-free', tierLabel:'free', priority:5, endpoint:'https://openrouter.ai/api/v1/chat/completions', model:'meta-llama/llama-3.3-70b-instruct:free', requiresKey:true, freeTier:true, defaultEnabled:true, supportsStream:true, pricePer1MIn:0, pricePer1MOut:0, signupUrl:'https://openrouter.ai/keys', note:'Free: Llama 3.3 70B, Gemini 2.0 Flash, Mistral · 200 req/day' },
  { id:'google', name:'Google AI Studio', tier:'T3-free', tierLabel:'free', priority:6, endpoint:'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent', model:'gemini-2.5-flash', requiresKey:true, freeTier:true, defaultEnabled:true, supportsStream:true, pricePer1MIn:0, pricePer1MOut:0, signupUrl:'https://aistudio.google.com/apikey', note:'Gemini 2.5 Flash free · 15 req/min · 1M tokens/day free' },
  { id:'cerebras', name:'Cerebras', tier:'T3-free', tierLabel:'free', priority:7, endpoint:'https://api.cerebras.ai/v1/chat/completions', model:'llama-3.3-70b', requiresKey:true, freeTier:true, defaultEnabled:true, supportsStream:true, pricePer1MIn:0, pricePer1MOut:0, signupUrl:'https://cloud.cerebras.ai/platform', note:'Llama 3.3 70B at ~2200 tokens/sec · generous free tier' },
  { id:'anthropic', name:'Anthropic (paid)', tier:'T3-paid', tierLabel:'paid', priority:8, endpoint:'https://api.anthropic.com/v1/messages', model:'claude-sonnet-4-20250514', requiresKey:true, paid:true, defaultEnabled:false, supportsStream:true, pricePer1MIn:3, pricePer1MOut:15, signupUrl:'https://console.anthropic.com/', note:'Sonnet 4: ~£0.03/tool · highest quality codegen' }
];
const TABS = [
  { id:'welcome',   label:'Welcome' },
  { id:'personas',  label:'Personas' },
  { id:'goals',     label:'Goals' },
  { id:'routines',  label:'Routines' },
  { id:'journal',   label:'Journal' },
  { id:'knowledge', label:'Knowledge' },
  { id:'agents',    label:'Agents' },
  { id:'dashboard', label:'Dashboard' },
  { id:'build',     label:'Build' },
  { id:'providers', label:'LLM Providers' },
  { id:'packager',  label:'Fork Seed' },
  { id:'inspect',   label:'Inspect' },
  { id:'settings',  label:'Settings' },
  { id:'install',   label:'Install' }
];
let state = {
  active: 'welcome',
  currentPersona: 'creator',
  providerConfig: {},
  rateLimits: {},
  usage: {},
  webllmEngine: null,
  webllmStatus: 'unloaded',
  autoDetected: [],
  pkgDraft: null,
  cascadeTrace: []
};
const $ = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => [...p.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = p => (p || '') + '_' + Math.random().toString(36).slice(2, 11);
const now = () => Date.now();
const today = () => new Date().toISOString().slice(0,10);
function toast(m, err) { const t=$('#toast'); t.textContent=m; t.classList.toggle('err',!!err); t.classList.add('show'); clearTimeout(t._to); t._to=setTimeout(()=>t.classList.remove('show'),2400); }
function openModal(title, body) { $('#modalTitle').textContent=title; $('#modalBody').innerHTML=body; $('#modalBg').classList.add('open'); }
function closeModal() { $('#modalBg').classList.remove('open'); }
// ── IDB
const IDB_NAME = 'fallseed-creator-os-v1';
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('config'))    d.createObjectStore('config');
      if (!d.objectStoreNames.contains('goals'))     d.createObjectStore('goals',     { keyPath:'id' });
      if (!d.objectStoreNames.contains('routines'))  d.createObjectStore('routines',  { keyPath:'id' });
      if (!d.objectStoreNames.contains('journal'))   d.createObjectStore('journal',   { keyPath:'id' });
      if (!d.objectStoreNames.contains('knowledge')) d.createObjectStore('knowledge', { keyPath:'id' });
      if (!d.objectStoreNames.contains('agents'))    d.createObjectStore('agents',    { keyPath:'id' });
      if (!d.objectStoreNames.contains('checkins'))  d.createObjectStore('checkins',  { keyPath:'id' });
    };
    r.onsuccess = e => { db = e.target.result; res(db); };
    r.onerror = rej;
  });
}
function idbGet(s, k) { return new Promise(r => { const tx=db.transaction(s,'readonly'); const q=tx.objectStore(s).get(k); q.onsuccess=()=>r(q.result); }); }
function idbGetAll(s) { return new Promise(r => { const tx=db.transaction(s,'readonly'); const q=tx.objectStore(s).getAll(); q.onsuccess=()=>r(q.result||[]); }); }
function idbPut(s, v, k) { return new Promise(r => { const tx=db.transaction(s,'readwrite'); const o=tx.objectStore(s); const q=k!=null?o.put(v,k):o.put(v); q.onsuccess=()=>r(true); }); }
function idbDelete(s, k) { return new Promise(r => { const tx=db.transaction(s,'readwrite'); const q=tx.objectStore(s).delete(k); q.onsuccess=()=>r(true); }); }
function idbClear(s) { return new Promise(r => { const tx=db.transaction(s,'readwrite'); const q=tx.objectStore(s).clear(); q.onsuccess=()=>r(true); }); }
// ── P3 audit chain
async function sha256Hex(input) {
  const buf = new TextEncoder().encode(typeof input === 'string' ? input : JSON.stringify(input));
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,'0')).join('');
}
let chainHead = '0'.repeat(64);
async function chainNext(payload) {
  const prev = chainHead;
  const hash = await sha256Hex(prev + ':' + JSON.stringify(payload) + ':' + now());
  chainHead = hash; await idbPut('config', hash, 'chainHead');
  return { prevHash: prev, hash };
}
async function loadChainHead() { const h = await idbGet('config', 'chainHead'); if (h) chainHead = h; }
let SEED = JSON.parse(JSON.stringify(SEED_DEFAULT));
async function loadAll() {
  await __loadStoredFlavour && __loadStoredFlavour();
  if (!db) await openDB();
  await loadChainHead();
  state.providerConfig = await idbGet('config', 'providerConfig') || {};
  state.currentPersona = await idbGet('config', 'currentPersona') || 'creator';
  state.usage = await idbGet('config', 'usage') || {};
  const savedSeed = await idbGet('config', 'forkedSeed');
  if (savedSeed) SEED = savedSeed;
  for (const p of PROVIDERS) {
    if (!(p.id in state.providerConfig)) state.providerConfig[p.id] = { enabled:p.defaultEnabled, key:'', customModel:'' };
    if (!(p.id in state.usage)) state.usage[p.id] = { totalIn:0, totalOut:0, calls:0, lastUsed:0 };
  }
  await idbPut('config', state.providerConfig, 'providerConfig');
}
async function persistProviderConfig() { await idbPut('config', state.providerConfig, 'providerConfig'); }
async function persistPersona() { await idbPut('config', state.currentPersona, 'currentPersona'); }
async function persistUsage() { await idbPut('config', state.usage, 'usage'); }
// ── mesh · upgraded peer tracker
window.__fellowSeeds = window.__fellowSeeds || new Map();
let __sigChan = null, __pingTimer = null;
function __seedSelfInfo() {
  try { return { source:'fallseed-'+(SEED.manifest.name||'unknown'), name:SEED.manifest.name||'unknown', prime:SEED.manifest.prime, version:SEED.manifest.version, level:SEED.manifest.level??null, parent:SEED.manifest.parent||null, mesh:SEED.manifest.meshChannel, ts:Date.now() }; }
  catch(e) { return { source:'fallseed-unknown', ts:Date.now() }; }
}
function __pruneFellowSeeds(maxAgeMs) {
  const cutoff = Date.now() - (maxAgeMs||90000);
  for (const [k,v] of window.__fellowSeeds.entries()) if (v.lastSeen < cutoff) window.__fellowSeeds.delete(k);
}
function initMesh() {
  try {
    __sigChan = new BroadcastChannel('fall-signal');
    __sigChan.postMessage({ type:'hello', ...__seedSelfInfo() });
    __sigChan.onmessage = e => {
      const m = e.data||{}; if (!m.type) return;
      if (m.type === 'hello' || m.type === 'pong') {
        if (!m.source || m.source === __seedSelfInfo().source) return;
        const existing = window.__fellowSeeds.get(m.source) || {};
        window.__fellowSeeds.set(m.source, { ...existing, ...m, lastSeen: Date.now() });
        if (typeof state !== 'undefined' && state.active === 'inspect' && typeof render === 'function') try { render(); } catch(e) {}
      } else if (m.type === 'ping') {
        try { __sigChan.postMessage({ type:'pong', ...__seedSelfInfo() }); } catch(e) {}
      }
    };
    __pingTimer = setInterval(() => { try { __sigChan.postMessage({ type:'ping', ...__seedSelfInfo() }); __pruneFellowSeeds(90000); } catch(e) {} }, 30000);
  } catch(e) {}
}
async function autoDetectLocal() {
  state.autoDetected = [];
  await Promise.all([
    fetch('http://127.0.0.1:11434/api/tags').then(r => r.ok && state.autoDetected.push('ollama')).catch(()=>{}),
    fetch('http://127.0.0.1:1234/v1/models').then(r => r.ok && state.autoDetected.push('lmstudio')).catch(()=>{})
  ]);
}
function eligibleProviders() {
  return PROVIDERS.filter(p => state.providerConfig[p.id]?.enabled && (!p.requiresKey || state.providerConfig[p.id]?.key)).sort((a,b)=>a.priority-b.priority);
}
function trace(msg, level) {
  state.cascadeTrace.push({ ts:now(), msg, level:level||'info' });
  if (state.cascadeTrace.length > 50) state.cascadeTrace.shift();
}
function renderCascadeTrace() {
  el.innerHTML = state.cascadeTrace.map(l => `<div class="line ${l.level==='ok'?'ok':l.level==='fail'?'fail':''}">${new Date(l.ts).toLocaleTimeString()} ${esc(l.msg)}</div>`).join('') || '<div class="line">(no calls yet)</div>';
  el.scrollTop = el.scrollHeight;
}
async function cascadeChat(prompt, opts) {
  opts = opts || {};
  const onChunk = opts.onChunk || (() => {});
  let system = opts.system || SEED.buildPromptSystem || 'You are a helpful assistant.';
  // Prepend user flavour if available (sovereignty: matches user voice without depending on the lab that captured it)
  if (window.__flavourShortPrompt && !opts.skipFlavour) {
    system = '── USER FLAVOUR (from fallrecall) ──\n' + window.__flavourShortPrompt + '\n── END FLAVOUR ──\n\n' + system;
  }
  const elig = eligibleProviders();
  if (!elig.length) throw new Error('No providers enabled. Configure one in LLM Providers.');
  trace(`cascade starting · ${elig.length} eligible`);
  let lastErr = null;
  for (const p of elig) {
    trace(`→ trying ${p.name} (${p.tier})`);
    try {
      const out = await callProvider(p, system, prompt, onChunk);
      trace(`✓ ${p.name} returned ${out.length} chars`, 'ok');
      state.usage[p.id].calls++; state.usage[p.id].totalIn += (system+prompt).length; state.usage[p.id].totalOut += out.length; state.usage[p.id].lastUsed = now();
      await persistUsage();
      return { provider:p.id, text:out };
    } catch (e) { trace(`✗ ${p.name}: ${e.message}`, 'fail'); lastErr = e; }
  }
  throw new Error('All providers failed. Last: ' + (lastErr?.message || 'unknown'));
}
async function callProvider(p, system, prompt, onChunk) {
  const cfg = state.providerConfig[p.id] || {};
  const model = cfg.customModel || p.model;
  if (p.id === 'webllm') {
    if (state.webllmStatus !== 'ready') throw new Error('WebLLM not loaded');
    const reply = await state.webllmEngine.chat.completions.create({ messages:[{role:'system',content:system},{role:'user',content:prompt}], stream:true });
    let acc = ''; for await (const chunk of reply) { const d = chunk.choices[0]?.delta?.content||''; acc+=d; onChunk(d); } return acc;
  }
  if (p.id === 'google') {
    const url = p.endpoint + '?alt=sse&key=' + encodeURIComponent(cfg.key);
    const body = { systemInstruction:{parts:[{text:system}]}, contents:[{role:'user',parts:[{text:prompt}]}], generationConfig:{temperature:0.4,maxOutputTokens:4096} };
    const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
    if (!r.ok) throw new Error('Google ' + r.status + ': ' + await r.text());
    return await streamSSE(r, onChunk, 'google');
  }
  if (p.id === 'anthropic') {
    const r = await fetch(p.endpoint, { method:'POST', headers:{'content-type':'application/json','x-api-key':cfg.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}, body:JSON.stringify({ model, max_tokens:4096, stream:true, system, messages:[{role:'user',content:prompt}] }) });
    if (!r.ok) throw new Error('Anthropic ' + r.status);
    return await streamSSE(r, onChunk, 'anthropic');
  }
  const headers = { 'content-type':'application/json' };
  if (cfg.key) headers['authorization'] = 'Bearer ' + cfg.key;
  const r = await fetch(p.endpoint, { method:'POST', headers, body: JSON.stringify({ model, messages:[{role:'system',content:system},{role:'user',content:prompt}], stream:true, temperature:0.4 }) });
  if (!r.ok) throw new Error(p.name + ' ' + r.status + ': ' + (await r.text()).slice(0,160));
  return await streamSSE(r, onChunk, 'openai');
}
async function streamSSE(response, onChunk, kind) {
  const reader = response.body.getReader(); const dec = new TextDecoder();
  let buf = '', acc = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream:true });
    const lines = buf.split(/\r?\n/); buf = lines.pop()||'';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim(); if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data); let d = '';
        if (kind === 'anthropic') { if (j.type === 'content_block_delta') d = j.delta?.text||''; }
        else if (kind === 'google') { d = j.candidates?.[0]?.content?.parts?.[0]?.text||''; }
        else { d = j.choices?.[0]?.delta?.content||''; }
        if (d) { acc += d; onChunk(d); }
      } catch(e) {}
    }
  }
  return acc;
}
function jsLiteral(obj, indent=0) {
  const pad = '  '.repeat(indent), padNext = '  '.repeat(indent+1);
  if (obj === null) return 'null';
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (typeof obj === 'string') {
    if (obj.length > 80 || obj.includes('\n')) return '`'+obj.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$\{/g,'\\${')+'`';
    return "'"+obj.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
  }
  if (Array.isArray(obj)) { if (!obj.length) return '[]'; return '[\n'+obj.map(v=>padNext+jsLiteral(v,indent+1)).join(',\n')+'\n'+pad+']'; }
  if (typeof obj === 'object') { const keys=Object.keys(obj); if (!keys.length) return '{}'; return '{\n'+keys.map(k=>padNext+(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k)?k:JSON.stringify(k))+': '+jsLiteral(obj[k],indent+1)).join(',\n')+'\n'+pad+'}'; }
  return 'null';
}
// ═══════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════
function renderNav() {
  const nav = $('nav.tabs');
  nav.innerHTML = TABS.map(t => `<button data-tab="${t.id}" class="${state.active===t.id?'active':''}">${t.label}</button>`).join('');
  nav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
}
function switchTab(id) {
  state.active = id;
  $$('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab===id));
  $('#headerPersona').textContent = (SEED.personas[state.currentPersona]?.glyph||'◉') + ' ' + (SEED.personas[state.currentPersona]?.name||'persona');
  render();
}
function render() {
  const main = $('#main'); main.innerHTML = '';
  const fn = { welcome:renderWelcome, personas:renderPersonas, goals:renderGoals, routines:renderRoutines, journal:renderJournal, knowledge:renderKnowledge, agents:renderAgents, dashboard:renderDashboard, build:renderBuild, providers:renderProviders, packager:renderPackager, inspect:renderInspect, settings:renderSettings, install:renderInstall }[state.active] || renderWelcome;
  fn(main);
}
// ─── WELCOME ───────────────────────────────────────────────────
async function renderWelcome(main) {
  const p = SEED.personas[state.currentPersona];
  const goals = (await idbGetAll('goals')).filter(g => g.persona === state.currentPersona);
  const activeGoals = goals.filter(g => g.status === 'active').length;
  const routines = (await idbGetAll('routines')).filter(r => r.persona === state.currentPersona);
  main.innerHTML = `
    <div class="hero">
      <p class="lede">A sovereign single-HTML PWA for managing a personal operating system around a chosen persona. ${Object.keys(SEED.personas).length} persona presets shipped: ${Object.entries(SEED.personas).map(([k,p]) => p.glyph + ' ' + p.name).join(' · ')}. Goals, routines, journal, knowledge base, agent task library, dashboard — all on your device. Switch persona to swap the entire bundle.</p>
    </div>
    <div class="disclaimer"><strong>This is operational scaffolding, not licensed advice.</strong> No financial, medical or legal advice. The Investor persona tracks YOUR positions; the Researcher tracks YOUR notes; the Monk tracks YOUR practice. You bring the substance.</div>
    <div class="section-h"><h2>Active persona · ${p.glyph} ${esc(p.name)}</h2><div class="sub">${activeGoals} active goal${activeGoals===1?'':'s'} · ${routines.length} routine${routines.length===1?'':'s'}</div></div>
    <div class="card"><p style="font-size:13px;line-height:1.65;color:var(--cream-dim)">${esc(p.description)}</p></div>
    <div class="section-h"><h2>Get started</h2><div class="sub">three actions</div></div>
    <div class="card">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
        <div><h3>1. Pick a persona</h3><p style="color:var(--cream-dim);font-size:12px;line-height:1.6;margin-bottom:10px">Six personas pre-loaded. Each one bundles its own goal templates, routine templates, journal prompts, knowledge categories and agent tasks.</p><button class="btn brass sm" onclick="switchTab('personas')">Open Personas →</button></div>
        <div><h3>2. Adopt goal templates</h3><p style="color:var(--cream-dim);font-size:12px;line-height:1.6;margin-bottom:10px">Each persona ships with goal templates. Adopt them as a starter set, then edit / add / remove.</p><button class="btn brass sm" onclick="switchTab('goals')">Open Goals →</button></div>
        <div><h3>3. Start tracking</h3><p style="color:var(--cream-dim);font-size:12px;line-height:1.6;margin-bottom:10px">Daily journal entry, routine check-ins, knowledge capture — all stay on your device. The audit chain proves nothing was edited after the fact.</p><button class="btn brass sm" onclick="switchTab('journal')">Open Journal →</button></div>
      </div>
    </div>
  `;
}
// ─── PERSONAS ──────────────────────────────────────────────────
function renderPersonas(main) {
  main.innerHTML = `
    <div class="section-h"><h2>Personas</h2><div class="sub">click to switch · current = ${esc(SEED.personas[state.currentPersona].name)}</div></div>
    <div class="card"><p style="font-size:13px;color:var(--cream-dim);line-height:1.65">Switching persona changes which goal templates, routine templates, journal prompts, knowledge categories and agent tasks appear by default. Your existing records are tagged by persona, so switching doesn't delete anything — it filters.</p></div>
    <div class="persona-grid">
      ${Object.entries(SEED.personas).map(([k,p]) => `<div class="persona-card ${state.currentPersona===k?'active':''}" onclick="switchPersona('${k}')">
        ${state.currentPersona===k?'<span class="active-flag">active</span>':''}
        <div class="glyph">${p.glyph}</div>
        <div class="name">${esc(p.name)}</div>
        <div class="desc">${esc(p.description.slice(0,140))}…</div>
      </div>`).join('')}
    </div>
    <div class="section-h"><h2>${SEED.personas[state.currentPersona].glyph} ${esc(SEED.personas[state.currentPersona].name)} · what this persona ships</h2></div>
    <div class="card">
      <h3>Goal templates (${SEED.personas[state.currentPersona].goalTemplates.length})</h3>
      ${SEED.personas[state.currentPersona].goalTemplates.map(g => `<div style="padding:6px 0;font-size:13px"><span style="color:var(--brass);font-family:var(--mono);font-size:10px;letter-spacing:.08em;margin-right:8px">${esc(g.category)}</span>${esc(g.title)}</div>`).join('')}
    </div>
    <div class="card">
      <h3>Routine templates (${SEED.personas[state.currentPersona].routineTemplates.length})</h3>
      ${SEED.personas[state.currentPersona].routineTemplates.map(r => `<div style="padding:6px 0;font-size:13px"><span style="color:var(--brass);font-family:var(--mono);font-size:10px;letter-spacing:.08em;margin-right:8px">${esc(r.cadence)}</span>${esc(r.title)}</div>`).join('')}
    </div>
    <div class="card">
      <h3>Journal prompts</h3>
      ${SEED.personas[state.currentPersona].journalPrompts.map(j => `<div style="padding:6px 0;font-size:13px;color:var(--cream-dim);font-style:italic">"${esc(j)}"</div>`).join('')}
    </div>
    <div class="card">
      <h3>Agent task library</h3>
      ${SEED.personas[state.currentPersona].agentTasks.map(t => `<div style="padding:6px 0;font-size:13px">${esc(t)}</div>`).join('')}
    </div>
  `;
}
// ─── GOALS ─────────────────────────────────────────────────────
async function renderGoals(main) {
  const all = await idbGetAll('goals');
  const mine = all.filter(g => g.persona === state.currentPersona);
  const p = SEED.personas[state.currentPersona];
  const unadopted = p.goalTemplates.filter(t => !mine.find(g => g.title === t.title));
  main.innerHTML = `
    <div class="section-h"><h2>Goals · ${p.glyph} ${esc(p.name)}</h2><div class="sub">${mine.length} adopted · ${mine.filter(g=>g.status==='active').length} active</div></div>
    ${unadopted.length ? `<div class="card">
      <h3>Templates for this persona</h3>
      ${unadopted.map(t => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-soft)">
        <div><span style="color:var(--brass);font-family:var(--mono);font-size:10px;letter-spacing:.08em;margin-right:8px">${esc(t.category)}</span>${esc(t.title)}</div>
        <button class="btn brass sm" onclick="adoptGoal('${esc(t.title).replace(/'/g,"\\'")}', '${esc(t.category)}')">adopt</button>
      </div>`).join('')}
    </div>` : ''}
    <div class="section-h"><h2>Adopted goals</h2><div><button class="btn brass sm" onclick="addCustomGoal()">+ custom</button></div></div>
    ${mine.length ? mine.map(g => `<div class="goal-item">
      <div class="head"><div class="title">${esc(g.title)}</div><span class="status-pill ${g.status}">${g.status}</span></div>
      <div class="meta">category <span style="color:var(--brass)">${esc(g.category||'—')}</span> · adopted ${new Date(g.adoptedAt).toLocaleDateString()} ${g.due?'· due '+esc(g.due):''}</div>
      ${g.target ? `<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--cream-muted);font-family:var(--mono)"><span>progress</span><span>${g.progress||0} / ${g.target}</span></div><div class="progress-bar"><div style="width:${Math.min(100,((g.progress||0)/g.target)*100)}%"></div></div></div>` : ''}
      ${g.notes ? `<div style="margin-top:8px;font-size:12px;color:var(--cream-dim)">${esc(g.notes)}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:10px"><button class="btn sm" onclick="editGoal('${g.id}')">edit</button><button class="btn sm ghost" onclick="cycleGoalStatus('${g.id}')">cycle status</button><button class="btn sm danger" onclick="deleteGoal('${g.id}')">remove</button></div>
    </div>`).join('') : '<div class="empty-state">no goals adopted · pick from templates above or create a custom one</div>'}
  `;
}
  const g = { id: uid('g'), persona: state.currentPersona, title, category, status:'active', target:0, progress:0, notes:'', adoptedAt: now() };
  const c = await chainNext({kind:'goal.adopt', id:g.id, title}); g.prevHash=c.prevHash; g.hash=c.hash;
  await idbPut('goals', g); toast('goal adopted'); render();
};
  openModal('New goal', `
    <div class="field" style="margin-bottom:10px"><label>Title</label><input id="gTitle"></div>
    <div class="row"><div class="field"><label>Category</label><input id="gCat" value="custom"></div><div class="field"><label>Due (optional)</label><input id="gDue" type="date"></div></div>
    <div class="row"><div class="field"><label>Target (count, optional)</label><input id="gTarget" type="number" min="0"></div><div class="field"><label>Progress</label><input id="gProg" type="number" min="0" value="0"></div></div>
    <div class="field" style="margin-bottom:14px"><label>Notes</label><textarea id="gNotes"></textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost sm" onclick="closeModal()">cancel</button><button class="btn brass sm" onclick="saveCustomGoal()">save</button></div>
  `);
};
  const title = $('#gTitle').value.trim(); if (!title) { toast('title required', true); return; }
  const g = { id: uid('g'), persona: state.currentPersona, title, category: $('#gCat').value.trim()||'custom', status:'active', target: parseInt($('#gTarget').value,10)||0, progress: parseInt($('#gProg').value,10)||0, due: $('#gDue').value||'', notes: $('#gNotes').value.trim(), adoptedAt: now() };
  const c = await chainNext({kind:'goal.create', id:g.id, title}); g.prevHash=c.prevHash; g.hash=c.hash;
  await idbPut('goals', g); closeModal(); toast('goal saved'); render();
};
  const g = (await idbGetAll('goals')).find(x => x.id === id); if (!g) return;
  openModal('Edit goal', `
    <div class="field" style="margin-bottom:10px"><label>Title</label><input id="gTitle" value="${esc(g.title)}"></div>
    <div class="row"><div class="field"><label>Category</label><input id="gCat" value="${esc(g.category||'')}"></div><div class="field"><label>Status</label><select id="gStatus">${['active','paused','achieved','abandoned'].map(s=>`<option value="${s}" ${g.status===s?'selected':''}>${s}</option>`).join('')}</select></div></div>
    <div class="row"><div class="field"><label>Target</label><input id="gTarget" type="number" min="0" value="${g.target||0}"></div><div class="field"><label>Progress</label><input id="gProg" type="number" min="0" value="${g.progress||0}"></div></div>
    <div class="field" style="margin-bottom:10px"><label>Due</label><input id="gDue" type="date" value="${esc(g.due||'')}"></div>
    <div class="field" style="margin-bottom:14px"><label>Notes</label><textarea id="gNotes">${esc(g.notes||'')}</textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost sm" onclick="closeModal()">cancel</button><button class="btn brass sm" onclick="saveGoalEdit('${id}')">save</button></div>
  `);
};
  const g = (await idbGetAll('goals')).find(x => x.id === id);
  g.title = $('#gTitle').value.trim(); g.category = $('#gCat').value.trim(); g.status = $('#gStatus').value; g.target = parseInt($('#gTarget').value,10)||0; g.progress = parseInt($('#gProg').value,10)||0; g.due = $('#gDue').value||''; g.notes = $('#gNotes').value.trim(); g.lastModified = now();
  const c = await chainNext({kind:'goal.update', id:g.id, status:g.status}); g.prevHash=c.prevHash; g.hash=c.hash;
  await idbPut('goals', g); closeModal(); toast('saved'); render();
};
  const g = (await idbGetAll('goals')).find(x => x.id === id);
  const order = ['active','paused','achieved','abandoned']; g.status = order[(order.indexOf(g.status)+1)%order.length];
  const c = await chainNext({kind:'goal.cycle', id, status:g.status}); g.prevHash=c.prevHash; g.hash=c.hash;
  await idbPut('goals', g); render();
};
// ─── ROUTINES ──────────────────────────────────────────────────
async function renderRoutines(main) {
  const all = await idbGetAll('routines');
  const mine = all.filter(r => r.persona === state.currentPersona);
  const p = SEED.personas[state.currentPersona];
  const unadopted = p.routineTemplates.filter(t => !mine.find(r => r.title === t.title));
  const checkins = await idbGetAll('checkins');
  const todayDate = today();
  main.innerHTML = `
    <div class="section-h"><h2>Routines · ${p.glyph} ${esc(p.name)}</h2><div class="sub">${mine.length} adopted</div></div>
    ${unadopted.length ? `<div class="card">
      <h3>Templates for this persona</h3>
      ${unadopted.map(t => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-soft)">
        <div><span style="color:var(--brass);font-family:var(--mono);font-size:10px;letter-spacing:.08em;margin-right:8px">${esc(t.cadence)}</span>${esc(t.title)}</div>
        <button class="btn brass sm" onclick="adoptRoutine('${esc(t.title).replace(/'/g,"\\'")}', '${esc(t.cadence)}')">adopt</button>
      </div>`).join('')}
    </div>` : ''}
    <div class="section-h"><h2>Adopted routines</h2><div><button class="btn brass sm" onclick="addCustomRoutine()">+ custom</button></div></div>
    ${mine.length ? mine.map(r => {
      const todayCheck = checkins.find(c => c.routineId === r.id && c.date === todayDate);
      return `<div class="routine-item">
        <div class="head"><div class="title">${esc(r.title)}</div><span class="streak-badge">streak ${r.streak||0} ${r.cadence==='daily'?'d':r.cadence==='weekly'?'w':'mo'}</span></div>
        <div class="meta">${esc(r.cadence)} · last done ${r.lastDone?new Date(r.lastDone).toLocaleDateString():'never'}</div>
        <div style="display:flex;gap:6px;margin-top:10px">
          ${todayCheck ? `<button class="btn sm" disabled>✓ done today</button>` : `<button class="btn brass sm" onclick="checkRoutine('${r.id}')">check in today</button>`}
          <button class="btn sm" onclick="editRoutine('${r.id}')">edit</button>
          <button class="btn sm danger" onclick="deleteRoutine('${r.id}')">remove</button>
        </div>
      </div>`;
    }).join('') : '<div class="empty-state">no routines adopted · pick from templates or create a custom one</div>'}
  `;
}
  const r = { id: uid('r'), persona: state.currentPersona, title, cadence, streak:0, lastDone:null, adoptedAt: now() };
  const c = await chainNext({kind:'routine.adopt', id:r.id, title}); r.prevHash=c.prevHash; r.hash=c.hash;
  await idbPut('routines', r); toast('routine adopted'); render();
};
  openModal('New routine', `
    <div class="field" style="margin-bottom:10px"><label>Title</label><input id="rTitle"></div>
    <div class="field" style="margin-bottom:14px"><label>Cadence</label><select id="rCad"><option value="daily">daily</option><option value="weekly">weekly</option><option value="monthly">monthly</option></select></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost sm" onclick="closeModal()">cancel</button><button class="btn brass sm" onclick="saveCustomRoutine()">save</button></div>
  `);
};
  const title = $('#rTitle').value.trim(); if (!title) { toast('title required', true); return; }
  const r = { id: uid('r'), persona: state.currentPersona, title, cadence: $('#rCad').value, streak:0, lastDone:null, adoptedAt: now() };
  const c = await chainNext({kind:'routine.create', id:r.id, title}); r.prevHash=c.prevHash; r.hash=c.hash;
  await idbPut('routines', r); closeModal(); toast('routine saved'); render();
};
  const r = (await idbGetAll('routines')).find(x => x.id === id); if (!r) return;
  openModal('Edit routine', `
    <div class="field" style="margin-bottom:10px"><label>Title</label><input id="rTitle" value="${esc(r.title)}"></div>
    <div class="field" style="margin-bottom:14px"><label>Cadence</label><select id="rCad">${['daily','weekly','monthly'].map(c=>`<option value="${c}" ${r.cadence===c?'selected':''}>${c}</option>`).join('')}</select></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost sm" onclick="closeModal()">cancel</button><button class="btn brass sm" onclick="saveRoutineEdit('${id}')">save</button></div>
  `);
};
  const r = (await idbGetAll('routines')).find(x => x.id === id);
  r.title = $('#rTitle').value.trim(); r.cadence = $('#rCad').value;
  const c = await chainNext({kind:'routine.update', id:r.id}); r.prevHash=c.prevHash; r.hash=c.hash;
  await idbPut('routines', r); closeModal(); render();
};
  const r = (await idbGetAll('routines')).find(x => x.id === id);
  const todayDate = today();
  const checkins = await idbGetAll('checkins');
  if (checkins.find(c => c.routineId === id && c.date === todayDate)) { toast('already done today'); return; }
  // Increment streak if yesterday was also done OR streak was 0
  const lastDate = r.lastDone ? new Date(r.lastDone).toISOString().slice(0,10) : null;
  const yesterdayDate = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  r.streak = (lastDate === yesterdayDate || r.streak === 0) ? (r.streak||0) + 1 : 1;
  r.lastDone = now();
  const ck = { id: uid('ck'), routineId: id, persona: state.currentPersona, date: todayDate, ts: now() };
  const c = await chainNext({kind:'routine.checkin', id:ck.id, routineId:id, streak:r.streak});
  ck.prevHash = c.prevHash; ck.hash = c.hash;
  await idbPut('checkins', ck); await idbPut('routines', r);
  toast(`✓ checked in · streak ${r.streak}`); render();
};
// ─── JOURNAL ───────────────────────────────────────────────────
async function renderJournal(main) {
  const all = await idbGetAll('journal');
  const mine = all.filter(j => j.persona === state.currentPersona).sort((a,b) => b.ts - a.ts);
  const p = SEED.personas[state.currentPersona];
  const todayDate = today();
  const hasToday = mine.find(j => j.date === todayDate);
  main.innerHTML = `
    <div class="section-h"><h2>Journal · ${p.glyph} ${esc(p.name)}</h2><div class="sub">${mine.length} entries</div></div>
    ${!hasToday ? `<div class="card">
      <h3>Today's prompts</h3>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
        ${p.journalPrompts.map(pr => `<div style="font-style:italic;color:var(--cream-dim);font-size:13px">"${esc(pr)}"</div>`).join('')}
      </div>
      <textarea id="jContent" rows="6" placeholder="write…"></textarea>
      <div class="row" style="margin-top:10px"><div class="field"><label>Mood (1-5)</label><input id="jMood" type="number" min="1" max="5" value="3"></div><div class="field"><label></label><button class="btn brass" onclick="saveJournalEntry()" style="margin-top:14px">save today's entry</button></div></div>
    </div>` : `<div class="card"><p style="color:var(--green);font-family:var(--mono);font-size:12px">✓ today's entry captured at ${new Date(hasToday.ts).toLocaleTimeString()}</p></div>`}
    <div class="section-h"><h2>Past entries</h2></div>
    ${mine.length ? mine.map(j => `<div class="journal-item">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px"><div style="font-family:var(--mono);color:var(--brass);font-size:11px;letter-spacing:.06em">${esc(j.date)}</div><div class="meta">mood ${j.mood||'—'}</div></div>
      <div style="font-size:13px;color:var(--cream);white-space:pre-wrap">${esc(j.content)}</div>
      <div class="meta" style="margin-top:10px">prev hash <span style="color:var(--brass)">${(j.prevHash||'').slice(0,12)}…</span></div>
    </div>`).join('') : '<div class="empty-state">no entries yet</div>'}
  `;
}
  const content = $('#jContent').value.trim(); if (!content) { toast('write something', true); return; }
  const mood = parseInt($('#jMood').value,10)||3;
  const todayDate = today();
  const j = { id: uid('j'), persona: state.currentPersona, date: todayDate, content, mood, ts: now() };
  const c = await chainNext({kind:'journal.entry', id:j.id, date:todayDate});
  j.prevHash = c.prevHash; j.hash = c.hash;
  await idbPut('journal', j); toast('entry captured'); render();
};
// ─── KNOWLEDGE ─────────────────────────────────────────────────
async function renderKnowledge(main) {
  const all = await idbGetAll('knowledge');
  const mine = all.filter(k => k.persona === state.currentPersona).sort((a,b) => b.capturedAt - a.capturedAt);
  const p = SEED.personas[state.currentPersona];
  main.innerHTML = `
    <div class="section-h"><h2>Knowledge · ${p.glyph} ${esc(p.name)}</h2><div class="sub">${mine.length} items</div></div>
    <div class="card">
      <h3>Capture</h3>
      <div class="row3"><div class="field"><label>Kind</label><select id="kKind"><option value="note">note</option><option value="link">link</option><option value="highlight">highlight</option><option value="voice">voice / dictated</option></select></div><div class="field"><label>Category</label><select id="kCat">${p.knowledgeCategories.map(c => `<option value="${c}">${c}</option>`).join('')}</select></div><div class="field"><label>Source</label><input id="kSource" placeholder="url / book / person"></div></div>
      <div class="field" style="margin-bottom:10px"><label>Title</label><input id="kTitle"></div>
      <div class="field" style="margin-bottom:10px"><label>Content</label><textarea id="kContent" rows="5"></textarea></div>
      <div class="field" style="margin-bottom:10px"><label>Tags (comma-separated)</label><input id="kTags"></div>
      <button class="btn brass sm" onclick="saveKnowledge()">capture</button>
    </div>
    <div class="section-h"><h2>Library</h2></div>
    ${mine.length ? mine.map(k => `<div class="knowledge-item">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px"><div style="font-weight:600">${esc(k.title)}</div><div class="meta">${esc(k.kind)} · ${esc(k.category||'')}</div></div>
      <div style="font-size:12px;color:var(--cream-dim);margin-bottom:6px">${esc(k.content.slice(0,200))}${k.content.length>200?'…':''}</div>
      <div class="meta">${k.source?'source: '+esc(k.source)+' · ':''}captured ${new Date(k.capturedAt).toLocaleDateString()}${k.tags?.length?' · tags: '+k.tags.map(esc).join(', '):''}</div>
      <div style="margin-top:8px"><button class="btn sm danger" onclick="deleteKnowledge('${k.id}')">remove</button></div>
    </div>`).join('') : '<div class="empty-state">no items yet</div>'}
  `;
}
  const title = $('#kTitle').value.trim(); const content = $('#kContent').value.trim();
  if (!title || !content) { toast('title + content required', true); return; }
  const tags = $('#kTags').value.split(',').map(t=>t.trim()).filter(Boolean);
  const k = { id: uid('k'), persona: state.currentPersona, kind:$('#kKind').value, category:$('#kCat').value, source:$('#kSource').value.trim(), title, content, tags, capturedAt: now() };
  const c = await chainNext({kind:'knowledge.add', id:k.id, title}); k.prevHash=c.prevHash; k.hash=c.hash;
  await idbPut('knowledge', k); toast('captured'); render();
};
// ─── AGENTS ────────────────────────────────────────────────────
function renderAgents(main) {
  const p = SEED.personas[state.currentPersona];
  main.innerHTML = `
    <div class="section-h"><h2>Agent tasks · ${p.glyph} ${esc(p.name)}</h2><div class="sub">click to run via cascade</div></div>
    <div class="card">
      <p style="font-size:13px;color:var(--cream-dim);line-height:1.65">Persona-specific task library. Each task is a pre-written prompt that runs through the LLM cascade. Use the output as a starting point — copy-paste, refine, or pipe back into Journal / Knowledge.</p>
    </div>
    ${p.agentTasks.map((t,i) => `<div class="agent-item">
      <div style="font-weight:600;margin-bottom:8px">${esc(t)}</div>
      <button class="btn brass sm" onclick="runAgent(${i})">run via cascade →</button>
    </div>`).join('')}
    <div class="card" style="margin-top:18px">
      <h3>Cascade trace</h3>
      <div class="cascade-trace" id="cascadeTrace"></div>
    </div>
    <div class="card">
      <h3>Output</h3>
      <pre class="preview-area" id="agentOutput">(idle)</pre>
    </div>
  `;
  renderCascadeTrace();
}
  const p = SEED.personas[state.currentPersona];
  const task = p.agentTasks[idx]; if (!task) return;
  const out = $('#agentOutput');
  out.className = 'preview-area streaming'; out.textContent = '';
  try {
    await cascadeChat(task + '\n\n(Persona context: ' + p.name + ' — ' + p.description + ')', { onChunk: d => { out.textContent += d; out.scrollTop = out.scrollHeight; } });
    out.className = 'preview-area';
  } catch (e) { out.className = 'preview-area'; out.textContent = '✗ ' + e.message; }
};
// ─── DASHBOARD ─────────────────────────────────────────────────
async function renderDashboard(main) {
  const p = SEED.personas[state.currentPersona];
  const goals = (await idbGetAll('goals')).filter(g => g.persona === state.currentPersona);
  const routines = (await idbGetAll('routines')).filter(r => r.persona === state.currentPersona);
  const journal = (await idbGetAll('journal')).filter(j => j.persona === state.currentPersona);
  const knowledge = (await idbGetAll('knowledge')).filter(k => k.persona === state.currentPersona);
  const checkins = (await idbGetAll('checkins')).filter(c => c.persona === state.currentPersona);
  const weekAgo = Date.now() - 7*86400000;
  const thisWeekJournal = journal.filter(j => j.ts > weekAgo).length;
  const thisWeekCheckins = checkins.filter(c => c.ts > weekAgo).length;
  const longestStreak = routines.length ? Math.max(...routines.map(r => r.streak||0)) : 0;
  const activeGoals = goals.filter(g => g.status === 'active').length;
  const achievedGoals = goals.filter(g => g.status === 'achieved').length;
  main.innerHTML = `
    <div class="section-h"><h2>Dashboard · ${p.glyph} ${esc(p.name)}</h2><div class="sub">at-a-glance for this persona</div></div>
    <div class="inspect-grid">
      <div class="dash-widget"><div class="num">${activeGoals}</div><div class="lbl">Active goals</div></div>
      <div class="dash-widget"><div class="num">${achievedGoals}</div><div class="lbl">Goals achieved</div></div>
      <div class="dash-widget"><div class="num">${longestStreak}</div><div class="lbl">Longest streak</div></div>
      <div class="dash-widget"><div class="num">${thisWeekJournal}</div><div class="lbl">Journal entries this week</div></div>
      <div class="dash-widget"><div class="num">${thisWeekCheckins}</div><div class="lbl">Check-ins this week</div></div>
      <div class="dash-widget"><div class="num">${knowledge.length}</div><div class="lbl">Knowledge items</div></div>
    </div>
    <div class="section-h" style="margin-top:24px"><h2>Persona-specific widgets</h2></div>
    <div class="card">
      <p style="font-size:12px;color:var(--cream-dim);margin-bottom:10px">This persona's recommended dashboard widgets (extend via Build):</p>
      ${p.dashboardWidgets.map(w => `<div style="padding:6px 0;font-size:13px;border-bottom:1px solid var(--line-soft)">◇ ${esc(w)}</div>`).join('')}
    </div>
  `;
}
// ─── BUILD ─────────────────────────────────────────────────────
function renderBuild(main) {
  const p = SEED.personas[state.currentPersona];
  const examples = [
    `Add a "${p.name === 'Investor' ? 'portfolio rebalance' : p.name === 'Researcher' ? 'paper-summary' : 'progress-review'}" tool for this persona.`,
    `Generate 5 more goal templates for the ${p.name} persona, each with a clear measurable outcome.`,
    `Generate a custom persona "Founder" with goalTemplates, routineTemplates, journalPrompts, knowledgeCategories, agentTasks. Output as JSON matching the existing personas schema.`,
    `Suggest a weekly review template tailored for the ${p.name} persona.`,
  ];
  main.innerHTML = `
    <div class="section-h"><h2>Build</h2><div class="sub">cascade across enabled providers</div></div>
    <div class="card">
      <h3>What do you need?</h3>
      <textarea id="buildPrompt" rows="4" placeholder="Describe the tool, template, persona, or workflow you need…"></textarea>
    </div>
    <div class="card"><h3>Cascade trace</h3><div class="cascade-trace" id="cascadeTrace"></div></div>
    <div class="card"><h3>Output</h3><pre class="preview-area" id="buildOutput">(idle)</pre></div>
  `;
  renderCascadeTrace();
  $('#buildGo').addEventListener('click', async () => {
    const p = $('#buildPrompt').value.trim(); if (!p) { toast('enter a prompt', true); return; }
    const out = $('#buildOutput'); out.className = 'preview-area streaming'; out.textContent = '';
    try { await cascadeChat(p, { onChunk: d => { out.textContent += d; out.scrollTop = out.scrollHeight; } }); out.className = 'preview-area'; }
    catch (e) { out.className = 'preview-area'; out.textContent = '✗ ' + e.message; }
  });
}
// ─── PROVIDERS (reused pattern) ────────────────────────────────
function renderProviders(main) {
  main.innerHTML = `
    <div class="section-h"><h2>LLM providers</h2><div class="sub">priority order · auto-detected: ${state.autoDetected.length?state.autoDetected.join(', '):'none'}</div></div>
    <div class="card">
      ${PROVIDERS.map(p => {
        const cfg = state.providerConfig[p.id]||{};
        const tc = p.tier==='T1'?'t1':p.tier==='T2'?'t2':p.tier==='T3-free'?'tf':'tp';
        return `<div class="provider-row"><div class="toggle ${cfg.enabled?'on':''}" onclick="toggleProvider('${p.id}')"></div><div class="tier-tag ${tc}">${p.tier}</div><div><div class="nm">${esc(p.name)}</div><div style="font-size:10px;color:var(--cream-muted);font-family:var(--mono);margin-top:2px;letter-spacing:.04em">${esc(p.note)}</div></div>${p.requiresKey?`<input class="key-input" type="password" value="${esc(cfg.key||'')}" placeholder="${p.signupUrl?'get key →':'api key'}" onchange="setProviderKey('${p.id}', this.value)">`:'<div></div>'}<div class="status-mini">${p.requiresKey && !cfg.key?'<a href="'+(p.signupUrl||'#')+'" target="_blank" style="color:var(--brass)">sign up</a>':(cfg.enabled?'active':'off')}</div></div>`;
      }).join('')}
    </div>
    <div class="card">
      <h3>WebLLM (in-browser)</h3>
      <p style="font-size:12px;color:var(--cream-dim);margin-bottom:10px">First-load ~2GB. After that runs entirely on-device via WebGPU. No key. No network.</p>
      <button class="btn brass sm" id="loadWebllm">${state.webllmStatus==='ready'?'✓ ready':state.webllmStatus==='loading'?'loading…':'load model'}</button>
      <span id="webllmMsg" style="margin-left:10px;font-size:11px;color:var(--cream-muted)"></span>
    </div>
  `;
  $('#loadWebllm').addEventListener('click', loadWebLLM);
}
async function loadWebLLM() {
  state.webllmStatus = 'loading'; $('#webllmMsg').textContent = 'loading…';
  try {
    const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm');
    state.webllmEngine = await CreateMLCEngine('Llama-3.2-3B-Instruct-q4f16_1-MLC', { initProgressCallback: r => { const m=$('#webllmMsg'); if(m) m.textContent = r.text||'loading…'; } });
    state.webllmStatus = 'ready'; $('#webllmMsg').textContent = '✓ loaded';
  } catch (e) { state.webllmStatus = 'unloaded'; $('#webllmMsg').textContent = '✗ ' + e.message; }
}
// ─── FORK SEED PACKAGER ────────────────────────────────────────
function renderPackager(main) {
  if (!state.pkgDraft) state.pkgDraft = JSON.parse(JSON.stringify(SEED));
  main.innerHTML = `
    <div class="section-h"><h2>Fork Seed</h2><div class="sub">mutate · serialise · download</div></div>
    <div class="card">
      <h3>Mutate the seed</h3>
      <p style="font-size:12px;color:var(--cream-dim);margin-bottom:10px">Edit the SEED constant below. On <em>Fork into HTML</em>, the packager fetches this file, swaps SEED_DEFAULT, and downloads the mutated child. The child carries the same build engine + packager.</p>
      <textarea id="pkgJson" rows="20" style="font-family:var(--mono);font-size:11px">${esc(JSON.stringify(state.pkgDraft, null, 2))}</textarea>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn brass" id="pkgGo">Fork into HTML →</button>
        <button class="btn sm ghost" onclick="state.pkgDraft=JSON.parse(JSON.stringify(SEED_DEFAULT)); render()">reset to default</button>
      </div>
    </div>
  `;
  $('#pkgGo').addEventListener('click', forkSeed);
}
async function forkSeed() {
  let draft;
  try { draft = JSON.parse($('#pkgJson').value); } catch (e) { toast('invalid JSON: ' + e.message, true); return; }
  const html = await (await fetch(location.href, { cache:'reload' })).text();
  const start = html.indexOf('const SEED_DEFAULT = {');
  if (start < 0) { toast('source missing SEED_DEFAULT', true); return; }
  let depth = 0, end = -1;
  for (let i = start + 'const SEED_DEFAULT = '.length; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { end = i+1; break; } }
  }
  if (end < 0) { toast('parse failed', true); return; }
  while (end < html.length && html[end] === ' ') end++;
  if (html[end] === ';') end++;
  const newHtml = html.slice(0,start) + 'const SEED_DEFAULT = ' + jsLiteral(draft) + ';' + html.slice(end);
  const blob = new Blob([newHtml], { type:'text/html' });
  const a = document.createElement('a');
  const slug = (draft.manifest?.name || 'creator-os').replace(/[^a-z0-9]+/gi,'-');
  a.href = URL.createObjectURL(blob); a.download = 'fallseed-' + slug + '-fork.html'; a.click();
  toast('forked · saved');
}
// ─── INSPECT ───────────────────────────────────────────────────
async function renderInspect(main) {
  const goalCount = (await idbGetAll('goals')).length;
  const routineCount = (await idbGetAll('routines')).length;
  const journalCount = (await idbGetAll('journal')).length;
  const kCount = (await idbGetAll('knowledge')).length;
  main.innerHTML = `
    <div class="section-h"><h2>Inspect</h2><div class="sub">mesh + seed diagnostics</div></div>
    <div class="inspect-grid">
      <div class="inspect-card"><div class="num">${SEED.manifest.prime}</div><div class="lbl">Seed prime</div></div>
      <div class="inspect-card"><div class="num">L${SEED.manifest.level}</div><div class="lbl">Seed level</div></div>
      <div class="inspect-card"><div class="num">${Object.keys(SEED.personas).length}</div><div class="lbl">Personas loaded</div></div>
      <div class="inspect-card"><div class="num">${goalCount}</div><div class="lbl">Goals</div></div>
      <div class="inspect-card"><div class="num">${routineCount}</div><div class="lbl">Routines</div></div>
      <div class="inspect-card"><div class="num">${journalCount}</div><div class="lbl">Journal entries</div></div>
      <div class="inspect-card"><div class="num">${kCount}</div><div class="lbl">Knowledge items</div></div>
    </div>
    <div class="card" style="margin-top:18px">
      <h3>About this seed</h3>
      <p style="font-size:12px;color:var(--cream-dim);margin-bottom:8px">Level-2 behaviour seed in the FallSeed family. Root seed (not forked).</p>
      <p style="font-size:12px;color:var(--cream-dim);margin-bottom:8px">Implements the Fork Seed primitive — read the <a href="https://www.ai-nativesolutions.com/spec.html" target="_blank" rel="noopener" style="color:var(--brass)">public spec</a> for the four invariants of replication, the SEED schema, and the six-step fork protocol.</p>
      <p style="font-size:11px;color:var(--cream-muted);font-family:var(--mono);letter-spacing:.06em">level <span style="color:var(--brass)">2</span> · parent <span style="color:var(--brass)">null</span> · MIT</p>
    </div>
    <div class="card" style="margin-top:18px">
      <h3>Fellow seeds online</h3>
      <p style="font-size:12px;color:var(--cream-dim);margin-bottom:10px">Other FallSeeds reachable on this origin via <code style="color:var(--brass)">fall-signal</code> mesh.</p>
      <div id="fellowSeedsList" style="font-family:var(--mono);font-size:11px;color:var(--cream-dim)">${(function(){const peers=Array.from(window.__fellowSeeds?.values?.()||[]);if(!peers.length)return '<div style="color:var(--cream-muted)">none detected · open another FallSeed on this domain</div>';return peers.sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(p=>`<div style="padding:6px 0;border-bottom:1px solid var(--line-soft)"><span style="color:var(--brass)">${esc(p.source||'?')}</span> · prime ${esc(String(p.prime||'?'))} · v${esc(String(p.version||'?'))} · level ${esc(String(p.level??'?'))}</div>`).join('');})()}</div>
    </div>
    <div class="card" style="margin-top:18px">
      <h3>Flavour from fallrecall</h3>
      <p style="font-size:12px;color:var(--cream-dim);margin-bottom:10px">Pull your analysed flavour profile (voice, interests, preferences, anti-prefs) from <a href="https://sjgant80-hub.github.io/fallrecall/" target="_blank" rel="noopener" style="color:var(--brass)">fallrecall</a>. If fallrecall is open on this origin, the pull happens instantly via the cross-seed mesh.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <button class="btn brass sm" onclick="pullFlavourFromRecall()">⌬ pull flavour →</button>
        <a href="https://sjgant80-hub.github.io/fallrecall/" target="_blank" rel="noopener" class="btn sm ghost">open fallrecall ↗</a>
      </div>
      <div id="flavourStatus" style="font-family:var(--mono);font-size:11px;color:var(--cream-muted);letter-spacing:.04em">${(function(){if(!window.__flavourProfile)return '<span style="color:var(--cream-muted)">no profile loaded · click pull above (fallrecall must be open in another tab)</span>'; const p=window.__flavourProfile; return '<span style=\"color:var(--green)\">✓ loaded ' + new Date(window.__flavourLoadedAt).toLocaleString() + '</span><br>' + (p.voiceNotes?.length||0) + ' voice notes · ' + (p.recurringInterests?.length||0) + ' interests · ' + (p.preferences?.length||0) + ' preferences · ' + (p.antiPreferences?.length||0) + ' anti-prefs';})()}</div>
    </div>
    <div class="card">
      <h3>Audit chain head</h3>
      <div style="font-family:var(--mono);font-size:11px;color:var(--brass);word-break:break-all">${esc(chainHead)}</div>
    </div>
  `;
}
// ─── SETTINGS ──────────────────────────────────────────────────
function renderSettings(main) {
  main.innerHTML = `
    <div class="section-h"><h2>Settings</h2></div>
    <div class="card">
      <h3>Export / import</h3>
      <p style="font-size:12px;color:var(--cream-dim);margin-bottom:10px">Export everything (goals, routines, journal, knowledge, agents, check-ins, config + audit chain).</p>
      <div style="display:flex;gap:8px">
        <button class="btn brass sm" onclick="exportAll()">⬇ export JSON</button>
        <input id="importFile" type="file" accept=".json" style="display:none" onchange="importAll(this.files[0])">
      </div>
    </div>
    <div class="card">
      <h3>Wipe</h3>
      <p style="font-size:12px;color:var(--cream-dim);margin-bottom:10px">Removes every record. Cannot be undone.</p>
      <button class="btn danger sm" onclick="wipeAll()">⚠ wipe everything</button>
    </div>
  `;
}
  const b = { seed:SEED, config:{providerConfig:state.providerConfig, currentPersona:state.currentPersona, chainHead}, goals:await idbGetAll('goals'), routines:await idbGetAll('routines'), journal:await idbGetAll('journal'), knowledge:await idbGetAll('knowledge'), agents:await idbGetAll('agents'), checkins:await idbGetAll('checkins'), exportedAt:now() };
  const blob = new Blob([JSON.stringify(b,null,2)], { type:'application/json' });
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='fallseed-creator-os-export-'+today()+'.json'; a.click();
  toast('exported');
};
  if (!file) return;
  try {
    const b = JSON.parse(await file.text());
    if (b.seed) { SEED = b.seed; await idbPut('config', SEED, 'forkedSeed'); }
    if (b.config) { state.providerConfig = b.config.providerConfig||{}; state.currentPersona = b.config.currentPersona||'creator'; chainHead = b.config.chainHead||chainHead; await persistProviderConfig(); await persistPersona(); await idbPut('config', chainHead, 'chainHead'); }
    for (const st of ['goals','routines','journal','knowledge','agents','checkins']) { await idbClear(st); for (const r of (b[st]||[])) await idbPut(st, r); }
    toast('imported'); render();
  } catch (e) { toast('import failed: '+e.message, true); }
};
  if (!confirm('Wipe every record?')) return;
  for (const st of ['goals','routines','journal','knowledge','agents','checkins']) await idbClear(st);
  chainHead = '0'.repeat(64); await idbPut('config', chainHead, 'chainHead');
  toast('wiped'); render();
};
// ─── INSTALL ───────────────────────────────────────────────────
function renderInstall(main) {
  main.innerHTML = `
    <div class="section-h"><h2>Install</h2><div class="sub">save · or install as PWA</div></div>
    <div class="card"><h3>Install as PWA</h3><p style="font-size:12px;color:var(--cream-dim);margin-bottom:10px">Chrome / Edge: ⊕ in address bar, or menu → Apps → Install. iOS/Android: Share → Add to Home Screen.</p></div>
  `;
}
// ─── BOOT ──────────────────────────────────────────────────────
async function boot() {
  await openDB(); await loadAll(); initMesh(); await autoDetectLocal();
  renderNav(); render();
  $('#headerPersona').textContent = (SEED.personas[state.currentPersona]?.glyph||'◉') + ' ' + (SEED.personas[state.currentPersona]?.name||'persona');
}
boot().catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;bottom:20px;left:20px;background:#8b1a1a;color:#fff;padding:14px 18px;border-radius:4px;z-index:9999;font-family:monospace">boot failed: '+e.message+'</div>'); });
// ─── Flavour pull from fallrecall (2026-06-21) ──────────
window.__flavourProfile = null;
window.__flavourLoadedAt = null;
async function pullFlavourFromRecall() {
  try {
    if (typeof crossSeedRequest !== 'function') { toast('mesh not ready · refresh + try again', true); return; }
    toast('asking fallrecall for your flavour…');
    const resp = await crossSeedRequest('fallrecall', 'flavour-summary', {}, { timeoutMs: 4000 });
    if (!resp) { toast('no reply from fallrecall', true); return; }
    if (!resp.available) { toast('fallrecall has no profile yet · analyse some conversations there first', true); return; }
    window.__flavourProfile = resp.profile;
    window.__flavourShortPrompt = resp.shortPrompt || null;
    window.__flavourLoadedAt = Date.now();
    try { await idbPut('config', { profile: resp.profile, shortPrompt: resp.shortPrompt, loadedAt: window.__flavourLoadedAt }, 'flavour'); } catch(e) {}
    toast('✓ flavour pulled · ' + (resp.profile?.voiceNotes?.length||0) + ' voice notes loaded');
    if (typeof render === 'function') render();
  } catch (e) {
    if (e.message === 'timeout') toast('fallrecall not detected on this origin · open it in another tab first', true);
    else toast('pull failed: ' + e.message, true);
  }
}
async function __loadStoredFlavour() {
  try {
    const stored = await idbGet('config', 'flavour');
    if (stored) {
      window.__flavourProfile = stored.profile;
      window.__flavourShortPrompt = stored.shortPrompt;
      window.__flavourLoadedAt = stored.loadedAt;
    }
  } catch(e) {}
}

// Named exports for the primary API surface
export { loadConfig };
export { saveConfig };
export { $ };
export { esc };
export { aiTier };
export { renderAiChip };
export { loadWebLLM };
export { aiComplete };
export { aiCloudCall };
export { meshStart };

export { FALL_KIT_VERSION };
export { KCC_MINT_URL };
export { WEBLLM_MODELS };
export { DEFAULT_MODEL };
export { T3_PROVIDERS };
export { STATE };
export { MESH_CHANNEL };
export { STUN_SERVERS };
export { SEED_DEFAULT };
export { PROVIDERS };
