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
