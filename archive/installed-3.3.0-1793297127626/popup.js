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

(() => {
  document.getElementById('extensionVersion').textContent = `v${chrome.runtime.getManifest().version} · Tự khởi động cùng bài tập`;
  const shortcut = document.getElementById('browserShortcut');
  chrome.commands.getAll().then(commands => {
    const key = commands.find(c => c.name === 'toggle-keymapper')?.shortcut;
    shortcut.textContent = key ? `Bật/tắt từ Chrome: ${key}` : 'Phím tắt chưa được gán hoặc đang trùng. Bấm Đổi phím tắt.';
  }).catch(() => {});
  document.getElementById('shortcutSettings').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
})();
