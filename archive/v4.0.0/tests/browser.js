'use strict';
let fixtureConfig = { ...ETKMCore.DEFAULTS }, accepted = '', errors = 0, stamps = [], target = 'NEKO';
const display = () => {
  document.getElementById('accepted').textContent = `Đã nhận: ${accepted}`;
  document.getElementById('errors').textContent = `Lỗi: ${errors}`;
  document.getElementById('timing').textContent = `Khoảng cách sự kiện: ${stamps.slice(1).map((t,i)=>Math.round(t-stamps[i])).join(', ')} ms`;
};
function reset(text) {
  target = text; accepted = ''; errors = 0; stamps = [];
  const app = document.getElementById('app'); app.replaceChildren();
  const container = document.createElement('div'); container.id = 'example_container';
  const kana = document.createElement('div'); kana.id = 'kanaText'; kana.textContent = 'てすと';
  const sentence = document.createElement('div'); sentence.id = 'sentenceText';
  const wrapper = document.createElement('div'), entered = document.createElement('span'), rest = document.createElement('span');
  entered.className = 'entered'; rest.textContent = target; wrapper.append(entered,rest);sentence.append(wrapper);container.append(kana,sentence);app.append(container);
  display(); document.getElementById('ordinary').blur(); document.body.focus();
}
const sendConfig = () => window.postMessage(ETKMCore.message('CONFIG', { config: fixtureConfig }), location.origin);
window.addEventListener('message', e => {
  if (e.source !== window) return;
  if (ETKMCore.isMessage(e.data,['READY'])) sendConfig();
  if (ETKMCore.isMessage(e.data,['STATUS'])) document.getElementById('report').textContent = JSON.stringify(e.data.status, null, 2);
  if (ETKMCore.isMessage(e.data,['TOGGLE_REQUEST'])) { fixtureConfig.enabled = !fixtureConfig.enabled; sendConfig(); }
});
window.postMessage(ETKMCore.message('HELLO'), location.origin); sendConfig();
document.getElementById('start').onclick = () => reset('NEKO');
document.getElementById('symbols').onclick = () => reset('A-:!? 1');
document.getElementById('toggle').onclick = () => { fixtureConfig.enabled = !fixtureConfig.enabled; sendConfig(); };
document.getElementById('repeat').onclick = () => { fixtureConfig.allowRepeat = !fixtureConfig.allowRepeat; sendConfig(); };
document.getElementById('replace').onclick = () => {
  const old = document.getElementById('app'), replacement = document.createElement('div');replacement.id='app';old.replaceWith(replacement); reset('NEKO');
};
document.addEventListener('keypress', e => {
  if (e.target.closest?.('input,textarea')) return;
  const rest = document.querySelector('#sentenceText span:not(.entered)'), entered = document.querySelector('#sentenceText .entered');
  if (!rest?.textContent) return;
  const char = String.fromCharCode(e.charCode).toUpperCase();
  if (char === rest.textContent[0]) {
    accepted += char; stamps.push(e.timeStamp); entered.textContent += char; rest.textContent = rest.textContent.slice(1);
  } else errors++;
  display(); e.preventDefault();
});
