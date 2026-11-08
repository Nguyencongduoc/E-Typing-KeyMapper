/* Shared, dependency-free logic. No event generation or character timers. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (!root.ETKMCore) Object.defineProperty(root, 'ETKMCore', { value: api });
})(globalThis, function () {
  'use strict';
  const CHANNEL = 'etyping-keymapper';
  const VERSION = 1;
  const DEFAULTS = Object.freeze({ enabled: true, allowRepeat: false, showHud: true, shortcut: 'F8', hudPosition: null });
  const LABELS = Object.freeze({
    loading: 'Đang đồng bộ cấu hình', disabled: 'Đã tắt', ready: 'Bấm Start để vào bài',
    waiting: 'Bấm Space để bắt đầu', countdown: 'Đang đếm ngược', typing: 'Đang ánh xạ phím',
    transitioning: 'Đang chuyển câu', result: 'Đã kết thúc bài', unfocused: 'Bấm vào khung bài để tiếp tục',
    editable: 'Đang ở ô nhập liệu', composing: 'Hãy tắt bộ gõ / IME',
    unsupported: 'Chỉ hỗ trợ bài Romaji', unknown: 'Chưa đọc được đáp án',
    error: 'Không sửa được sự kiện — đã tạm dừng'
  });
  function settings(value) {
    const v = value && typeof value === 'object' ? value : {};
    const p = v.hudPosition;
    return {
      enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULTS.enabled,
      allowRepeat: typeof v.allowRepeat === 'boolean' ? v.allowRepeat : DEFAULTS.allowRepeat,
      showHud: typeof v.showHud === 'boolean' ? v.showHud : DEFAULTS.showHud,
      shortcut: ['F8', 'AltS', 'None'].includes(v.shortcut) ? v.shortcut : DEFAULTS.shortcut,
      hudPosition: p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: Math.max(0, p.x), y: Math.max(0, p.y) } : null
    };
  }
  function message(type, payload = {}) { return { channel: CHANNEL, version: VERSION, type, ...payload }; }
  function isMessage(value, types) {
    return value && typeof value === 'object' && value.channel === CHANNEL && value.version === VERSION && types.includes(value.type);
  }
  const SPECIAL = {
    ' ': ['Space', 32, false], '-': ['Minus', 189, false], '_': ['Minus', 189, true],
    '=': ['Equal', 187, false], '+': ['Equal', 187, true], '[': ['BracketLeft', 219, false],
    '{': ['BracketLeft', 219, true], ']': ['BracketRight', 221, false], '}': ['BracketRight', 221, true],
    '\\': ['Backslash', 220, false], '|': ['Backslash', 220, true], ';': ['Semicolon', 186, false],
    ':': ['Semicolon', 186, true], "'": ['Quote', 222, false], '"': ['Quote', 222, true],
    ',': ['Comma', 188, false], '<': ['Comma', 188, true], '.': ['Period', 190, false],
    '>': ['Period', 190, true], '/': ['Slash', 191, false], '?': ['Slash', 191, true],
    '`': ['Backquote', 192, false], '~': ['Backquote', 192, true]
  };
  '!@#$%^&*()'.split('').forEach((c, i) => { SPECIAL[c] = [`Digit${(i + 1) % 10}`, 48 + (i + 1) % 10, true]; });
  function normalizeChar(char) {
    if (typeof char !== 'string' || Array.from(char).length !== 1) return null;
    const c = char === 'ー' || char === '－' ? '-' : char;
    return /^[\x20-\x7e]$/.test(c) ? c.toLowerCase() : null;
  }
  function keyProps(char, type) {
    const key = normalizeChar(char);
    if (key === null) return null;
    let code, keyCode, shiftKey = false;
    if (/[a-z]/.test(key)) { code = `Key${key.toUpperCase()}`; keyCode = key.toUpperCase().charCodeAt(0); }
    else if (/[0-9]/.test(key)) { code = `Digit${key}`; keyCode = key.charCodeAt(0); }
    else if (SPECIAL[key]) [code, keyCode, shiftKey] = SPECIAL[key];
    else return null;
    const charCode = type === 'keypress' ? key.charCodeAt(0) : 0;
    return { key, code, keyCode: charCode || keyCode, which: charCode || keyCode, charCode, shiftKey };
  }
  function identity(e) { return `${e.code || e.key}:${e.location || 0}`; }
  function printable(e) {
    return typeof e.key === 'string' && Array.from(e.key).length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing && e.keyCode !== 229;
  }
  function shortcut(e, choice) {
    return !e.repeat && !e.ctrlKey && !e.metaKey && !e.shiftKey &&
      ((choice === 'F8' && e.key === 'F8' && !e.altKey) || (choice === 'AltS' && e.altKey && e.code === 'KeyS'));
  }
  class Mapper {
    constructor() { this.held = new Map(); this.resetStats(); }
    resetStats() {
      this.stats = { presses: 0, repeats: 0, corrected: 0, firstAt: null, lastAt: null, gapTotal: 0, gaps: 0 };
    }
    clear() { this.held.clear(); }
    handle(e, context) {
      if (!e.isTrusted) return { action: 'pass' };
      const id = identity(e);
      const held = this.held.get(id);
      // Finish an existing stroke even if its character completed the sentence or the toggle changed.
      if (e.type === 'keyup') {
        this.held.delete(id);
        return held ? (held.releaseChar ? { action: 'patch', char: held.releaseChar } : { action: 'suppress' }) : { action: 'pass' };
      }
      if (e.type === 'keypress') {
        if (!held) return { action: 'pass' };
        if (held.pending !== 'patch') return { action: 'suppress' };
        held.pending = 'done';
        return { action: 'patch', char: held.char };
      }
      if (e.type !== 'keydown') return { action: 'pass' };
      if (!context.enabled || !context.focused || context.editable || context.composing || !printable(e)) {
        // A later, unmodified repeat begins a new transaction for the same physical key.
        // Do not accidentally suppress its keypress using a completed earlier mapping.
        this.held.delete(id);
        return { action: 'pass' };
      }
      if (e.repeat && !context.allowRepeat) {
        if (held) held.pending = 'suppress';
        else this.held.set(id, { pending: 'suppress', releaseChar: null });
        return { action: 'suppress' };
      }
      if (context.state !== 'typing') {
        if (['countdown', 'transitioning'].includes(context.state)) {
          this.held.set(id, { pending: 'suppress', releaseChar: held?.releaseChar || null });
          return { action: 'suppress' };
        }
        this.held.delete(id);
        return { action: 'pass' };
      }
      const char = normalizeChar(context.expected);
      if (!char || !keyProps(char, e.type)) { this.held.delete(id); return { action: 'pass' }; }
      this.held.set(id, { char, releaseChar: char, pending: 'patch' });
      if (e.repeat) this.stats.repeats++;
      else {
        const t = Number.isFinite(e.timeStamp) ? e.timeStamp : 0;
        if (this.stats.lastAt !== null && t >= this.stats.lastAt) { this.stats.gapTotal += t - this.stats.lastAt; this.stats.gaps++; }
        if (this.stats.firstAt === null) this.stats.firstAt = t;
        this.stats.lastAt = t;
        this.stats.presses++;
        if (normalizeChar(e.key) !== char) this.stats.corrected++;
      }
      return { action: 'patch', char, stroke: true, physicalKey: e.key, physicalCode: e.code };
    }
    snapshot() {
      const s = this.stats;
      const duration = s.lastAt - s.firstAt;
      return { presses: s.presses, repeats: s.repeats, corrected: s.corrected,
        correctionRate: s.presses ? s.corrected / s.presses * 100 : 0,
        kpm: s.presses > 1 && duration > 0 ? (s.presses - 1) * 60000 / duration : 0,
        averageGapMs: s.gaps ? s.gapTotal / s.gaps : 0 };
    }
  }
  return Object.freeze({ CHANNEL, VERSION, DEFAULTS, LABELS, settings, message, isMessage, normalizeChar, keyProps, identity, printable, shortcut, Mapper });
});
