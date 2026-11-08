(function () {
  'use strict';
  if (window.ETKMAdapter) return;
  function visible(el) {
    if (!el || !el.isConnected) return false;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return el.getClientRects().length > 0;
  }
  function remainingText(el) {
    if (!el) return null;
    const spans = Array.from(el.querySelectorAll('span')).filter(n => !n.querySelector('span'));
    if (!spans.some(n => n.classList.contains('entered'))) return null;
    return spans.filter(n => !n.closest('.entered')).map(n => n.textContent).join('');
  }
  class Adapter {
    constructor(notify) {
      this.notify = notify;
      this.app = null;
      this.pending = false;
      this.appObserver = new MutationObserver(() => this.schedule());
      this.rootObserver = new MutationObserver(records => {
        if (!this.app?.isConnected || records.some(r => r.target === this.app?.parentNode)) this.bind();
      });
      this.rootObserver.observe(document, { childList: true, subtree: true });
      this.bind();
    }
    bind() {
      const app = document.getElementById('app');
      if (this.app !== app) {
        this.appObserver.disconnect(); this.app = app;
        if (app) this.appObserver.observe(app, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
      }
      this.schedule();
    }
    schedule() {
      if (this.pending) return;
      this.pending = true;
      queueMicrotask(() => { this.pending = false; this.notify(this.read()); });
    }
    read() {
      const token = new URL(location.href).searchParams.get('t');
      if (token && !token.endsWith('.0')) return { state: 'unsupported', expected: null, remaining: '', recognized: false };
      const app = document.getElementById('app');
      const result = (state, extra = {}) => ({ state, expected: null, remaining: '', recognized: Boolean(app), ...extra });
      if (!app || !visible(app)) return result('unknown', { recognized: false });
      if (visible(app.querySelector('#result'))) return result('result');
      if (visible(app.querySelector('#start_view'))) return result('ready');
      if (visible(app.querySelector('#start_msg'))) return result('waiting');
      if (visible(app.querySelector('#countdown'))) return result('countdown');
      const sentence = app.querySelector('#sentenceText');
      if (!sentence || !visible(sentence)) return result('unknown');
      const remaining = remainingText(sentence);
      if (remaining === null) return result('transitioning');
      if (!remaining) return result('transitioning');
      const expected = ETKMCore.normalizeChar(Array.from(remaining)[0]);
      if (!expected) return result('unknown');
      // The verified Romaji view includes both kanaText and sentenceText.
      if (!app.querySelector('#kanaText')) return result('unsupported');
      return result('typing', { expected, remaining: remaining.slice(0, 160) });
    }
    destroy() { this.rootObserver.disconnect(); this.appObserver.disconnect(); }
  }
  Object.defineProperty(window, 'ETKMAdapter', { value: { Adapter, remainingText } });
})();
