/**
 * Chạy trực tiếp trong MAIN world ở thời điểm document_start (trước khi script của e-typing chạy).
 * Không bao giờ tự động gõ!
 * Chỉ khi người dùng nhấn phím thật trên bàn phím (event.isTrusted === true),
 * script sẽ giữ nguyên sự kiện thật đó nhưng ghi đè thông tin phím (key, code, keyCode, which, charCode)
 * thành ký tự đúng tiếp theo mà e-typing đang chờ nhận.
 */

(() => {
  const VERSION = '3.3.0';
  const previous = window.__etypingRemapperController;
  if (previous?.version === VERSION) { previous.attach(); return; }
  const transferred = previous?.takeover?.();
  if (previous) previous.dispose();
  else if (window.__etypingRemapperInstalled) return; // Worker replaces legacy documents once.
  window.__etypingRemapperInstalled = true;
  window.__etypingRemapperVersion = VERSION;

  let config = {
    enabled: true,
    accuracy: 100,
    mode: 'hybrid',
    showHud: true
  };
  if (transferred?.config) config = { ...config, ...transferred.config };

  let toggleSequence = 0;
  let pendingToggle = 0;
  const heldKeys = new Map();
  let lastMappedInfo = { physicalKey: '-', mappedKey: '-' };
  const keyDescriptors = new Map();

  // Apply toggles synchronously; storage acknowledgements must not undo a newer local toggle.
  function onConfig(e) {
    if (e.source !== window) return;
    if (typeof e.data?.__etypingContentClaim === 'string' && e.data.__etypingContentClaim.length <= 128) {
      window.postMessage({ __etypingContentOwner: e.data.__etypingContentClaim }, '*'); return;
    }
    if (e.data && e.data.__etypingToggleAck === pendingToggle) pendingToggle = 0;
    if (e.data && e.data.__etypingConfigUpdate) {
      const update = e.data.__etypingConfigUpdate;
      const enabled = config.enabled;
      config = { ...config, ...update };
      if (pendingToggle) config.enabled = enabled;
    }
  }

  // Bảng mã phím vật lý chuẩn
  const SPECIAL_KEYCODES = {
    '-': { keyCode: 189, code: 'Minus' },
    'ー': { keyCode: 189, code: 'Minus' },
    ',': { keyCode: 188, code: 'Comma' },
    '.': { keyCode: 190, code: 'Period' },
    '/': { keyCode: 191, code: 'Slash' },
    ';': { keyCode: 186, code: 'Semicolon' },
    ':': { keyCode: 186, code: 'Quote' },
    '[': { keyCode: 219, code: 'BracketLeft' },
    ']': { keyCode: 221, code: 'BracketRight' },
    '!': { keyCode: 49, code: 'Digit1', shiftKey: true },
    '?': { keyCode: 191, code: 'Slash', shiftKey: true },
    ' ': { keyCode: 32, code: 'Space' }
  };

  // Bổ sung: đọc đáp án từ engine khi game không đưa Romaji vào DOM.
  // Không bật lại isRomaView/isKBHGuide, không tự phiên âm, không tự tăng con trỏ.
  let typingEngine = transferred?.typingEngine || null;
  const observedJQueries = new WeakSet();
  const proxyRestores = [];
  let restoreJQuery = () => {};

  function rememberTypingEngine(candidate) {
    try {
      if (candidate && typeof candidate.currentExampleSentence === 'function' &&
          typeof candidate.currentSentenceIndex === 'function' &&
          typeof candidate.nextKeyCharCode === 'function' &&
          typeof candidate.state === 'string' && candidate.example) {
        typingEngine = candidate;
      }
    } catch (_) {}
  }

  function observeJQuery(jq) {
    if (!jq || (typeof jq !== 'function' && typeof jq !== 'object') || observedJQueries.has(jq)) return;
    try {
      if (!jq.fn || typeof jq.proxy !== 'function') return;
      const originalProxy = jq.proxy;
      const descriptor = Object.getOwnPropertyDescriptor(jq, 'proxy');
      // Giữ nguyên hàm proxy trả về, this, tham số, guid và lỗi của jQuery.
      const proxy = function (...args) {
        rememberTypingEngine(args[1]);
        if (typeof args[1] === 'string') rememberTypingEngine(args[0]);
        return Reflect.apply(originalProxy, this, args);
      };
      Object.defineProperty(jq, 'proxy', { ...descriptor, value: proxy });
      observedJQueries.add(jq);
      proxyRestores.push(() => { if (jq.proxy === proxy) Object.defineProperty(jq, 'proxy', descriptor || { value: originalProxy, writable: true, configurable: true }); });
    } catch (_) {}
  }

  // e-typing đóng engine trong closure và truyền nó làm context cho $.proxy.
  // Quan sát cả lần gán jQuery của file ngoài lẫn bản jQuery trong app.min.js.
  function watchJQuery() {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'jQuery');
      let value = window.jQuery;
      observeJQuery(value);
      if (descriptor && (!descriptor.configurable || ('writable' in descriptor && !descriptor.writable))) return;
      const getter = function () { return descriptor && descriptor.get ? descriptor.get.call(this) : value; };
      Object.defineProperty(window, 'jQuery', {
        configurable: true,
        enumerable: descriptor ? descriptor.enumerable : true,
        get: getter,
        set(next) {
          if (descriptor && descriptor.set) descriptor.set.call(this, next);
          else value = next;
          observeJQuery(descriptor && descriptor.get ? descriptor.get.call(this) : next);
        }
      });
      restoreJQuery = () => {
        if (Object.getOwnPropertyDescriptor(window, 'jQuery')?.get !== getter) return;
        const current = window.jQuery;
        if (descriptor?.get || descriptor?.set) Object.defineProperty(window, 'jQuery', descriptor);
        else Object.defineProperty(window, 'jQuery', { configurable: true, enumerable: true, writable: true, ...descriptor, value: current });
      };
    } catch (_) {}
  }

  function getEngineTypingState() {
    if (!typingEngine) return null;
    try {
      const state = typingEngine.state;
      if (state !== 'typing' || typingEngine._isExampleChangeInterval) {
        return { active: false, state, remainingText: '', kanaText: '', nextChar: null };
      }
      const sentence = typingEngine.currentExampleSentence();
      const index = typingEngine.currentSentenceIndex();
      const charCode = typingEngine.nextKeyCharCode();
      if (typeof sentence !== 'string' || !Number.isInteger(index) || index < 0 || index >= sentence.length ||
          !Number.isInteger(charCode) || charCode < 0 || charCode > 65535) return null;
      const nextChar = String.fromCharCode(charCode);
      if (nextChar.charCodeAt(0) > 127 && nextChar !== 'ー') return null;
      return {
        active: true,
        state,
        remainingText: sentence.slice(index),
        kanaText: typeof typingEngine.currentExampleKana === 'function' ? typingEngine.currentExampleKana() : '',
        nextChar: nextChar === 'ー' ? '-' : nextChar
      };
    } catch (_) { return null; }
  }

  watchJQuery();

  // HUD tiếp tục dùng cơ chế postMessage của mẫu; chỉ thêm trạng thái khi Romaji ẩn.
  function onStateRequest(e) {
    if (e.source === window && e.data && e.data.__etypingStateRequest) {
      window.postMessage({ __etypingEngineState: getEngineTypingState(), __etypingHudUpdate: lastMappedInfo }, '*');
    }
  }

  /**
   * Đọc ký tự tiếp theo cần gõ từ DOM (#sentenceText > span:not(.entered))
   */
  function getNextExpectedChar() {
    // Hot path: no full sentence/kana snapshots and no HUD work per key.
    if (typingEngine) {
      try {
        if (typingEngine.state !== 'typing' || typingEngine._isExampleChangeInterval) return null;
        const code = typingEngine.nextKeyCharCode();
        if (Number.isInteger(code) && code >= 0 && code <= 127) return String.fromCharCode(code);
        if (code === 12540) return '-';
      } catch (_) {}
    }

    const sentenceEl = document.getElementById('sentenceText');
    if (!sentenceEl) return null;

    const spans = sentenceEl.querySelectorAll('span');
    for (let i = 0; i < spans.length; i++) {
      if (!spans[i].classList.contains('entered') && spans[i].textContent) {
        const firstChar = spans[i].textContent[0];
        if (firstChar.charCodeAt(0) > 127 && firstChar !== 'ー') return null;
        return firstChar === 'ー' ? '-' : firstChar;
      }
    }
    return null;
  }

  /**
   * Tính toán thông số (key, code, keyCode, charCode) của ký tự đích
   */
  function getKeyProps(targetChar, eventType) {
    const lower = targetChar.toLowerCase();
    const upper = targetChar.toUpperCase();
    const ascii = lower.charCodeAt(0);

    let keyCode = upper.charCodeAt(0);
    let code = `Key${upper}`;
    let shiftKey = false;

    if (SPECIAL_KEYCODES[targetChar]) {
      keyCode = SPECIAL_KEYCODES[targetChar].keyCode;
      code = SPECIAL_KEYCODES[targetChar].code;
      shiftKey = Boolean(SPECIAL_KEYCODES[targetChar].shiftKey);
    } else if (targetChar >= '0' && targetChar <= '9') {
      keyCode = targetChar.charCodeAt(0);
      code = `Digit${targetChar}`;
    }

    if (eventType === 'keypress') {
      return {
        key: lower,
        code: code,
        keyCode: ascii,
        which: ascii,
        charCode: ascii,
        shiftKey: shiftKey
      };
    }

    return {
      key: lower,
      code: code,
      keyCode: keyCode,
      which: keyCode,
      charCode: 0,
      shiftKey: shiftKey
    };
  }

  /**
   * Ghi đè các thuộc tính của chính đối tượng KeyboardEvent thật (giữ nguyên event.isTrusted === true)
   */
  function patchKeyboardEvent(e, targetChar) {
    const cacheKey = `${e.type}:${targetChar}`;
    let descriptors = keyDescriptors.get(cacheKey);
    if (!descriptors) {
      descriptors = {};
      for (const [name, value] of Object.entries(getKeyProps(targetChar, e.type))) descriptors[name] = { value, configurable: true };
      keyDescriptors.set(cacheKey, descriptors);
    }
    try { Object.defineProperties(e, descriptors); return true; }
    catch (_) { return false; }
  }

  function getWrongChar(correctChar) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    let wrong = correctChar.toLowerCase();
    while (wrong === correctChar.toLowerCase()) {
      wrong = alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return wrong;
  }

  /**
   * Bắt sự kiện ở pha Capture (sớm nhất trên window) ngay khi bạn nhấn phím
   */
  function onPhysicalKey(e) {
    if (!e.isTrusted) return;
    if (e.type === 'keydown' && !e.ctrlKey && !e.metaKey && !e.isComposing &&
        ((!e.altKey && e.key === 'F8') || (e.altKey && e.code === 'KeyS'))) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) {
        config.enabled = !config.enabled;
        pendingToggle = ++toggleSequence;
        window.postMessage({ __etypingToggleRequest: { enabled: config.enabled, sequence: pendingToggle } }, '*');
      }
      return;
    }
    const id = `${e.code || String(e.key).toLowerCase()}:${e.location || 0}`;
    const held = heldKeys.get(id);
    if (e.isComposing || e.keyCode === 229 || e.target?.closest?.('input,textarea,select,[contenteditable="true"]')) {
      heldKeys.clear(); return;
    }
    let mappedChar = null;
    if (e.type === 'keydown') {
      if (!config.enabled || e.ctrlKey || e.altKey || e.metaKey || e.key === 'Escape' || e.key === 'Tab' || /^F\d+$/.test(e.key)) {
        heldKeys.delete(id); return;
      }
      const expected = getNextExpectedChar();
      if (!expected) { heldKeys.delete(id); return; }
      // Keep the sample's Accuracy probability and OS-generated repeat behavior.
      const roll = Math.random() * 100;
      mappedChar = roll > config.accuracy ? getWrongChar(expected) : expected;
      heldKeys.set(id, { char: mappedChar, pending: true });
      lastMappedInfo = { physicalKey: e.code || e.key, mappedKey: mappedChar };
    } else if (held) {
      mappedChar = held.char;
      if (e.type === 'keyup') heldKeys.delete(id);
      else if (e.type === 'keypress') {
        if (!held.pending) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        held.pending = false;
      }
    }
    if (mappedChar && !patchKeyboardEvent(e, mappedChar)) {
      heldKeys.delete(id); e.preventDefault(); e.stopImmediatePropagation();
    }
  }

  const clearHeld = () => heldKeys.clear();
  function detach() {
    for (const type of ['keydown', 'keypress', 'keyup']) window.removeEventListener(type, onPhysicalKey, true);
    window.removeEventListener('message', onConfig);
    window.removeEventListener('message', onStateRequest);
    window.removeEventListener('blur', clearHeld);
    window.removeEventListener('pagehide', clearHeld);
    window.removeEventListener('compositionstart', clearHeld, true);
  }
  function attach() {
    detach();
    window.addEventListener('message', onConfig);
    window.addEventListener('message', onStateRequest);
    // Đăng ký listener ở pha Capture (true) trước mọi script của trang web
    window.addEventListener('keydown', onPhysicalKey, true);
    window.addEventListener('keypress', onPhysicalKey, true);
    window.addEventListener('keyup', onPhysicalKey, true);
    window.addEventListener('blur', clearHeld);
    window.addEventListener('pagehide', clearHeld);
    window.addEventListener('compositionstart', clearHeld, true);
    observeJQuery(window.jQuery);
  }
  window.__etypingRemapperController = {
    version: VERSION, attach,
    health: () => ({ version: VERSION, engine: Boolean(typingEngine), state: typingEngine?.state || 'waiting' }),
    takeover: () => ({ typingEngine, config: { ...config } }),
    dispose() {
      detach(); heldKeys.clear();
      for (const restore of proxyRestores) { try { restore(); } catch (_) {} }
      try { restoreJQuery(); } catch (_) {}
      window.__etypingRemapperInstalled = false;
      delete window.__etypingRemapperController;
    }
  };
  attach();
})();
