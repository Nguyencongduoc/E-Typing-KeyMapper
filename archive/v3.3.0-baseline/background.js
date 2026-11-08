// Browser-level shortcut. No keystrokes or typing traffic pass through this worker.
let toggleQueue = Promise.resolve();
function badge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#16865a' : '#64748b' }).catch(() => {});
}
function onBrowserCommand(command) {
  if (command !== 'toggle-keymapper') return Promise.resolve();
  toggleQueue = toggleQueue.catch(() => {}).then(async () => {
    const { enabled } = await chrome.storage.local.get({ enabled: true });
    await chrome.storage.local.set({ enabled: !enabled });
  });
  return toggleQueue;
}
chrome.commands.onCommand.addListener(onBrowserCommand);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) badge(changes.enabled.newValue !== false);
});
chrome.storage.local.get({ enabled: true }).then(({ enabled }) => badge(enabled)).catch(() => {});

// Automatic document lifecycle management. Never called from the typing hot path.
const documentJobs = new Map();
const tabJobs = new Map();
const reloadTimes = new Map();
const NAV_FILTER = { url: [{ hostEquals: 'e-typing.ne.jp' }, { hostSuffix: '.e-typing.ne.jp' }] };
function supportedURL(raw) {
  try {
    const u = new URL(raw);
    return ['http:', 'https:'].includes(u.protocol) &&
      (u.hostname === 'e-typing.ne.jp' || u.hostname.endsWith('.e-typing.ne.jp')) &&
      !/^\/app\/(?:ad_|css\/|js\/)/i.test(u.pathname);
  } catch (_) { return false; }
}
async function refreshLegacyTab(tabId) {
  if (Date.now() - (reloadTimes.get(tabId) || 0) < 15000) return;
  reloadTimes.set(tabId, Date.now());
  await chrome.tabs.reload(tabId);
}
function ensureDocument(details) {
  if (!Number.isInteger(details.tabId) || details.tabId < 0 || !supportedURL(details.url)) return Promise.resolve();
  const key = `${details.tabId}:${details.documentId || details.frameId || 0}`;
  if (documentJobs.has(key)) return documentJobs.get(key);
  const job = (async () => {
    const version = chrome.runtime.getManifest().version;
    const target = details.documentId ? { tabId: details.tabId, documentIds: [details.documentId] } : { tabId: details.tabId, frameIds: [details.frameId || 0] };
    const [before] = await chrome.scripting.executeScript({ target, world: 'MAIN', func: () => ({
      installed: window.__etypingRemapperInstalled === true,
      version: window.__etypingRemapperVersion || null,
      controller: Boolean(window.__etypingRemapperController)
    }) });
    if (before?.result?.installed && before.result.version !== version && !before.result.controller) {
      await refreshLegacyTab(details.tabId); return;
    }
    await chrome.scripting.executeScript({ target, world: 'MAIN', files: ['injected.js'] });
    await chrome.scripting.executeScript({ target, world: 'ISOLATED', files: ['content.js'] });
    const [after] = await chrome.scripting.executeScript({ target, world: 'MAIN', func: () => ({
      typingView: Boolean(document.getElementById('sentenceText')),
      health: window.__etypingRemapperController?.health()
    }) });
    // A pre-update document may have created its private engine before any hook existed.
    // Reload once automatically; subsequent documents are hooked before Start.
    if (after?.result?.typingView && !after.result.health?.engine) await refreshLegacyTab(details.tabId);
  })().catch(() => {});
  documentJobs.set(key, job);
  job.finally(() => { if (documentJobs.get(key) === job) documentJobs.delete(key); });
  return job;
}
function ensureTab(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return Promise.resolve();
  if (tabJobs.has(tabId)) return tabJobs.get(tabId);
  const job = (async () => {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    await Promise.all((frames || []).filter(f => supportedURL(f.url)).map(f => ensureDocument({ ...f, tabId })));
  })().catch(() => {});
  tabJobs.set(tabId, job);
  job.finally(() => { if (tabJobs.get(tabId) === job) tabJobs.delete(tabId); });
  return job;
}
async function ensureOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ['*://*.e-typing.ne.jp/*'] });
  await Promise.all(tabs.map(tab => ensureTab(tab.id)));
}
chrome.webNavigation.onCommitted.addListener(ensureDocument, NAV_FILTER);
chrome.webNavigation.onDOMContentLoaded.addListener(ensureDocument, NAV_FILTER);
chrome.runtime.onInstalled.addListener(() => { ensureOpenTabs().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { ensureOpenTabs().catch(() => {}); });
chrome.tabs.onActivated.addListener(({ tabId }) => { ensureTab(tabId); });
chrome.tabs.onRemoved.addListener(tabId => { tabJobs.delete(tabId); reloadTimes.delete(tabId); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'ETYPING_DOCUMENT_READY' || !sender.tab || !supportedURL(sender.url)) return false;
  ensureDocument({ tabId: sender.tab.id, frameId: sender.frameId, documentId: sender.documentId, url: sender.url })
    .then(() => respond({ ok: true }));
  return true;
});

