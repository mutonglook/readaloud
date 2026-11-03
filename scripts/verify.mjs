/* 用本机 Edge 无头验证应用流程：书架 → 示例书 → 阅读器 → 开始朗读 */
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:5173/';
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-11-03-13-32-56/.shots';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-first-run', '--disable-gpu'],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

page.on('pageerror', (e) => console.log('[PAGE ERROR]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 200));
});

await page.goto(BASE, { waitUntil: 'networkidle2' });
await sleep(1800);
await page.screenshot({ path: `${OUT}/01-shelf.png` });
console.log('shelf subtitle:', await page.$eval('.shelf__subtitle', (el) => el.textContent));

// 空书架 → 点"读个示例"
const clickedSample = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('示例'));
  if (btn) {
    btn.click();
    return true;
  }
  return false;
});
if (clickedSample) {
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/02-reader.png` });
  console.log('reader loaded, chapter:', await page.$eval('.chapter-title', (el) => el.textContent).catch(() => 'N/A'));
}

// 点底栏的朗读按钮（最后一个 icon-btn.primary）
const playBtns = await page.$$('.reader__bottom .icon-btn.primary');
console.log('bottom primary buttons:', playBtns.length);
if (playBtns.length) {
  await playBtns[0].click();
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/03-speaking.png` });
  const badge = await page.$('.player-bar__badge');
  console.log('player badge:', badge ? await page.evaluate((el) => el.textContent, badge) : 'no player bar');
  const err = await page.$('.player-bar__error');
  if (err) console.log('player error:', await page.evaluate((el) => el.textContent, err));
}

// 设置页
const backBtn = await page.$('.reader__topbar .icon-btn');
if (backBtn) {
  await backBtn.click();
  await sleep(600);
}
const settingsBtn = await page.$('button[aria-label="设置"]');
if (settingsBtn) {
  await settingsBtn.click();
  await sleep(800);
  await page.screenshot({ path: `${OUT}/04-settings.png` });
  console.log('settings opened');
}

await browser.close();
console.log('DONE');
