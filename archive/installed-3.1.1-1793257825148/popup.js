const DEFAULTS = {
  enabled: true,
  accuracy: 100,
  showHud: true
};

const els = {
  enabled: document.getElementById('enabled'),
  accuracy: document.getElementById('accuracy'),
  accuracyVal: document.getElementById('accuracyVal'),
  showHud: document.getElementById('showHud')
};

function updateUI(settings) {
  els.enabled.checked = settings.enabled;
  els.accuracy.value = settings.accuracy;
  els.accuracyVal.textContent = settings.accuracy;
  els.showHud.checked = settings.showHud;
}

function saveSettings() {
  const newSettings = {
    enabled: els.enabled.checked,
    accuracy: Number(els.accuracy.value),
    showHud: els.showHud.checked
  };
  updateUI(newSettings);
  chrome.storage.local.set(newSettings);
}

chrome.storage.local.get(DEFAULTS, (items) => {
  updateUI(items);
});

Object.values(els).forEach((el) => {
  if (el && el.tagName === 'INPUT') {
    el.addEventListener('input', saveSettings);
    el.addEventListener('change', saveSettings);
  }
});

// Additional connection recovery for tabs/frames opened before the extension was loaded.
(() => {
  const label = document.getElementById('connectionStatus');
  const button = document.getElementById('reconnect');
  async function connect() {
    button.disabled = true;
    const version = chrome.runtime.getManifest().version;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab?.url || 'about:blank');
      if (!['http:', 'https:'].includes(url.protocol) || !(url.hostname === 'e-typing.ne.jp' || url.hostname.endsWith('.e-typing.ne.jp'))) {
        label.textContent = `v${version} · Mở tab e-typing để kết nối.`;
        return;
      }
      const target = { tabId: tab.id, allFrames: true };
      const probes = await chrome.scripting.executeScript({ target, world: 'MAIN', func: () => ({
        game: Boolean(document.getElementById('app') || document.getElementById('sentenceText') || document.getElementById('start_btn') || document.getElementById('start_msg')),
        main: window.__etypingRemapperInstalled === true
      }) });
      const games = probes.filter(p => p.result?.game);
      if (!games.length) {
        label.textContent = `v${version} · Chưa mở khung bài. Mở bài rồi kiểm tra lại.`;
        return;
      }
      const missing = games.filter(p => !p.result.main).map(p => p.frameId);
      if (missing.length) await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: missing }, world: 'MAIN', files: ['injected.js'] });
      const frameTarget = { tabId: tab.id, frameIds: games.map(p => p.frameId) };
      await chrome.scripting.executeScript({ target: frameTarget, world: 'ISOLATED', files: ['content.js'] });
      const states = await chrome.scripting.executeScript({ target: frameTarget, world: 'MAIN', func: () => new Promise(resolve => {
        const timeout = setTimeout(() => { window.removeEventListener('message', listener); resolve(null); }, 1000);
        function listener(e) {
          if (e.source !== window || !e.data || !Object.prototype.hasOwnProperty.call(e.data, '__etypingEngineState')) return;
          clearTimeout(timeout); window.removeEventListener('message', listener);
          const state = e.data.__etypingEngineState;
          resolve({ engine: Boolean(state), active: state?.active === true, hud: Boolean(document.getElementById('etyping-auto-hud')) });
        }
        window.addEventListener('message', listener);
        window.postMessage({ __etypingStateRequest: true }, '*');
      }) });
      if (states.some(s => s.result?.engine)) label.textContent = `v${version} · Đã kết nối engine · Romaji ON/OFF.`;
      else if (missing.length) label.textContent = `v${version} · Đã nạp lại script. Mở lại bài để dùng Romaji OFF.`;
      else label.textContent = `v${version} · Script đã kết nối. Bấm Start hoặc mở lại bài để nối engine.`;
    } catch (error) {
      label.textContent = `v${version} · Chưa kết nối: ${String(error.message || error).slice(0, 160)}`;
    } finally { button.disabled = false; }
  }
  button.addEventListener('click', connect);
  connect();
})();
