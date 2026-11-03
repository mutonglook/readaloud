/* v1.2.0 交互验证：跨章翻页 / 上下滚动模式 / 长按管理书架 */
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
await sleep(1600);

// 书架已有书，直接点封面进阅读
// 全新 profile 的 IndexedDB 是空的，先载入示例书
await page.waitForSelector('.empty__cta', { timeout: 10000 }).catch(() => {});
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('示例'));
  b?.click();
});
await sleep(2000);
await page.evaluate(() => document.querySelector('.rd__top .icon-btn')?.click());
await page.waitForSelector('.bk', { timeout: 10000 }).catch(() => log('!! 书架没有书'));
await sleep(300);
await page.evaluate(() => document.querySelector('.bk')?.click());
await sleep(2000);
log('reader open:', !!(await page.$('.rd')));
const foot = () => page.$eval('.rd__foot', (e) => e.textContent).catch(() => 'N/A');
log('start:', await foot());

// 跨章：第1章2页，点右侧3次应进入第2章
for (let i = 0; i < 3; i++) {
  await page.mouse.click(355, 420);
  await sleep(700);
  log(`click right #${i + 1}:`, await foot());
}

// 回第一页
await page.mouse.click(30, 420);
await sleep(600);
log('back left:', await foot());

// 切到上下滚动
await page.mouse.click(195, 420);
await sleep(500);
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.rd__tool')].find((x) => x.textContent.includes('字体'));
  t?.click();
});
await sleep(700);
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.pset .segmented button')];
  btns.find((b) => b.textContent.includes('上下滚动'))?.click();
});
await sleep(900);
await page.evaluate(() => document.querySelector('.scrim')?.click());
await sleep(600);
const flowInfo = await page.evaluate(() => {
  const s = document.querySelector('.rd__stream');
  return {
    flowClass: s.className.includes('flow'),
    transform: getComputedStyle(s).transform,
    overflowY: getComputedStyle(s).overflowY,
    scrollable: s.scrollHeight > s.clientHeight,
  };
});
log('flow mode:', JSON.stringify(flowInfo));
await page.screenshot({ path: `${OUT}/v12-13-flow.png` });

// 恢复平移
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.rd__tool')].find((x) => x.textContent.includes('字体'));
  t?.click();
});
await sleep(600);
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.pset .segmented button')];
  btns.find((b) => b.textContent.includes('平移'))?.click();
});
await sleep(700);
await page.evaluate(() => document.querySelector('.scrim')?.click());
await sleep(400);

// 返回书架
await page.mouse.click(195, 420);
await sleep(500);
await page.evaluate(() => document.querySelector('.rd__top .icon-btn')?.click());
await sleep(1500);

// 长按封面进管理模式
const box = await page.$eval('.bk', (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(box.x, box.y);
await page.mouse.down();
await sleep(800);
await page.mouse.up();
await sleep(700);
await page.screenshot({ path: `${OUT}/v12-14-manage.png` });
log('manage bar:', !!(await page.$('.manage')));
log('header title:', await page.$eval('.sh__title', (e) => e.textContent).catch(() => 'N/A'));
log('selected:', await page.$$eval('.bk__sel.on', (n) => n.length));

// 退出管理
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.sh__tools button')].find((x) => x.textContent.includes('完成'));
  b?.click();
});
await sleep(500);
log('after exit:', await page.$eval('.sh__title', (e) => e.textContent));

await browser.close();
log('--- errors:', errors.length);
errors.slice(0, 8).forEach((e) => log(e));
log('DONE');
