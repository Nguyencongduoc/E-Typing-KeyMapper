/**
 * Content Script (ISOLATED world)
 * Đồng bộ cấu hình từ chrome.storage sang MAIN world (injected.js) và hiển thị bảng HUD trạng thái
 */

(() => {
  // A popup reconnect can safely run this file again in an already open frame.
  const contentVersion = chrome.runtime.getManifest().version;
  if (window.__etypingContentVersion === contentVersion) {
    window.postMessage({ __etypingRefreshHud: true }, '*');
    return;
  }
  window.__etypingContentVersion = contentVersion;
  const DEFAULTS = {
    enabled: true,
    accuracy: 100,
    mode: 'hybrid',
    showHud: true
  };

  let config = { ...DEFAULTS };
  let lastMappedInfo = { physicalKey: '-', mappedKey: '-' };
  let engineTypingState = null;

  function syncConfigToMainWorld() {
    window.postMessage({ __etypingConfigUpdate: config }, '*');
  }

  chrome.storage.local.get(DEFAULTS, (items) => {
    config = { ...DEFAULTS, ...items };
    syncConfigToMainWorld();
  });

  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, { newValue }] of Object.entries(changes)) {
      config[key] = newValue;
    }
    syncConfigToMainWorld();
  });

  // Lắng nghe phím tắt bật/tắt nhanh: Alt + S hoặc F8
  window.addEventListener('keydown', (e) => {
    if ((e.altKey && e.code === 'KeyS') || e.key === 'F8') {
      e.preventDefault();
      config.enabled = !config.enabled;
      chrome.storage.local.set({ enabled: config.enabled });
      syncConfigToMainWorld();
      renderHUD();
    }
  }, true);

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.__etypingRefreshHud) renderHUD();
    if (e.data && e.data.__etypingHudUpdate) {
      lastMappedInfo = e.data.__etypingHudUpdate;
      renderHUD();
    }
    if (e.source === window && e.data && Object.prototype.hasOwnProperty.call(e.data, '__etypingEngineState')) {
      const state = e.data.__etypingEngineState;
      engineTypingState = state && typeof state.active === 'boolean' &&
        typeof state.remainingText === 'string' && typeof state.kanaText === 'string'
        ? state : null;
      renderHUD();
    }
  });

  function getTypingState() {
    if (engineTypingState) {
      return { kanaText: engineTypingState.kanaText, remainingText: engineTypingState.remainingText };
    }
    const kanaEl = document.getElementById('kanaText');
    const sentenceEl = document.getElementById('sentenceText');
    if (!sentenceEl) return null;

    const spans = sentenceEl.querySelectorAll('span');
    let remainingText = '';
    spans.forEach((span) => {
      if (!span.classList.contains('entered')) {
        remainingText += span.textContent;
      }
    });

    return {
      kanaText: kanaEl ? kanaEl.textContent.trim() : '',
      remainingText
    };
  }

  let hudEl = null;
  function renderHUD() {
    if (!document.body) return;

    const isTypingFrame = Boolean(
      document.getElementById('sentenceText') ||
      document.getElementById('start_btn') ||
      document.getElementById('start_msg') ||
      // Ad frames also live under /app/; only the actual game owns #app.
      document.getElementById('app')
    );

    if (!isTypingFrame) return;

    if (!config.showHud) {
      if (hudEl) hudEl.style.display = 'none';
      return;
    }

    if (!hudEl) {
      hudEl = document.getElementById('etyping-auto-hud');
    }
    if (!hudEl) {
      hudEl = document.createElement('div');
      hudEl.id = 'etyping-auto-hud';
      hudEl.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        z-index: 999999;
        background: rgba(15, 23, 42, 0.92);
        color: #f8fafc;
        padding: 8px 12px;
        border-radius: 8px;
        font-family: monospace, sans-serif;
        font-size: 12px;
        line-height: 1.5;
        border: 1px solid #38bdf8;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        pointer-events: none;
        min-width: 220px;
      `;
      document.body.appendChild(hudEl);
    }
    if (!hudEl.isConnected) document.body.appendChild(hudEl);

    hudEl.style.display = 'block';
    const state = getTypingState();
    const statusBadge = config.enabled
      ? '<span style="color:#22c55e;font-weight:bold;">● ON (Gõ phím bất kỳ)</span>'
      : '<span style="color:#ef4444;font-weight:bold;">● OFF</span>';

    const kanaDisplay = state && state.kanaText ? state.kanaText : '---';
    const romaDisplay = state && state.remainingText ? state.remainingText : '---';
    const nextChar = state && state.remainingText ? state.remainingText[0] : '-';

    hudEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid #334155;padding-bottom:3px;margin-bottom:4px;">
        <span>⌨️ <b>Key Remapper</b></span>
        ${statusBadge}
      </div>
      <div>Hiragana: <span style="color:#facc15;">${kanaDisplay}</span></div>
      <div>Romaji: <span style="color:#38bdf8;">${romaDisplay}</span></div>
      <div>Ký tự đích: <b style="color:#4ade80;">[ ${nextChar} ]</b> | Đổi thành: <b style="color:#f472b6;">${lastMappedInfo.mappedKey}</b></div>
    `;
  }

  setInterval(() => {
    window.postMessage({ __etypingStateRequest: true }, '*');
    renderHUD();
  }, 200);
})();
