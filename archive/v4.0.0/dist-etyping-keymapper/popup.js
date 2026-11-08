'use strict';
const C = ETKMCore;
const $ = id => document.getElementById(id);
let config = C.settings(), activeTabId = null, current = null, busy = false;
function feedback(text, error = false) { $('feedback').textContent = text; $('feedback').className = `feedback${error ? ' error' : ''}`; }
function drawSettings() {
  $('showHud').checked = config.showHud; $('allowRepeat').checked = config.allowRepeat;
  $('defaultEnabled').checked = config.enabled; $('shortcut').value = config.shortcut;
}
function renderTab(result) {
  current = result;
  const frame = result?.frame, s = frame?.status;
  $('enabled').disabled = !result?.ok || busy;
  $('enabled').checked = result?.enabled ?? config.enabled;
  for (const id of ['reset', 'export']) $(id).disabled = !s?.ready || busy;
  $('followDefault').disabled = !result?.ok || result.override === null || busy;
  $('presses').textContent = s?.stats?.presses || 0;
  $('kpm').textContent = Math.round(s?.stats?.kpm || 0);
  $('correction').textContent = `${Math.round(s?.stats?.correctionRate || 0)}%`;
  const state = !frame ? null : s.state === 'error' ? 'error' : !frame.acknowledged ? 'loading' : s.state;
  $('statusText').textContent = state ? C.LABELS[state] : 'Chưa kết nối được khung bài';
  $('dot').className = `dot${state === 'typing' ? ' active' : !state || ['error', 'unsupported', 'unknown', 'composing'].includes(state) ? ' warn' : ''}`;
  $('detail').textContent = !frame ? 'Mở bài Romaji trên e-typing; tải lại trang nếu vừa cài extension.'
    : state === 'unsupported' ? 'Bản này chỉ hỗ trợ chế độ Romaji.'
    : state === 'unknown' ? 'Bật hiển thị Romaji trong game và kiểm tra lại bài.'
    : state === 'error' ? 'Tải lại trang để thử kết nối lại.'
    : result.override === null ? 'Đang dùng thiết lập mặc định.' : 'Đang dùng công tắc riêng cho tab này.';
}
async function refresh() {
  if (activeTabId === null) return;
  try { renderTab(await chrome.runtime.sendMessage({ type: 'GET_TAB_STATE', tabId: activeTabId })); }
  catch (_) { feedback('Không thể kết nối extension. Hãy tải lại trang.', true); }
}
async function saveSettings() {
  config = C.settings({ ...config, enabled: $('defaultEnabled').checked, showHud: $('showHud').checked, allowRepeat: $('allowRepeat').checked, shortcut: $('shortcut').value });
  try { await chrome.storage.local.set({ settings: config }); feedback('Đã lưu tùy chọn.'); await refresh(); }
  catch (_) { feedback('Không lưu được tùy chọn.', true); }
}
for (const id of ['showHud', 'allowRepeat', 'defaultEnabled', 'shortcut']) $(id).addEventListener('change', saveSettings);
async function tabToggle(enabled) {
  if (activeTabId === null) return;
  busy = true; renderTab(current);
  try {
    const result = await chrome.runtime.sendMessage({ type: 'SET_TAB_ENABLED', tabId: activeTabId, enabled });
    if (!result?.ok) throw new Error('save');
    feedback(enabled === null ? 'Tab đã theo thiết lập mặc định.' : 'Đã cập nhật công tắc tab.');
  } catch (_) { feedback('Không đổi được công tắc tab.', true); }
  finally { busy = false; await refresh(); }
}
$('enabled').addEventListener('change', () => tabToggle($('enabled').checked));
$('followDefault').addEventListener('click', () => tabToggle(null));
$('reset').addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'RESET_TAB_STATS', tabId: activeTabId });
    if (!response?.ok) throw new Error('reset');
    feedback('Đã đặt lại số liệu phiên.'); await refresh();
  } catch (_) { feedback('Không đặt lại được số liệu.', true); }
});
$('export').addEventListener('click', () => {
  if (!current?.frame?.status) return;
  const s = current.frame.status;
  const report = { extension: 'e-typing KeyMapper', version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(),
    scope: 'Mapped keydowns in the current game frame; not the game score. KPM excludes OS repeats.',
    stats: s.stats, processing: s.processing };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `etyping-session-${Date.now()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); feedback('Đã xuất số liệu; không chứa chuỗi phím gõ.');
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) { config = C.settings(changes.settings.newValue); drawSettings(); }
});
(async () => {
  try {
    const [stored, tabs] = await Promise.all([chrome.storage.local.get('settings'), chrome.tabs.query({ active: true, currentWindow: true })]);
    config = C.settings(stored.settings); drawSettings(); activeTabId = tabs[0]?.id ?? null;
    await refresh();
  } catch (_) { feedback('Không thể đọc cấu hình extension.', true); }
})();
