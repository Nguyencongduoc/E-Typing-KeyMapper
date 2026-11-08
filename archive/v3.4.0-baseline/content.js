/** ISOLATED world: storage + bounded HUD updates. Never handles individual typing strokes. */
(() => {
  const contentVersion = chrome.runtime.getManifest().version;
  const previous = window.__etypingContentController;
  if (previous?.version === contentVersion) {
    try { if (previous.isAlive()) { previous.attach(); return; } } catch (_) {}
  }
  try { previous?.dispose(); } catch (_) {}
  window.__etypingContentVersion = contentVersion;
  const DEFAULTS = { enabled: true, accuracy: 100, mode: 'hybrid', showHud: true };
  let config = { ...DEFAULTS }, engineTypingState = null;
  let lastMappedInfo = { physicalKey: '-', mappedKey: '-' };
  let hudEl = null, refs = null, renderPending = false, renderedEnabled = null;
  let toggleWrites = Promise.resolve(), pendingWrites = 0;
  let disposed = false, poll = null;
  const ownerToken = `${typeof performance !== 'undefined' ? performance.timeOrigin + performance.now() : Date.now()}:${Math.random().toString(36).slice(2)}`;
  let ownerConfirmed = false, configLoaded = false;
  const isGame = () => Boolean(document.getElementById('app') || document.getElementById('sentenceText') || document.getElementById('start_btn') || document.getElementById('start_msg'));
  const send = payload => window.postMessage(payload, '*');
  const sync = () => send({ __etypingConfigUpdate: config });

  chrome.storage.local.get(DEFAULTS, items => { if (disposed) return; configLoaded = true; config = { ...DEFAULTS, ...items }; sync(); scheduleRender(); refresh(); });
  function onStorage(changes, area) {
    if (area && area !== 'local') return;
    for (const key of Object.keys(DEFAULTS)) {
      if (changes[key] && !(key === 'enabled' && pendingWrites)) config[key] = changes[key].newValue ?? DEFAULTS[key];
    }
    sync(); scheduleRender();
  }
  function onMessage(e) {
    if (e.source !== window || !e.data) return;
    const data = e.data;
    if (typeof data.__etypingContentOwner === 'string') {
      if (data.__etypingContentOwner === ownerToken) ownerConfirmed = true;
      else if (ownerConfirmed) dispose();
      return;
    }
    if (Number.isInteger(data.__etypingRoundReady) && data.__etypingRoundReady > 0) {
      notifyReady(); if (configLoaded) sync(); refresh(); return;
    }
    if (data.__etypingToggleRequest && typeof data.__etypingToggleRequest.enabled === 'boolean') {
      const { enabled, sequence } = data.__etypingToggleRequest;
      if (!Number.isInteger(sequence) || sequence <= 0) return;
      config.enabled = enabled; pendingWrites++; scheduleRender();
      toggleWrites = toggleWrites.catch(() => {}).then(() => chrome.storage.local.set({ enabled })).then(() => {
        pendingWrites--;
        send({ __etypingToggleAck: sequence });
      }).catch(() => { pendingWrites--; });
    }
    if (data.__etypingHudUpdate) lastMappedInfo = data.__etypingHudUpdate;
    if (Object.prototype.hasOwnProperty.call(data, '__etypingEngineState')) {
      const s = data.__etypingEngineState;
      engineTypingState = s && typeof s.active === 'boolean' && typeof s.remainingText === 'string' && typeof s.kanaText === 'string' ? s : null;
    }
    if (data.__etypingRefreshHud || data.__etypingHudUpdate || Object.prototype.hasOwnProperty.call(data, '__etypingEngineState')) scheduleRender();
  }
  function typingState() {
    if (engineTypingState) return engineTypingState;
    const el = document.getElementById('sentenceText');
    let remainingText = '';
    if (el) for (const span of el.querySelectorAll('span')) if (!span.classList.contains('entered')) remainingText += span.textContent;
    return { kanaText: document.getElementById('kanaText')?.textContent.trim() || '', remainingText };
  }
  function buildHud() {
    hudEl = document.getElementById('etyping-auto-hud') || document.createElement('div');
    hudEl.id = 'etyping-auto-hud';
    hudEl.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:999999;background:rgba(15,23,42,.92);color:#f8fafc;padding:8px 12px;border-radius:8px;font-family:monospace,sans-serif;font-size:12px;line-height:1.5;border:1px solid #38bdf8;box-shadow:0 4px 12px rgba(0,0,0,.3);pointer-events:none;min-width:220px;';
    // Build once. Only changed text nodes are written during subsequent updates.
    hudEl.innerHTML = `<div style="display:flex;justify-content:space-between;border-bottom:1px solid #334155;padding-bottom:3px;margin-bottom:4px;"><span>⌨️ <b>Key Remapper</b></span><span data-field="status" style="font-weight:bold"></span></div><div>Hiragana: <span data-field="kana" style="color:#facc15"></span></div><div>Romaji: <span data-field="roma" style="color:#38bdf8"></span></div><div>Ký tự đích: <b data-field="next" style="color:#4ade80"></b> | Đổi thành: <b data-field="mapped" style="color:#f472b6"></b></div>`;
    refs = Object.fromEntries(['status','kana','roma','next','mapped'].map(key => [key, hudEl.querySelector(`[data-field="${key}"]`)]));
    document.body.appendChild(hudEl);
  }
  function text(el, value) { if (el.textContent !== value) el.textContent = value; }
  function renderHUD() {
    renderPending = false;
    if (disposed || !document.body || !isGame()) return;
    if (!config.showHud) { if (hudEl) hudEl.style.display = 'none'; return; }
    if (!hudEl) buildHud();
    if (!hudEl.isConnected) document.body.appendChild(hudEl);
    if (hudEl.style.display !== 'block') hudEl.style.display = 'block';
    const state = typingState();
    text(refs.status, config.enabled ? '● ON (Gõ phím bất kỳ)' : '● OFF');
    if (renderedEnabled !== config.enabled) {
      refs.status.style.color = config.enabled ? '#22c55e' : '#ef4444';
      renderedEnabled = config.enabled;
    }
    text(refs.kana, state.kanaText || '---'); text(refs.roma, state.remainingText || '---');
    text(refs.next, `[ ${state.remainingText?.[0] || '-'} ]`);
    text(refs.mapped, String(lastMappedInfo.mappedKey || '-'));
  }
  function scheduleRender() {
    if (disposed || renderPending || (!config.showHud && !hudEl)) return;
    renderPending = true; requestAnimationFrame(renderHUD);
  }
  function refresh() {
    if (disposed || !config.showHud || document.hidden || !isGame()) return;
    send({ __etypingStateRequest: true }); scheduleRender();
  }
  function notifyReady() {
    if (!/\/app\/(?:[^/]+\/)?typing\.asp$/i.test(location.pathname) && !isGame()) return;
    try { chrome.runtime.sendMessage({ type: 'ETYPING_DOCUMENT_READY' }).catch(() => {}); } catch (_) {}
  }
  function onPageShow() { refresh(); notifyReady(); }
  function detach() {
    try { chrome.storage.onChanged.removeListener(onStorage); } catch (_) {}
    window.removeEventListener('message', onMessage);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('visibilitychange', refresh);
    document.removeEventListener('DOMContentLoaded', onPageShow);
  }
  function attach() {
    detach();
    chrome.storage.onChanged.addListener(onStorage);
    window.addEventListener('message', onMessage);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', refresh);
    document.addEventListener('DOMContentLoaded', onPageShow, { once: true });
    if (poll === null && (/\/app\/(?:[^/]+\/)?typing\.asp$/i.test(location.pathname) || isGame())) poll = setInterval(refresh, 100);
    // A reloaded extension receives a fresh isolated world. Its predecessor still
    // has ordinary window listeners/timers, so MAIN arbitrates a single owner.
    if (!ownerConfirmed) send({ __etypingContentClaim: ownerToken });
    if (configLoaded) { sync(); refresh(); }
  }
  function dispose() {
    disposed = true; detach(); if (poll !== null) clearInterval(poll);
    delete window.__etypingContentController;
  }
  window.__etypingContentController = {
    version: contentVersion, attach,
    isAlive() { try { return !disposed && chrome.runtime.getManifest().version === contentVersion; } catch (_) { return false; } },
    dispose
  };
  attach(); notifyReady();
})();
