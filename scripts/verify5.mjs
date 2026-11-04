/* v1.3.0 视觉验证：两页签 / 掌阅式书架 / 我的 / 阅读页工具栏 */
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
  if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 160));
});

await page.goto(BASE, { waitUntil: 'networkidle2' });
await sleep(1500);

// 1) 空书架
await page.screenshot({ path: `${OUT}/v13-01-empty.png` });

// 底部页签只剩两项
const tabs = await page.$$eval('.tabbar__item span', (n) => n.map((x) => x.textContent));
console.log('tabs:', JSON.stringify(tabs));
const tabW = await page.$$eval('.tabbar__item', (n) => n.map((x) => Math.round(x.getBoundingClientRect().width)));
console.log('tab widths:', JSON.stringify(tabW));

// 2) 导入示例书
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('示例'));
  b?.click();
});
await sleep(2200);
await page.evaluate(() => document.querySelector('.rd__top .icon-btn')?.click());
await sleep(900);
await page.screenshot({ path: `${OUT}/v13-02-shelf.png` });

// 3) 我的
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.tabbar__item')];
  items[1]?.click();
});
await sleep(700);
await page.screenshot({ path: `${OUT}/v13-03-mine.png` });

// 4) 回书架 → 进入阅读页 → 唤出工具栏
await page.evaluate(() => document.querySelectorAll('.tabbar__item')[0]?.click());
await sleep(600);
await page.screenshot({ path: `${OUT}/v13-04-shelf-filled.png` });
await page.evaluate(() => document.querySelector('.bk')?.click());
await sleep(1800);
await page.screenshot({ path: `${OUT}/v13-05-reader.png` });
await page.mouse.click(195, 420);
await sleep(600);
await page.screenshot({ path: `${OUT}/v13-06-reader-bars.png` });

// 阅读设置面板
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.rd__tool')].find((x) => x.textContent.includes('字体'));
  t?.click();
});
await sleep(700);
await page.screenshot({ path: `${OUT}/v13-08-pset.png` });
await page.evaluate(() => document.querySelector('.scrim')?.click());
await sleep(400);

// 5) 返回书架，长按封面进管理模式
await page.evaluate(() => document.querySelector('.rd__top .icon-btn')?.click());
await sleep(900);
const box = await page.$eval('.bk__cover', (e) => {
  const r = e.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(box.x, box.y);
await page.mouse.down();
await sleep(700);
await page.mouse.up();
await sleep(500);
await page.screenshot({ path: `${OUT}/v13-07-manage.png` });

// 6) 列表视图
await page.evaluate(() => document.querySelector('.sh__text-btn')?.click());
await sleep(400);
await page.evaluate(() => document.querySelector('.sh__view')?.click());
await sleep(500);
await page.screenshot({ path: `${OUT}/v13-09-list.png` });

console.log('errors:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
await browser.close();
