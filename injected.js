/**
 * e-typing Key Remapper (v3.6.0 Final Release)
 * Chạy trực tiếp trong MAIN world ở thời điểm document_start (trước khi script của e-typing chạy).
 * Không bao giờ tự động gõ!
 * Chỉ khi người dùng nhấn phím thật trên bàn phím (event.isTrusted === true),
 * script sẽ giữ nguyên sự kiện thật đó nhưng ghi đè thông tin phím (key, code, keyCode, which, charCode, shiftKey)
 * thành ký tự đúng tiếp theo mà e-typing đang chờ nhận.
 *
 * Hỗ trợ:
 * 1. Chế độ Romaji ON: Đọc trực tiếp từ DOM (#sentenceText).
 * 2. Chế độ Romaji OFF: Tự động fallback đọc từ engine ngầm của e-typing (typingEngine.nextKeyCharCode).
 * 3. Hỗ trợ hiển thị bàn phím & ngón tay (Keyboard & Finger Guide) follow theo phím đúng kể cả khi Romaji OFF!
 * 4. Chống lệch cặp phím khi gõ lướt nhanh (Key Rollover Map).
 * 5. Lọc triệt để phím chức năng (Shift đơn, CapsLock, mũi tên, v.v.).
 * 6. Tùy chọn chặn giữ đè phím (blockRepeat) để ngăn kích hoạt bẫy gian lận FRAUD_SCORE.
 */

