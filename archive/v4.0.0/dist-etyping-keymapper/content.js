(function () {
  'use strict';
  const C = ETKMCore;
  let config = C.settings(), override = null, initialized = false, acknowledged = false, initializationFailed = false;
  let status = { state: 'loading', ready: false, enabled: false, stats: {}, last: { physicalKey: '—', mappedKey: '—' }, processing: {} };
  let host = null, refs = {}, framePending = false, dragging = false;
  const waiters = new Set();
  const effective = () => ({ ...config, enabled: typeof override === 'boolean' ? override : config.enabled });
  const send = (type, payload) => window.postMessage(C.message(type, payload), location.origin);
  function sync() {
    if (!initialized) return;
    acknowledged = false;
    send('CONFIG', { config: effective() });
    scheduleRender();
  }
  function validStatus(s) {
    if (!s || typeof s !== 'object' || !Object.hasOwn(C.LABELS, s.state)) return null;
    const number = value => Number.isFinite(value) && value >= 0 ? Math.min(value, 1e12) : 0;
    const text = value => typeof value === 'string' ? value.slice(0, 16) : '—';
    return {
      state: s.state, gameState: Object.hasOwn(C.LABELS, s.gameState) ? s.gameState : 'unknown',
      ready: s.ready === true, recognized: s.recognized === true, enabled: s.enabled === true,
      expected: typeof s.expected === 'string' ? s.expected.slice(0, 1) : null,
      last: { physicalKey: text(s.last?.physicalKey), mappedKey: text(s.last?.mappedKey) },
      stats: Object.fromEntries(['presses', 'repeats', 'corrected', 'correctionRate', 'kpm', 'averageGapMs'].map(k => [k, number(s.stats?.[k])])),
      processing: Object.fromEntries(['samples', 'lastMs', 'maxMs'].map(k => [k, number(s.processing?.[k])]))
    };
  }
  function snapshot() { return { ok: true, status, acknowledged, config: effective(), override }; }
  function requestSnapshot(respond, reset = false) {
    const complete = () => { clearTimeout(timeout); waiters.delete(complete); respond(snapshot()); };
    const timeout = setTimeout(complete, 600);
    waiters.add(complete);
    send(reset ? 'RESET_STATS' : 'SNAPSHOT');
  }
  window.addEventListener('message', async e => {
    if (e.source !== window || e.origin !== location.origin || !C.isMessage(e.data, ['READY', 'CONFIG_ACK', 'STATUS', 'TOGGLE_REQUEST'])) return;
    if (e.data.type === 'READY') sync();
    else if (e.data.type === 'CONFIG_ACK') { acknowledged = true; scheduleRender(); }
    else if (e.data.type === 'STATUS') {
      const next = validStatus(e.data.status);
      if (!next) return;
      status = next; scheduleRender();
      for (const done of Array.from(waiters)) done();
    } else if (e.data.type === 'TOGGLE_REQUEST' && initialized) {
      try {
        const result = await chrome.runtime.sendMessage({ type: 'TOGGLE_TAB' });
        if (result?.ok) override = result.override;
      } catch (_) { /* sync below restores the last saved setting. */ }
      sync();
    }
  });
  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg?.type === 'TAB_CONFIG' && (typeof msg.override === 'boolean' || msg.override === null)) {
      override = msg.override; sync(); respond({ ok: true }); return false;
    }
    if (msg?.type === 'GET_FRAME_STATE' || msg?.type === 'RESET_STATS') {
      requestSnapshot(respond, msg.type === 'RESET_STATS'); return true;
    }
    return false;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    config = C.settings(changes.settings.newValue); sync();
  });
  function make(tag, className, text, parent) {
    const el = document.createElement(tag); if (className) el.className = className;
    if (text) el.textContent = text; if (parent) parent.append(el); return el;
  }
  function buildHud() {
    host = document.createElement('div'); host.id = 'etkm-hud';
    host.style.cssText = 'all:initial;font:12px/1.5 system-ui,sans-serif;position:fixed;right:10px;bottom:10px;z-index:2147483647;display:block;width:238px;max-width:calc(100vw - 16px);color-scheme:dark;';
    const root = host.attachShadow({ mode: 'open' });
    const style = make('style', '', '', root);
    style.textContent = `
      *{box-sizing:border-box} :host{font-family:system-ui,sans-serif;font-size:12px}
      .panel{color:#e8edf5;background:rgba(15,23,42,.96);border:1px solid #354359;border-radius:12px;box-shadow:0 6px 24px #0004;overflow:hidden}
      .head{display:flex;align-items:center;gap:7px;padding:9px 11px;border-bottom:1px solid #354359;cursor:grab;touch-action:none;user-select:none;font-weight:700}
      .dot{width:7px;height:7px;border-radius:50%;background:#94a3b8}.dot.active{background:#5ee0ad}.dot.error{background:#fbbf24}
      .badge{margin-left:auto;font-size:10px;letter-spacing:.06em;color:#a5b4cb}
      .body{padding:9px 11px;line-height:1.5}.state{color:#aebfd5;margin-bottom:7px;font-size:11px}
      .keys{display:flex;gap:8px;align-items:center}.key{background:#24324a;border:1px solid #43526b;border-radius:5px;min-width:26px;text-align:center;font:600 14px ui-monospace,monospace;padding:1px 6px;white-space:pre}
      .mapped{color:#7ce7bc}.label{font-size:10px;color:#a5b4cb}.metrics{display:flex;justify-content:space-between;gap:6px;margin-top:8px;font-size:11px}.hint{padding:6px 11px;background:#0c1424;color:#94a3b8;font-size:10px}
    `;
    const panel = make('section', 'panel', '', root); panel.setAttribute('aria-label', 'Trạng thái KeyMapper');
    const head = make('div', 'head', '', panel);
    refs.dot = make('span', 'dot', '', head); make('span', '', 'KeyMapper', head); refs.badge = make('span', 'badge', '', head);
    const body = make('div', 'body', '', panel); refs.state = make('div', 'state', '', body);
    const keys = make('div', 'keys', '', body); make('span', 'label', 'Phím thật', keys);
    refs.physical = make('span', 'key', '—', keys); make('span', 'label', '→', keys); refs.mapped = make('span', 'key mapped', '—', keys);
    const metrics = make('div', 'metrics', '', body); refs.presses = make('span', '', '', metrics); refs.kpm = make('span', '', '', metrics);
    refs.hint = make('div', 'hint', '', panel);
    head.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const rect = host.getBoundingClientRect();
      const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
      dragging = true; head.setPointerCapture(e.pointerId);
      const move = event => place({ x: event.clientX - dx, y: event.clientY - dy });
      const finish = () => {
        head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', finish); head.removeEventListener('pointercancel', finish);
        dragging = false;
        const pos = host.getBoundingClientRect();
        savePosition({ x: pos.left, y: pos.top });
      };
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', finish); head.addEventListener('pointercancel', finish);
    });
    document.documentElement.append(host);
  }
  async function savePosition(position) {
    try {
      const stored = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...C.settings(stored.settings), hudPosition: position } });
    } catch (_) { /* An extension reload invalidates this content script. */ }
  }
  function place(position) {
    if (!host || !position) return;
    const rect = host.getBoundingClientRect();
    host.style.left = `${Math.max(8, Math.min(position.x, innerWidth - rect.width - 8))}px`;
    host.style.top = `${Math.max(8, Math.min(position.y, innerHeight - rect.height - 8))}px`;
    host.style.right = 'auto'; host.style.bottom = 'auto';
  }
  function render() {
    framePending = false;
    if (!document.documentElement) return;
    if (!config.showHud) { if (host) host.style.display = 'none'; return; }
    if (!host) buildHud();
    host.style.display = 'block';
    const state = initializationFailed ? 'error' : !initialized || !acknowledged ? 'loading' : status.state;
    const active = state === 'typing';
    refs.dot.className = `dot${active ? ' active' : state === 'error' ? ' error' : ''}`;
    refs.badge.textContent = effective().enabled ? 'BẬT' : 'TẮT';
    refs.state.textContent = C.LABELS[state] || C.LABELS.unknown;
    refs.physical.textContent = status.last.physicalKey === ' ' ? '␣' : status.last.physicalKey;
    refs.mapped.textContent = status.last.mappedKey === ' ' ? '␣' : status.last.mappedKey;
    refs.presses.textContent = `${status.stats.presses || 0} lượt bấm`;
    refs.kpm.textContent = `${Math.round(status.stats.kpm || 0)} KPM bấm`;
    refs.hint.textContent = `${config.shortcut === 'None' ? 'Bật/tắt trong popup' : `${config.shortcut === 'AltS' ? 'Alt + S' : 'F8'} bật/tắt`} · Kéo tiêu đề để di chuyển`;
    if (!dragging) place(config.hudPosition);
  }
  function scheduleRender() {
    if (framePending || (!config.showHud && !host)) return;
    framePending = true; requestAnimationFrame(render);
  }
  window.addEventListener('resize', () => { if (host) { const r = host.getBoundingClientRect(); place({ x: r.left, y: r.top }); } });
  Promise.all([chrome.storage.local.get('settings'), chrome.runtime.sendMessage({ type: 'FRAME_CONTEXT' })]).then(([stored, context]) => {
    if (!context?.ok) throw new Error('context');
    config = C.settings(stored.settings); override = context.override; initialized = true;
    send('HELLO'); sync();
  }).catch(() => { initializationFailed = true; status.state = 'error'; scheduleRender(); });
})();
