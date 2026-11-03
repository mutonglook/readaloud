/* v1.2.0 验证：掌阅风格书架 / 书城 / 发现 / 我的 + 分页阅读 */
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:5173/';
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-11-03-13-32-56/.shots';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const log = (...a) => console.log(...a);

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-first-run', '--disable-gpu'],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push('[PAGE ERROR] ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 180));
});

await page.goto(BASE, { waitUntil: 'networkidle2' });
await sleep(1800);

// ---------- 1. 空书架 ----------
await page.screenshot({ path: `${OUT}/v12-01-shelf-empty.png` });
log('tabbar items:', await page.$$eval('.tabbar__item', (n) => n.map((x) => x.textContent)));
log('empty title:', await page.$eval('.empty__title', (e) => e.textContent).catch(() => 'N/A'));

// ---------- 2. 载入示例书进阅读页 ----------
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('示例'));
  b?.click();
});
await sleep(2000);
log('reader mounted:', !!(await page.$('.rd')));
log('theme attr:', await page.$eval('.rd', (e) => e.dataset.theme));
const foot0 = await page.$eval('.rd__foot', (e) => e.textContent).catch(() => 'N/A');
log('page indicator:', foot0);

// ---------- 3. 翻页：点右侧 ----------
await page.mouse.click(355, 420);
await sleep(600);
const foot1 = await page.$eval('.rd__foot', (e) => e.textContent).catch(() => 'N/A');
log('after click right:', foot1);
await page.mouse.click(30, 420);
await sleep(600);
const foot2 = await page.$eval('.rd__foot', (e) => e.textContent).catch(() => 'N/A');
log('after click left :', foot2);

// 翻译量一致性：分页宽度是否等于视口
const pgInfo = await page.evaluate(() => {
  const s = document.querySelector('.rd__stream');
  const cs = getComputedStyle(s);
  return {
    scrollWidth: s.scrollWidth,
    vw: window.innerWidth,
    columnWidth: cs.columnWidth,
    columnGap: cs.columnGap,
    transform: cs.transform,
  };
});
log('paginate:', JSON.stringify(pgInfo));

// ---------- 4. 中间点击 → 工具栏 ----------
await page.mouse.click(195, 420);
await sleep(600);
log('bars-open:', await page.$eval('.rd', (e) => e.className));
await page.screenshot({ path: `${OUT}/v12-02-reader-bars.png` });
log('tools:', await page.$$eval('.rd__tool', (n) => n.map((x) => x.textContent.trim())));

// ---------- 5. 字体 → 阅读设置面板 ----------
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.rd__tool')].find((x) => x.textContent.includes('字体'));
  t?.click();
});
await sleep(800);
await page.screenshot({ path: `${OUT}/v12-03-read-panel.png` });
log('swatches:', await page.$$eval('.swatch', (n) => n.map((x) => x.textContent)));
log('page modes:', await page.$$eval('.pset .segmented', (n) => n.length));

// 夜间
await page.evaluate(() => {
  const s = [...document.querySelectorAll('.swatch')].find((x) => x.textContent === '夜');
  s?.click();
});
await sleep(900);
await page.screenshot({ path: `${OUT}/v12-04-night.png` });
log('night bg:', await page.$eval('.rd', (e) => getComputedStyle(e).backgroundColor));

// 回纸质
await page.evaluate(() => {
  const s = [...document.querySelectorAll('.swatch')].find((x) => x.textContent === '纸');
  s?.click();
});
await sleep(700);
await page.evaluate(() => document.querySelector('.scrim')?.click());
await sleep(500);

// ---------- 6. 目录 ----------
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.rd__tool')].find((x) => x.textContent.includes('目录'));
  t?.click();
});
await sleep(700);
await page.screenshot({ path: `${OUT}/v12-05-toc.png` });
log('toc items:', await page.$$eval('.toc__item', (n) => n.length));
await page.evaluate(() => document.querySelector('.scrim')?.click());
await sleep(500);

// ---------- 7. 听书 ----------
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.rd__tool')].find((x) => x.textContent.includes('听书'));
  t?.click();
});
await sleep(2200);
await page.screenshot({ path: `${OUT}/v12-06-listen.png` });
log('listen panel:', !!(await page.$('.listen')));
log('listen badge:', await page.$eval('.listen__badge', (e) => e.textContent).catch(() => 'N/A'));
log('toast:', await page.$eval('.toast', (e) => e.textContent).catch(() => 'none'));
await page.evaluate(() => document.querySelector('.listen .scrim, .scrim')?.click());
await sleep(400);

// ---------- 8. 返回书架 ----------
await page.mouse.click(195, 420); // 唤出工具栏
await sleep(500);
await page.evaluate(() => document.querySelector('.rd__top .icon-btn')?.click());
await sleep(1400);
log('back to shelf:', !!(await page.$('.sh')));
await page.screenshot({ path: `${OUT}/v12-07-shelf.png` });
log('recent card:', await page.$eval('.recent__title', (e) => e.textContent).catch(() => 'none'));

// 列表视图
await page.evaluate(() => {
  const btns = document.querySelectorAll('.view-toggle button');
  btns[1]?.click();
});
await sleep(700);
await page.screenshot({ path: `${OUT}/v12-08-shelf-list.png` });
log('list rows:', await page.$$eval('.list .row', (n) => n.length));
await page.evaluate(() => document.querySelectorAll('.view-toggle button')[0]?.click());
await sleep(400);

// ---------- 9. 书城 / 发现 / 我的 ----------
for (const [i, name] of ['store', 'discover', 'mine'].entries()) {
  await page.evaluate((idx) => document.querySelectorAll('.tabbar__item')[idx]?.click(), i + 1);
  await sleep(1400);
  await page.screenshot({ path: `${OUT}/v12-0${9 + i}-${name}.png` });
  log(`${name} rendered:`, await page.$eval('.app__main', (e) => e.firstElementChild?.className ?? 'none'));
}

log('stats:', await page.$$eval('.me__stat', (n) => n.map((x) => x.textContent)));

// ---------- 10. 我的 → 阅读设置 ----------
await page.evaluate(() => {
  const r = [...document.querySelectorAll('.mrow')].find((x) => x.textContent.includes('阅读设置'));
  r?.click();
});
await sleep(1000);
await page.screenshot({ path: `${OUT}/v12-12-settings.png` });
log('settings theme dots:', await page.$$eval('.theme-dot', (n) => n.map((x) => x.textContent.trim())));

await browser.close();
log('--- errors:', errors.length);
errors.slice(0, 10).forEach((e) => log(e));
log('DONE');
