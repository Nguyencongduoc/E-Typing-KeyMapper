const DEFAULTS = {
  enabled: true,
  accuracy: 100,
  blockRepeat: false,
  showHud: true
};

const els = {
  enabled: document.getElementById('enabled'),
  accuracy: document.getElementById('accuracy'),
  accuracyVal: document.getElementById('accuracyVal'),
  blockRepeat: document.getElementById('blockRepeat'),
  showHud: document.getElementById('showHud')
};

function updateUI(settings) {
  if (els.enabled) els.enabled.checked = settings.enabled;
  if (els.accuracy) els.accuracy.value = settings.accuracy;
  if (els.accuracyVal) els.accuracyVal.textContent = settings.accuracy;
  if (els.blockRepeat) els.blockRepeat.checked = Boolean(settings.blockRepeat);
  if (els.showHud) els.showHud.checked = settings.showHud;
}

function saveSettings() {
  const newSettings = {
    enabled: els.enabled.checked,
    accuracy: Number(els.accuracy.value),
    blockRepeat: els.blockRepeat ? els.blockRepeat.checked : false,
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
