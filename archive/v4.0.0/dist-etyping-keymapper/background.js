'use strict';
importScripts('core.js');
const C = ETKMCore;
const tabKey = id => `tabEnabled:${id}`;
const queues = new Map();
function serialize(tabId, task) {
  const pending = (queues.get(tabId) || Promise.resolve()).catch(() => {}).then(task);
  queues.set(tabId, pending);
  const cleanup = () => { if (queues.get(tabId) === pending) queues.delete(tabId); };
  pending.then(cleanup, cleanup);
  return pending;
}
function fromGame(sender) {
  if (!sender.tab || !Number.isInteger(sender.tab.id)) return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === 'https:' && ['www.e-typing.ne.jp', 'e-typing.ne.jp'].includes(url.hostname) && url.pathname === '/app/jsa_std/typing.asp';
  } catch (_) { return false; }
}
async function getSettings() {
  const data = await chrome.storage.local.get(['settings']);
  return C.settings(data.settings);
}
async function context(tabId) {
  const [stored, config] = await Promise.all([chrome.storage.session.get(tabKey(tabId)), getSettings()]);
  const override = stored[tabKey(tabId)];
  return { override: typeof override === 'boolean' ? override : null, enabled: typeof override === 'boolean' ? override : config.enabled };
}
async function setTab(tabId, enabled) {
  if (enabled === null) await chrome.storage.session.remove(tabKey(tabId));
  else await chrome.storage.session.set({ [tabKey(tabId)]: enabled });
  const state = await context(tabId);
  // This carries settings only. Individual keystrokes never pass through the worker.
  await chrome.tabs.sendMessage(tabId, { type: 'TAB_CONFIG', override: state.override }).catch(() => {});
  return state;
}
chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove(tabKey(tabId)).catch(() => {}); });
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || typeof msg !== 'object') return false;
  const task = async () => {
    if (fromGame(sender)) {
      if (msg.type === 'FRAME_CONTEXT') return { ok: true, ...await context(sender.tab.id) };
      if (msg.type === 'TOGGLE_TAB') {
        return serialize(sender.tab.id, async () => {
          const old = await context(sender.tab.id);
          return { ok: true, ...await setTab(sender.tab.id, !old.enabled) };
        });
      }
      return { ok: false, error: 'Thông điệp không được hỗ trợ.' };
    }
    if (sender.id !== chrome.runtime.id || sender.tab || !sender.url?.startsWith(chrome.runtime.getURL(''))) return { ok: false };
    if (!Number.isInteger(msg.tabId) || msg.tabId < 0) return { ok: false };
    if (msg.type === 'SET_TAB_ENABLED' && (typeof msg.enabled === 'boolean' || msg.enabled === null)) {
      return serialize(msg.tabId, async () => ({ ok: true, ...await setTab(msg.tabId, msg.enabled) }));
    }
    if (msg.type === 'GET_TAB_STATE') {
      const state = await context(msg.tabId);
      let frame = null;
      try { frame = await chrome.tabs.sendMessage(msg.tabId, { type: 'GET_FRAME_STATE' }); } catch (_) { /* No supported game frame in this tab. */ }
      return { ok: true, ...state, frame: frame?.ok ? frame : null };
    }
    if (msg.type === 'RESET_TAB_STATS') {
      try { return await chrome.tabs.sendMessage(msg.tabId, { type: 'RESET_STATS' }); }
      catch (_) { return { ok: false, error: 'Không tìm thấy frame bài tập.' }; }
    }
    return { ok: false };
  };
  task().then(respond).catch(() => respond({ ok: false, error: 'Không thể kết nối extension. Hãy tải lại trang.' }));
  return true;
});
