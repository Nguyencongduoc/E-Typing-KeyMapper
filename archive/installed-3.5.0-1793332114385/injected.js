/**
 * Chạy trực tiếp trong MAIN world ở thời điểm document_start (trước khi script của e-typing chạy).
 * Không bao giờ tự động gõ!
 * Chỉ khi người dùng nhấn phím thật trên bàn phím (event.isTrusted === true),
 * script sẽ giữ nguyên sự kiện thật đó nhưng ghi đè thông tin phím (key, code, keyCode, which, charCode)
 * thành ký tự đúng tiếp theo mà e-typing đang chờ nhận.
 */

(() => {
  if (window.__etypingRemapperInstalled) return;
  window.__etypingRemapperInstalled = true;

  let config = {
    enabled: true,
    accuracy: 100,
    mode: 'hybrid',
    showHud: true
  };

  // Lắng nghe cấu hình từ content script (ISOLATED world) gửi sang
  window.addEventListener('message', (e) => {
    if (e.data && e.data.__etypingConfigUpdate) {
      config = { ...config, ...e.data.__etypingConfigUpdate };
    }
  });

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

  // Lưu trữ ký tự đã được ánh xạ ở keydown để đồng bộ cho keypress và keyup ngay sau đó
  let lastMappedChar = null;

  /**
   * Đọc ký tự tiếp theo cần gõ từ DOM (#sentenceText > span:not(.entered))
   */
  function getNextExpectedChar() {
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
    // Không can thiệp nếu đang hiển thị chữ tiếng Nhật hướng dẫn trước khi bấm Space
    if (firstChar.charCodeAt(0) > 127 && firstChar !== 'ー') {
      return null;
    }

    return firstChar === 'ー' ? '-' : firstChar;
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

    // Bỏ qua các phím tắt hệ thống (F1-F12, Ctrl, Alt, Meta, Escape, Tab)
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key && (e.key.startsWith('F') && e.key.length > 1)) return;
    if (e.key === 'Escape' || e.key === 'Tab') return;

    // Chỉ can thiệp khi đang trong bài thi và có ký tự cần gõ
    const expected = getNextExpectedChar();
    if (!expected) {
      lastMappedChar = null;
      return;
    }

    if (e.type === 'keydown') {
      // Nếu bạn đang giữ đè 1 phím (e.repeat) hoặc gõ từng phím, quyết định ký tự sẽ gửi
      const roll = Math.random() * 100;
      if (roll > config.accuracy) {
        lastMappedChar = getWrongChar(expected);
      } else {
        lastMappedChar = expected;
      }
      patchKeyboardEvent(e, lastMappedChar);

      // Thông báo cho HUD cập nhật
      window.postMessage({
        __etypingHudUpdate: {
          physicalKey: e.code,
          mappedKey: lastMappedChar
        }
      }, '*');
    } else if (e.type === 'keypress' || e.type === 'keyup') {
      const charToUse = lastMappedChar || expected;
      patchKeyboardEvent(e, charToUse);
    }
  }

  // Đăng ký listener ở pha Capture (true) trước mọi script của trang web
  window.addEventListener('keydown', onPhysicalKey, true);
  window.addEventListener('keypress', onPhysicalKey, true);
  window.addEventListener('keyup', onPhysicalKey, true);
})();
