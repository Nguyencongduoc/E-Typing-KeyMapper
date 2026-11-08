// Isolated, headless development test. Does not attach to the user's Chrome profile.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.ETKM_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const out = path.join(root, '.browser-test'); fs.mkdirSync(out, { recursive: true });
  const context = await chromium.launchPersistentContext(path.join(out, 'probe-edge'), {
    executablePath: process.env.ETKM_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    viewport: { width: 1280, height: 1000 }
  });
  const errors = [];
  try {
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://www.e-typing.ne.jp/roma/check/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('#level_check_btn').click();
    await page.frameLocator('#typing_content').locator('#start_btn').waitFor({ timeout: 30000 });
    const game = page.frames().find(f => f.url().includes('/app/jsa_std/typing.asp'));
    for (const index of [0, 3]) {
      const control = game.locator('#func_view .switch_btn').nth(index);
      if ((await control.locator('.on_btn').getAttribute('class')).includes('show')) await control.click();
    }
    await game.locator('#start_btn').click();
    await game.locator('#start_msg').waitFor({ state: 'visible' });
    await game.locator('#start_msg').click();
    await page.keyboard.press('Space');
    await game.waitForFunction(() => !document.getElementById('countdown') && !!document.getElementById('sentenceText'));
    const before = await game.locator('#sentenceText').textContent();
    await page.keyboard.press('x');
    const after = await game.locator('#sentenceText').textContent();
    await page.waitForTimeout(1000);
    const frames = [];
    for (const frame of page.frames().filter(f => f.url().includes('e-typing.ne.jp'))) {
      try { frames.push({ url: frame.url(), ...await frame.evaluate(() => ({ installed: !!window.__etypingRemapperInstalled, hud: !!document.getElementById('etyping-auto-hud'), ready: document.readyState })) }); } catch (_) {}
    }
    await page.screenshot({ path: path.join(out, 'probe.png') });
    const hudText = await game.locator('#etyping-auto-hud').textContent();
    const result = { frames, errors, before, after, hudText };
    fs.writeFileSync(path.join(out, 'probe.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await context.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