// Preserve the sample's optional debugger code without activating debugger permissions.
(() => {
if (!chrome.debugger) return;
/**
 * Background Service Worker
 * Sử dụng chrome.debugger (Input.dispatchKeyEvent) để tạo sự kiện bàn phím phần cứng thật (isTrusted: true)
 * giúp e-typing ghi nhận 100% điểm số, KPM, Accuracy vào bảng kết quả cuối bài.
 */

const attachedTabs = new Set();

// Bảng mã phím chuẩn cho giao thức Chrome DevTools Protocol (Input.dispatchKeyEvent)
const KEY_MAP = {
  ' ': { code: 'Space', key: ' ', keyCode: 32, text: ' ' },
  '-': { code: 'Minus', key: '-', keyCode: 189, text: '-' },
  'ー': { code: 'Minus', key: '-', keyCode: 189, text: '-' },
  ',': { code: 'Comma', key: ',', keyCode: 188, text: ',' },
  '.': { code: 'Period', key: '.', keyCode: 190, text: '.' },
  '/': { code: 'Slash', key: '/', keyCode: 191, text: '/' },
  '!': { code: 'Digit1', key: '!', keyCode: 49, text: '!', modifiers: 8 }, // 8 = Shift
  '?': { code: 'Slash', key: '?', keyCode: 191, text: '?', modifiers: 8 },
  '[': { code: 'BracketLeft', key: '[', keyCode: 219, text: '[' },
  ']': { code: 'BracketRight', key: ']', keyCode: 221, text: ']' }
};

async function ensureDebuggerAttached(tabId) {
  if (attachedTabs.has(tabId)) return true;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attachedTabs.add(tabId);
    return true;
  } catch (err) {
    // Nếu đã attach trước đó
    if (err && String(err.message).includes('Already attached')) {
      attachedTabs.add(tabId);
      return true;
    }
    console.warn('Debugger attach error:', err);
    return false;
  }
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
});

async function sendTrustedKey(tabId, char) {
  const attached = await ensureDebuggerAttached(tabId);
  if (!attached) return false;

  if (char === 'ー' || char === '－') char = '-';

  let keyInfo = KEY_MAP[char];
  if (!keyInfo) {
    const lower = char.toLowerCase();
    const upper = char.toUpperCase();
    if (lower >= 'a' && lower <= 'z') {
      keyInfo = {
        code: `Key${upper}`,
        key: lower,
        keyCode: upper.charCodeAt(0),
        text: lower,
        modifiers: 0
      };
    } else if (char >= '0' && char <= '9') {
      keyInfo = {
        code: `Digit${char}`,
        key: char,
        keyCode: char.charCodeAt(0),
        text: char,
        modifiers: 0
      };
    } else {
      keyInfo = {
        code: '',
        key: char,
        keyCode: char.charCodeAt(0),
        text: char,
        modifiers: 0
      };
    }
  }

  const modifiers = keyInfo.modifiers || 0;

  try {
    // 1. Nhấn phím xuống (keyDown + char)
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      modifiers: modifiers,
      windowsVirtualKeyCode: keyInfo.keyCode,
      nativeVirtualKeyCode: keyInfo.keyCode,
      key: keyInfo.key,
      code: keyInfo.code,
      text: keyInfo.text,
      unmodifiedText: keyInfo.text
    });

    // 2. Nhả phím ra (keyUp)
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers: modifiers,
      windowsVirtualKeyCode: keyInfo.keyCode,
      nativeVirtualKeyCode: keyInfo.keyCode,
      key: keyInfo.key,
      code: keyInfo.code
    });

    return true;
  } catch (err) {
    attachedTabs.delete(tabId);
    console.warn('dispatchKeyEvent error:', err);
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'TYPE_KEY' && sender.tab && sender.tab.id) {
    sendTrustedKey(sender.tab.id, msg.char).then((ok) => {
      sendResponse({ ok });
    });
    return true; // giữ kênh bất đồng bộ
  }

  if (msg && msg.type === 'DETACH_DEBUGGER' && sender.tab && sender.tab.id) {
    const tabId = sender.tab.id;
    if (attachedTabs.has(tabId)) {
      chrome.debugger.detach({ tabId }).catch(() => {});
      attachedTabs.delete(tabId);
    }
    sendResponse({ ok: true });
    return false;
  }
});
})();
