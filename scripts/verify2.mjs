/* v1.1.0 验证：搜索框 / 字体 / Edge 语音 / 全屏 / M3 Expressive 视觉 */
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:5173/';
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-11-03-13-32-56/.shots';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-first-run', '--disable-gpu'],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

page.on('pageerror', (e) => errors.push('[PAGE ERROR] ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 200));
});

await page.goto(BASE, { waitUntil: 'networkidle2' });
await sleep(1600);

// 1) 空书架
await page.screenshot({ path: `${OUT}/v11-01-empty.png` });
console.log('subtitle:', await page.$eval('.shelf__subtitle', (el) => el.textContent));

// 2) 载入示例书 → 阅读器
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('示例'));
  btn?.click();
});
await sleep(1500);
await page.screenshot({ path: `${OUT}/v11-02-reader.png` });
console.log('chapter:', await page.$eval('.chapter-title', (el) => el.textContent).catch(() => 'N/A'));

const readerFont = await page.$eval('.reader__text', (el) => getComputedStyle(el).fontFamily);
console.log('reader font-family:', readerFont.slice(0, 60));

// 3) 排版抽屉：字体网格 + 全屏
await page.click('button[aria-label="排版"]');
await sleep(700);
await page.screenshot({ path: `${OUT}/v11-03-type-drawer.png` });
console.log('font chips in drawer:', await page.$$eval('.drawer .font-chip', (n) => n.length));
console.log('immersive switch present:', !!(await page.$('.drawer .switch')));

// 点一个不同字体，确认正文立刻变
await page.evaluate(() => {
  const chips = [...document.querySelectorAll('.drawer .font-chip')];
  const kai = chips.find((c) => c.textContent.includes('楷体'));
  kai?.click();
});
await sleep(600);
console.log('after 楷体:', await page.$eval('.reader__text', (el) => getComputedStyle(el).fontFamily.slice(0, 50)));

// 关掉抽屉
await page.evaluate(() => document.querySelector('.scrim')?.click());
await sleep(600);

// 4) 返回书架
await page.evaluate(() => document.querySelector('.reader__topbar .icon-btn')?.click());
await page.waitForSelector('.shelf__header', { timeout: 8000 }).catch(() => console.log('!! 仍在阅读器'));
await sleep(900);
console.log('view has shelf:', !!(await page.$('.shelf__header')));
await page.screenshot({ path: `${OUT}/v11-04-shelf-with-book.png` });

// 5) 搜索：命中
const hasSearch = !!(await page.$('.search__input'));
console.log('search box present:', hasSearch);
if (hasSearch) {
  const realTitle = await page.$eval('.book-card__name', (el) => el.textContent ?? '');
  const realAuthor = await page.$eval('.book-card__author', (el) => el.textContent ?? '');
  console.log('book title:', realTitle, '| author line:', realAuthor);

  const keyword = realTitle.slice(0, 2);
  await page.click('.search__input');
  await page.type('.search__input', keyword);
  await sleep(500);
  await page.screenshot({ path: `${OUT}/v11-05-search-hit.png` });
  console.log(`search "${keyword}" → subtitle:`, await page.$eval('.shelf__subtitle', (el) => el.textContent));
  console.log('hit cards:', await page.$$eval('.book-card', (n) => n.length));
  console.log('typing works:', await page.$eval('.search__input', (el) => el.value));

  // 搜索：无结果
  await page.evaluate(() => {
    const i = document.querySelector('.search__input');
    i.value = '';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.type('.search__input', 'zzzz');
  await sleep(500);
  await page.screenshot({ path: `${OUT}/v11-06-search-empty.png` });
  console.log('empty subtitle:', await page.$eval('.shelf__subtitle', (el) => el.textContent));
  console.log('empty state shown:', !!(await page.$('.empty--search')));

  // 清空
  await page.click('.search__clear');
  await sleep(400);
}

// 6) 设置页
await page.evaluate(() => document.querySelector('button[aria-label="设置"]')?.click());
await page.waitForSelector('.settings__header', { timeout: 8000 }).catch(() => console.log('!! 未进入设置'));
await sleep(900);
await page.screenshot({ path: `${OUT}/v11-07-settings.png` });
console.log('settings font chips:', await page.$$eval('.font-grid .font-chip', (n) => n.length));
console.log('provider buttons:', await page.$$eval('.segmented--3 button', (n) => n.map((b) => b.textContent)));

// 7) 切到 Edge 免费语音 → 音色网格
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.segmented--3 button')].find((b) => b.textContent.includes('Edge'));
  btn?.click();
});
await sleep(700);
console.log('edge voice chips:', await page.$$eval('.voice-chip', (n) => n.length));
await page.evaluate(() => {
  document.querySelector('.voice-grid')?.scrollIntoView({ block: 'center' });
});
await sleep(600);
await page.screenshot({ path: `${OUT}/v11-08-edge-voices.png` });

// 8) 样式抽查
const style = await page.evaluate(() => {
  const panel = document.querySelector('.panel');
  return {
    panelRadius: panel ? getComputedStyle(panel).borderRadius : null,
    panelBlur: panel ? getComputedStyle(panel).backdropFilter : null,
  };
});
console.log('expressive style:', JSON.stringify(style));

await browser.close();
console.log('--- errors:', errors.length);
errors.slice(0, 8).forEach((e) => console.log(e));
console.log('DONE');