(() => {
  if (window.__etypingRemapperInstalled) return;
  window.__etypingRemapperInstalled = true;

  let config = {
    enabled: true,
    accuracy: 100,
    blockRepeat: false,
    mode: 'hybrid',
    showHud: true
  };

  // Lắng nghe cấu hình từ content script (ISOLATED world) gửi sang
  window.addEventListener('message', (e) => {
    if (e.data && e.data.__etypingConfigUpdate) {
      config = { ...config, ...e.data.__etypingConfigUpdate };
    }
  });

  // Bảng mã phím vật lý chuẩn cho các ký tự đặc biệt / dấu câu tiếng Nhật & tiếng Anh
  const SPECIAL_KEYCODES = {
    '-': { keyCode: 189, code: 'Minus' },
    'ー': { keyCode: 189, code: 'Minus' },
    '－': { keyCode: 189, code: 'Minus' },
    ',': { keyCode: 188, code: 'Comma' },
    '.': { keyCode: 190, code: 'Period' },
    '/': { keyCode: 191, code: 'Slash' },
    ';': { keyCode: 186, code: 'Semicolon' },
    ':': { keyCode: 186, code: 'Quote', shiftKey: true },
    '[': { keyCode: 219, code: 'BracketLeft' },
    ']': { keyCode: 221, code: 'BracketRight' },
    '!': { keyCode: 49, code: 'Digit1', shiftKey: true },
    '?': { keyCode: 191, code: 'Slash', shiftKey: true },
    ' ': { keyCode: 32, code: 'Space' },
    '_': { keyCode: 189, code: 'Minus', shiftKey: true },
    '~': { keyCode: 192, code: 'Backquote', shiftKey: true },
    '`': { keyCode: 192, code: 'Backquote' },
    '(': { keyCode: 57, code: 'Digit9', shiftKey: true },
    ')': { keyCode: 48, code: 'Digit0', shiftKey: true },
    '"': { keyCode: 222, code: 'Quote', shiftKey: true },
    "'": { keyCode: 222, code: 'Quote' },
    '@': { keyCode: 50, code: 'Digit2', shiftKey: true },
    '#': { keyCode: 51, code: 'Digit3', shiftKey: true },
    '$': { keyCode: 52, code: 'Digit4', shiftKey: true },
    '%': { keyCode: 53, code: 'Digit5', shiftKey: true },
    '^': { keyCode: 54, code: 'Digit6', shiftKey: true },
    '&': { keyCode: 55, code: 'Digit7', shiftKey: true },
    '*': { keyCode: 56, code: 'Digit8', shiftKey: true },
    '+': { keyCode: 187, code: 'Equal', shiftKey: true },
    '=': { keyCode: 187, code: 'Equal' },
    '<': { keyCode: 188, code: 'Comma', shiftKey: true },
    '>': { keyCode: 190, code: 'Period', shiftKey: true },
    '{': { keyCode: 219, code: 'BracketLeft', shiftKey: true },
    '}': { keyCode: 221, code: 'BracketRight', shiftKey: true },
    '|': { keyCode: 220, code: 'Backslash', shiftKey: true },
    '\\': { keyCode: 220, code: 'Backslash' }
  };

  // Tập hợp các phím chức năng / bổ trợ không in ra ký tự cần bỏ qua
  const IGNORED_KEYS = new Set([
    'Shift', 'Control', 'Alt', 'Meta',
    'CapsLock', 'NumLock', 'ScrollLock',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown',
    'Insert', 'Delete', 'ContextMenu', 'PrintScreen', 'Pause',
    'AudioVolumeUp', 'AudioVolumeDown', 'AudioVolumeMute', 'MediaPlayPause'
  ]);

  // Quản lý theo từng mã phím vật lý (e.code) để chống lệch cặp keydown/keyup khi gõ chồng phím (Key Rollover)
  const activeKeys = new Map();

  window.addEventListener('blur', () => {
    activeKeys.clear();
  });

  /* ==========================================================================
     MODULE HOOK ENGINE E-TYPING (HỖ TRỢ ROMAJI-OFF & THEO DÕI PHÍM/NGÓN TAY)
     ========================================================================== */
  let typingEngine = null;
  let typingView = null;

  function activateKBHandGuide(view) {
    if (!view || typeof view._nextKeyActive !== 'function') return;
    try {
      // Đảm bảo cờ _isKBHandView luôn trả về true để e-typing luôn bật đèn phím & ngón tay kể cả khi Romaji-OFF
      Object.defineProperty(view, '_isKBHandView', {
        get() { return true; },
        set(_) {},
        configurable: true
      });
      // Kích hoạt ngay đèn phím và ngón tay cho ký tự hiện tại nếu đang trong bài gõ
      if (view._typing && view._typing.state === 'typing') {
        view._nextKeyActive();
      }
    } catch (_) {}
  }

  function rememberTypingEngine(candidate) {
    try {
      let view = candidate;
      if (candidate && candidate._typing) {
        view = candidate;
        typingEngine = candidate._typing;
      } else if (candidate && typeof candidate.nextKeyCharCode === 'function') {
        typingEngine = candidate;
      }

      if (view && typeof view._nextKeyActive === 'function') {
        typingView = view;
        activateKBHandGuide(view);
      }
    } catch (_) {}
  }

  function observeJQuery(jq) {
    if (!jq || (typeof jq !== 'function' && typeof jq !== 'object')) return;
    try {
      if (!jq.fn || typeof jq.proxy !== 'function' || jq.__etkmProxyObserved) return;
      jq.__etkmProxyObserved = true;
      const originalProxy = jq.proxy;
      jq.proxy = function (...args) {
        rememberTypingEngine(args[1]);
        if (typeof args[1] === 'string') rememberTypingEngine(args[0]);
        return Reflect.apply(originalProxy, this, args);
      };
    } catch (_) {}
  }

  function setupJQueryHook() {
    try {
      observeJQuery(window.jQuery);
      let currentJQuery = window.jQuery;
      const descriptor = Object.getOwnPropertyDescriptor(window, 'jQuery');
      if (descriptor && !descriptor.configurable) return;

      Object.defineProperty(window, 'jQuery', {
        configurable: true,
        enumerable: true,
        get() {
          return currentJQuery;
        },
        set(val) {
          currentJQuery = val;
          observeJQuery(val);
        }
      });
    } catch (_) {}
  }

  setupJQueryHook();

  /**
   * 1. Đọc ký tự từ DOM (#sentenceText) khi Romaji ON
   */
  function getNextExpectedCharFromDOM() {
    const sentenceEl = document.getElementById('sentenceText');
    if (!sentenceEl) return null;

    const spans = sentenceEl.querySelectorAll('span');
    let remainingText = '';

    for (let i = 0; i < spans.length; i++) {
      if (!spans[i].classList.contains('entered')) {
        remainingText += spans[i].textContent;
      }
    }

    if (!remainingText) return null;

    const firstChar = remainingText[0];
    if (firstChar.charCodeAt(0) > 127 && firstChar !== 'ー' && firstChar !== '－') {
      return null;
    }

    return (firstChar === 'ー' || firstChar === '－') ? '-' : firstChar;
  }

  /**
   * 2. Đọc ký tự từ engine ngầm khi Romaji OFF
   */
  function getNextExpectedCharFromEngine() {
    if (!typingEngine) return null;
    try {
      if (typingEngine.state !== 'typing' || typingEngine._isExampleChangeInterval) {
        return null;
      }
      const charCode = typingEngine.nextKeyCharCode();
      if (!Number.isInteger(charCode) || charCode <= 0 || charCode > 65535) {
        return null;
      }
      const char = String.fromCharCode(charCode);
      if (char.charCodeAt(0) > 127 && char !== 'ー' && char !== '－') {
        return null;
      }
      return (char === 'ー' || char === '－') ? '-' : char;
    } catch (_) {
      return null;
    }
  }

  /**
   * Bộ điều phối đọc ký tự tiếp theo (Hybrid: Ưu tiên DOM, Fallback sang Engine)
   */
  function getNextExpectedChar() {
    // Ưu tiên đọc DOM nếu Romaji ON
    const domChar = getNextExpectedCharFromDOM();
    if (domChar) return domChar;

    // Fallback sang đọc engine nếu Romaji OFF
    return getNextExpectedCharFromEngine();
  }

  /**
   * Lấy thông tin mở rộng từ engine để gửi lên HUD
   */
  function getEngineExtendedInfo() {
    if (!typingEngine) return null;
    try {
      if (typingEngine.state !== 'typing') return null;
      const sentence = typingEngine.currentExampleSentence();
      const index = typingEngine.currentSentenceIndex();
      const kana = typeof typingEngine.currentExampleKana === 'function' ? typingEngine.currentExampleKana() : '';
      return {
        remainingText: (typeof sentence === 'string' && Number.isInteger(index)) ? sentence.slice(index) : '',
        kanaText: kana || ''
      };
    } catch (_) {
      return null;
    }
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
    const props = getKeyProps(targetChar, e.type);

    const define = (prop, val) => {
      try {
        Object.defineProperty(e, prop, {
          get: () => val,
          configurable: true
        });
      } catch (_) {}
    };

    define('key', props.key);
    define('code', props.code);
    define('keyCode', props.keyCode);
    define('which', props.which);
    define('charCode', props.charCode);
    define('shiftKey', props.shiftKey);
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
    if (!config.enabled) return;

    // Bỏ qua các phím tắt hệ thống và phím chức năng không gõ văn bản
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key && (e.key.startsWith('F') && e.key.length > 1)) return;
    if (e.key === 'Escape' || e.key === 'Tab') return;
    if (IGNORED_KEYS.has(e.key)) return;

    // Chỉ can thiệp khi đang trong bài thi và có ký tự cần gõ (hỗ trợ cả Romaji ON và Romaji OFF)
    const expected = getNextExpectedChar();
    if (!expected) {
      activeKeys.delete(e.code);
      return;
    }

    if (e.type === 'keydown') {
      // Nếu bật tùy chọn chặn lặp phím khi giữ đè (chống kích hoạt bẫy gian lận FRAUD_SCORE)
      if (config.blockRepeat && e.repeat) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Đảm bảo giao diện ngón tay và bàn phím luôn được kích hoạt kể cả khi Romaji-OFF
      if (typingView) {
        activateKBHandGuide(typingView);
      }

      // Quyết định ký tự ánh xạ dựa theo cài đặt Accuracy
      const roll = Math.random() * 100;
      const mappedChar = roll > config.accuracy ? getWrongChar(expected) : expected;

      activeKeys.set(e.code, mappedChar);
      patchKeyboardEvent(e, mappedChar);

      // Gửi thông tin sang content script để cập nhật HUD (kèm dữ liệu Romaji-OFF nếu có)
      const extInfo = getEngineExtendedInfo();
      window.postMessage({
        __etypingHudUpdate: {
          physicalKey: e.code,
          mappedKey: mappedChar,
          nextChar: expected,
          engineKana: extInfo ? extInfo.kanaText : null,
          engineRemaining: extInfo ? extInfo.remainingText : null
        }
      }, '*');
    } else if (e.type === 'keypress') {
      const charToUse = activeKeys.get(e.code) || expected;
      patchKeyboardEvent(e, charToUse);
    } else if (e.type === 'keyup') {
      const charToUse = activeKeys.get(e.code) || expected;
      patchKeyboardEvent(e, charToUse);
      activeKeys.delete(e.code);
    }
  }

  // Đăng ký listener ở pha Capture (true) trước mọi script của trang web
  window.addEventListener('keydown', onPhysicalKey, true);
  window.addEventListener('keypress', onPhysicalKey, true);
  window.addEventListener('keyup', onPhysicalKey, true);
})();
