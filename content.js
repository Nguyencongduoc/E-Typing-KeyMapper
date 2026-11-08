/**
 * Content Script (ISOLATED world)
 * Đồng bộ cấu hình từ chrome.storage sang MAIN world (injected.js) và hiển thị bảng HUD trạng thái
 */

(() => {
  const DEFAULTS = {
    enabled: true,
    accuracy: 100,
    blockRepeat: false,
    mode: 'hybrid',
    showHud: true
  };

  let config = { ...DEFAULTS };
  let lastMappedInfo = {
    physicalKey: '-',
    mappedKey: '-',
    nextChar: '-',
    engineKana: null,
    engineRemaining: null
  };

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
    renderHUD();
  });

  // Chỉ bật/tắt bằng Ctrl + Shift + F8 trong trang e-typing.
  window.addEventListener('keydown', (e) => {
    const isToggleShortcut = e.code === 'F8' && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey;
    if (!isToggleShortcut || e.isComposing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Một lần nhấn chỉ đổi trạng thái một lần, kể cả khi giữ phím.
    if (e.repeat) return;
    config.enabled = !config.enabled;
    chrome.storage.local.set({ enabled: config.enabled });
    syncConfigToMainWorld();
    renderHUD();
  }, true);

  window.addEventListener('message', (e) => {
    if (e.data && e.data.__etypingHudUpdate) {
      lastMappedInfo = { ...lastMappedInfo, ...e.data.__etypingHudUpdate };
      renderHUD();
    }
  });

  function getTypingState() {
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
  let hudNodes = null;

  function initHUD() {
    hudEl = document.createElement('div');
    hudEl.id = 'etyping-auto-hud';
    hudEl.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      z-index: 999999;
      background: rgba(15, 23, 42, 0.94);
      color: #f8fafc;
      padding: 8px 12px;
      border-radius: 8px;
      font-family: monospace, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      border: 1px solid #38bdf8;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      pointer-events: none;
      min-width: 230px;
      user-select: none;
    `;

    hudEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid #334155;padding-bottom:3px;margin-bottom:4px;">
        <span>⌨️ <b>Key Remapper</b></span>
        <span id="etkm-hud-status"></span>
      </div>
      <div>Hiragana: <span id="etkm-hud-kana" style="color:#facc15;">---</span></div>
      <div>Romaji: <span id="etkm-hud-roma" style="color:#38bdf8;">---</span></div>
      <div>Ký tự đích: <b id="etkm-hud-target" style="color:#4ade80;">[ - ]</b> | Đổi thành: <b id="etkm-hud-mapped" style="color:#f472b6;">-</b></div>
    `;

    document.body.appendChild(hudEl);
    hudNodes = {
      status: hudEl.querySelector('#etkm-hud-status'),
      kana: hudEl.querySelector('#etkm-hud-kana'),
      roma: hudEl.querySelector('#etkm-hud-roma'),
      target: hudEl.querySelector('#etkm-hud-target'),
      mapped: hudEl.querySelector('#etkm-hud-mapped')
    };
  }

  function renderHUD() {
    if (!document.body) return;

    const isTypingFrame = Boolean(
      document.getElementById('sentenceText') ||
      document.getElementById('start_btn') ||
      document.getElementById('start_msg') ||
      location.pathname.includes('/app/')
    );

    if (!isTypingFrame) return;

    if (!config.showHud) {
      if (hudEl) hudEl.style.display = 'none';
      return;
    }

    if (!hudEl) {
      initHUD();
    }

    hudEl.style.display = 'block';
    const state = getTypingState();

    // Cập nhật trạng thái ON/OFF
    const statusText = config.enabled ? '● ON (Gõ phím bất kỳ)' : '● OFF';
    const statusColor = config.enabled ? '#22c55e' : '#ef4444';
    if (hudNodes.status.textContent !== statusText) {
      hudNodes.status.textContent = statusText;
      hudNodes.status.style.color = statusColor;
      hudNodes.status.style.fontWeight = 'bold';
    }

    // Ưu tiên đọc từ DOM, nếu Romaji OFF thì fallback sang dữ liệu đọc từ engine
    const kanaDisplay = (state && state.kanaText) || lastMappedInfo.engineKana || '---';
    const isRomajiOff = (!state || !state.remainingText) && Boolean(lastMappedInfo.engineRemaining);
    const romaDisplay = (state && state.remainingText)
      ? state.remainingText
      : (lastMappedInfo.engineRemaining ? `${lastMappedInfo.engineRemaining} (Romaji-OFF)` : '---');

    const nextChar = (state && state.remainingText && state.remainingText[0])
      ? state.remainingText[0]
      : (lastMappedInfo.nextChar && lastMappedInfo.nextChar !== '-' ? lastMappedInfo.nextChar : '-');

    const targetDisplay = `[ ${nextChar} ]`;

    // Dirty-checking textContent để tối ưu 100% hiệu năng, triệt tiêu DOM reflow
    if (hudNodes.kana.textContent !== kanaDisplay) hudNodes.kana.textContent = kanaDisplay;
    if (hudNodes.roma.textContent !== romaDisplay) hudNodes.roma.textContent = romaDisplay;
    if (hudNodes.target.textContent !== targetDisplay) hudNodes.target.textContent = targetDisplay;
    if (hudNodes.mapped.textContent !== lastMappedInfo.mappedKey) hudNodes.mapped.textContent = lastMappedInfo.mappedKey;
  }

  setInterval(renderHUD, 200);
})();
