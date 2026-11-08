/**
 * Chạy trực tiếp trong MAIN world ở thời điểm document_start (trước khi script của e-typing chạy).
 * Không bao giờ tự động gõ!
 * Chỉ khi người dùng nhấn phím thật trên bàn phím (event.isTrusted === true),
 * script sẽ giữ nguyên sự kiện thật đó nhưng ghi đè thông tin phím (key, code, keyCode, which, charCode)
 * thành ký tự đúng tiếp theo mà e-typing đang chờ nhận.
 */

(() => {
  const VERSION = '3.4.0';
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
  let bridgeOwner = transferred?.bridgeOwner || null;

  // Apply toggles synchronously; storage acknowledgements must not undo a newer local toggle.
  function onConfig(e) {
    if (e.source !== window) return;
    if (typeof e.data?.__etypingContentClaim === 'string' && e.data.__etypingContentClaim.length <= 128) {
      const claim = e.data.__etypingContentClaim;
      const stamp = Number(claim.split(':')[0]);
      if (!Number.isFinite(stamp) || stamp <= 0) return;
      // A delayed claim from an invalidated world must never retire its successor.
      const previousStamp = bridgeOwner ? Number(bridgeOwner.split(':')[0]) : 0;
      if (!bridgeOwner || stamp > previousStamp || (stamp === previousStamp && claim > bridgeOwner)) bridgeOwner = claim;
      window.postMessage({ __etypingContentOwner: bridgeOwner }, '*'); return;
    }
    if (e.data && e.data.__etypingToggleAck === pendingToggle) pendingToggle = 0;
    if (e.data && e.data.__etypingConfigUpdate) {
      const update = e.data.__etypingConfigUpdate;
      const enabled = config.enabled;
      config = { ...config, ...update };
      if (pendingToggle) config.enabled = enabled;
      scheduleKeyboard();
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
  let typingView = transferred?.typingView || null;
  const observedJQueries = new Map();
  const proxyContexts = new WeakMap();
  const proxyRestores = [];
  let restoreJQuery = () => {};

  function rememberTypingEngine(candidate) {
    try {
      const view = candidate;
      if (candidate?._typing) candidate = candidate._typing;
      if (candidate && typeof candidate.currentExampleSentence === 'function' &&
          typeof candidate.currentSentenceIndex === 'function' &&
          typeof candidate.nextKeyCharCode === 'function' &&
          typeof candidate.state === 'string' && candidate.example) {
        typingEngine = candidate;
        if (view !== candidate && typeof view.startTyping === 'function') typingView = view;
      }
    } catch (_) {}
  }

  function observeJQuery(jq) {
    if (!jq || (typeof jq !== 'function' && typeof jq !== 'object') || observedJQueries.get(jq) === jq.proxy) return;
    try {
      if (!jq.fn || typeof jq.proxy !== 'function') return;
      const originalProxy = jq.proxy;
      const descriptor = Object.getOwnPropertyDescriptor(jq, 'proxy');
      // Preserve binding/guid; retire callbacks of a finalized result screen.
      const proxy = function (...args) {
        rememberTypingEngine(args[1]);
        if (typeof args[1] === 'string') rememberTypingEngine(args[0]);
        const bound = Reflect.apply(originalProxy, this, args);
        const context = typeof args[1] === 'string' ? args[0] : args[1];
        let returned = bound;
        if (typeof bound === 'function' && typeof context?.addShortCutKeyEvent === 'function' && typeof context?.shortCutKeyEvent === 'function') {
          returned = function (...params) {
            if (!context._document || context.view === null) return;
            return Reflect.apply(bound, this, params);
          };
          returned.guid = bound.guid;
        }
        if (typeof returned === 'function') proxyContexts.set(returned, context);
        return returned;
      };
      Object.defineProperty(jq, 'proxy', { ...descriptor, value: proxy });
      observedJQueries.set(jq, proxy);
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

  // Replay replaces private engine/view objects without navigating the frame.
  // Reconcile against the currently registered judge rather than a result callback.
  function reconcileEngine() {
    observeJQuery(window.jQuery);
    for (const jq of observedJQueries.keys()) {
      try {
        const events = typeof jq._data === 'function' ? jq._data(document, 'events') : null;
        for (const type of ['keypress', 'keydown']) for (const entry of events?.[type] || []) {
          const candidate = proxyContexts.get(entry.handler);
          const engine = candidate?._typing || candidate;
          if (engine && ['wait', 'countdown', 'typing'].includes(engine.state)) rememberTypingEngine(candidate);
        }
      } catch (_) {}
    }
  }

  let visualPending = false, disposed = false, lastStart = null, round = 0;
  let keyRoot = null, nextKeyEl = null;
  function clearKeyboard() {
    nextKeyEl?.removeAttribute('data-etkm-next');
    keyRoot?.removeAttribute('data-etkm-follow');
    nextKeyEl = null; keyRoot = null;
  }
  function syncKeyboard() {
    visualPending = false;
    if (disposed) return;
    const start = document.getElementById('start_msg');
    if (start && start !== lastStart) {
      lastStart = start; heldKeys.clear(); pendingToggle = 0;
      lastMappedInfo = { physicalKey: '-', mappedKey: '-' };
      reconcileEngine();
      window.postMessage({ __etypingRoundReady: ++round }, '*');
      // Preserve keyboard focus when the focused Replay link is removed.
      if (document.hasFocus?.()) window.focus?.();
    }
    const root = document.getElementById('full_keyboard') || document.getElementById('ten_keyboard');
    if (!root || !config.enabled || typingEngine?.state !== 'typing' || typingEngine._isExampleChangeInterval) {
      clearKeyboard(); return;
    }
    const char = getNextExpectedChar();
    if (!char) { clearKeyboard(); return; }
    let element = null;
    try {
      const code = typeof typingEngine.nextKeyCode === 'function' ? typingEngine.nextKeyCode() : getKeyProps(char, 'keydown').keyCode;
      const keyboard = typingView?._keyboard?._basicKeyboard;
      const candidate = keyboard?.['key_' + code]?.view?.[0];
      if (candidate && root.contains(candidate)) element = candidate;
    } catch (_) {}
    if (!element) element = Array.from(root.children).find(el => el.textContent.trim().toUpperCase() === char.toUpperCase()) || null;
    if (!element) { clearKeyboard(); return; }
    if (!document.getElementById('etkm-keyboard-style')) {
      const style = document.createElement('style'); style.id = 'etkm-keyboard-style';
      style.textContent = '#full_keyboard [data-etkm-next],#ten_keyboard [data-etkm-next]{background:#ff9f00!important;color:#fff!important;border-color:#ff9f00!important;opacity:1!important}';
      document.head.appendChild(style);
    }
    if (root !== keyRoot) { clearKeyboard(); keyRoot = root; root.setAttribute('data-etkm-follow', ''); }
    if (element !== nextKeyEl) { nextKeyEl?.removeAttribute('data-etkm-next'); nextKeyEl = element; }
    if (element.getAttribute('data-etkm-next') !== char.toUpperCase()) element.setAttribute('data-etkm-next', char.toUpperCase());
  }
  function scheduleKeyboard() {
    if (disposed || visualPending || typeof requestAnimationFrame !== 'function') return;
    visualPending = true; requestAnimationFrame(syncKeyboard);
  }
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(scheduleKeyboard) : null;

  // HUD tiếp tục dùng cơ chế postMessage của mẫu; chỉ thêm trạng thái khi Romaji ẩn.
  function onStateRequest(e) {
    if (e.source === window && e.data && e.data.__etypingStateRequest) {
      scheduleKeyboard();
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
        scheduleKeyboard();
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
    if (mappedChar) scheduleKeyboard();
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
    observer?.disconnect(); observer?.observe(document, { childList: true, subtree: true });
    scheduleKeyboard();
  }
  window.__etypingRemapperController = {
    version: VERSION, attach,
    health: () => ({ version: VERSION, engine: Boolean(typingEngine), state: typingEngine?.state || 'waiting', enabled: config.enabled, round }),
    takeover: () => ({ typingEngine, typingView, bridgeOwner, config: { ...config } }),
    dispose() {
      disposed = true; observer?.disconnect(); clearKeyboard(); detach(); heldKeys.clear();
      for (const restore of proxyRestores) { try { restore(); } catch (_) {} }
      try { restoreJQuery(); } catch (_) {}
      window.__etypingRemapperInstalled = false;
      delete window.__etypingRemapperController;
    }
  };
  attach();
})();
