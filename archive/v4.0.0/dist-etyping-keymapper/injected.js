(function () {
  'use strict';
  if (window.__etkmInstalled) return;
  Object.defineProperty(window, '__etkmInstalled', { value: true });
  const C = ETKMCore;
  const mapper = new C.Mapper();
  let config = null, composing = false, patchFailed = false, pendingPublish = false;
  let last = { physicalKey: '—', mappedKey: '—' };
  let processing = { samples: 0, lastMs: 0, maxMs: 0 };
  let currentState = { state: 'unknown', expected: null, recognized: false };
  const send = (type, payload) => window.postMessage(C.message(type, payload), location.origin);
  function isEditable(target) {
    return target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],#etkm-hud'));
  }
  function effectiveState() {
    if (!config) return 'loading';
    if (!config.enabled) return 'disabled';
    if (patchFailed) return 'error';
    if (composing) return 'composing';
    if (!document.hasFocus() || document.visibilityState === 'hidden') return 'unfocused';
    if (isEditable(document.activeElement)) return 'editable';
    return currentState.state;
  }
  function publish() {
    pendingPublish = false;
    send('STATUS', { status: {
      state: effectiveState(), gameState: currentState.state, recognized: currentState.recognized,
      enabled: Boolean(config?.enabled), ready: Boolean(config), expected: currentState.expected,
      last: { ...last }, stats: mapper.snapshot(), processing: { ...processing }
    } });
  }
  function schedulePublish() {
    if (pendingPublish) return;
    pendingPublish = true;
    // Only telemetry is deferred; keyboard events themselves are handled synchronously below.
    requestAnimationFrame(publish);
  }
  const adapter = new ETKMAdapter.Adapter(state => { currentState = state; schedulePublish(); });
  function suppress(e) { e.preventDefault(); e.stopImmediatePropagation(); }
  function patch(e, char) {
    const props = C.keyProps(char, e.type);
    if (!props) return false;
    const old = Object.getOwnPropertyDescriptors(e);
    try {
      // Preflight avoids a partial mutation on a known non-configurable property.
      if (Object.keys(props).some(k => old[k] && !old[k].configurable)) return false;
      Object.defineProperties(e, Object.fromEntries(Object.entries(props).map(([key, value]) => [key, { configurable: true, get: () => value }])));
      return Object.entries(props).every(([key, value]) => e[key] === value);
    } catch (_) {
      for (const key of Object.keys(props)) {
        try { if (old[key]) Object.defineProperty(e, key, old[key]); else delete e[key]; } catch (_) { /* best-effort rollback */ }
      }
      return false;
    }
  }
  function onKey(e) {
    if (!e.isTrusted) return;
    if (e.type === 'keydown' && config && C.shortcut(e, config.shortcut) && !isEditable(e.target) && !e.isComposing) {
      suppress(e);
      config.enabled = !config.enabled;
      send('TOGGLE_REQUEST'); schedulePublish(); return;
    }
    const started = performance.now();
    const physicalId = C.identity(e);
    if (e.type === 'keydown') currentState = adapter.read();
    // Never finish a pending stroke inside an unrelated editable field.
    if (isEditable(e.target) || composing || e.isComposing || e.keyCode === 229) { mapper.clear(); return; }
    const result = mapper.handle(e, {
      enabled: Boolean(config?.enabled) && !patchFailed, allowRepeat: Boolean(config?.allowRepeat),
      focused: document.hasFocus() && document.visibilityState !== 'hidden',
      editable: false, composing, state: currentState.state, expected: currentState.expected
    });
    if (result.action === 'suppress') suppress(e);
    else if (result.action === 'patch') {
      if (!patch(e, result.char)) {
        suppress(e); patchFailed = true; mapper.clear();
        if (e.type !== 'keyup') mapper.held.set(physicalId, { pending: 'suppress', releaseChar: null });
      }
      else if (result.stroke) last = { physicalKey: result.physicalKey, mappedKey: result.char };
    }
    if (e.type === 'keydown' && result.stroke) {
      const elapsed = performance.now() - started;
      processing.samples++; processing.lastMs = elapsed; processing.maxMs = Math.max(processing.maxMs, elapsed);
    }
    if (result.action !== 'pass') schedulePublish();
  }
  for (const type of ['keydown', 'keypress', 'keyup']) window.addEventListener(type, onKey, true);
  window.addEventListener('compositionstart', () => { composing = true; mapper.clear(); schedulePublish(); }, true);
  window.addEventListener('compositionend', () => { composing = false; mapper.clear(); schedulePublish(); }, true);
  window.addEventListener('blur', () => { mapper.clear(); schedulePublish(); });
  window.addEventListener('focus', schedulePublish);
  document.addEventListener('visibilitychange', () => { if (document.hidden) mapper.clear(); schedulePublish(); });
  document.addEventListener('focusin', e => { if (isEditable(e.target)) mapper.clear(); schedulePublish(); }, true);
  window.addEventListener('pagehide', () => mapper.clear());
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== location.origin || !C.isMessage(e.data, ['HELLO', 'CONFIG', 'SNAPSHOT', 'RESET_STATS'])) return;
    if (e.data.type === 'CONFIG') {
      if (!e.data.config || typeof e.data.config.enabled !== 'boolean' || typeof e.data.config.allowRepeat !== 'boolean') return;
      config = C.settings(e.data.config);
      patchFailed = false;
      send('CONFIG_ACK');
    } else if (e.data.type === 'HELLO') send('READY');
    else if (e.data.type === 'RESET_STATS') { mapper.resetStats(); processing = { samples: 0, lastMs: 0, maxMs: 0 }; last = { physicalKey: '—', mappedKey: '—' }; }
    currentState = adapter.read(); publish();
  });
  send('READY');
})();
