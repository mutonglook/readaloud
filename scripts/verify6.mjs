// 验证多格式导入：md / html / docx / fb2 / pdf
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'C:/Users/Administrator/WorkBuddy/2026-11-03-13-32-56/.shots';
const BOOKS = path.resolve('.tmp/testbooks');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-first-run', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !t.includes('favicon')) errors.push('[console] ' + t.slice(0, 200));
});

await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle2' });
await sleep(1200);

const files = ['sample.md', 'sample.html', 'sample.docx', 'sample.fb2', 'sample.pdf'];

for (const name of files) {
  const input = await page.$('input[type=file]');
  if (!input) {
    console.log('!! 找不到文件输入框');
    break;
  }
  await input.uploadFile(path.join(BOOKS, name));
  // PDF 解析要按页提取，多等一会
  await sleep(name.endsWith('.pdf') ? 9000 : 2600);

  const state = await page.evaluate(() => {
    const bname = document.querySelector('.rd__bname')?.textContent?.trim() ?? null;
    const heading = document.querySelector('.rd__h')?.textContent?.trim() ?? null;
    const body = document.querySelector('.rd__text')?.textContent?.slice(0, 60) ?? null;
    const toast = document.querySelector('.toast')?.textContent?.trim() ?? null;
    const importing = document.querySelector('.importing__text')?.textContent?.trim() ?? null;
    return { bname, heading, body, toast, importing };
  });
  console.log(name, '→', JSON.stringify(state));

  // 打开目录数一下章节数
  if (state.bname) {
    await page.mouse.click(195, 420);
    await sleep(400);
    await page.evaluate(() => {
      const t = [...document.querySelectorAll('.rd__tool')].find((x) => x.textContent.includes('目录'));
      t?.click();
    });
    await sleep(600);
    const toc = await page.$$eval('.toc__item', (n) => n.map((x) => x.textContent?.trim()));
    console.log('   章节:', toc.length, JSON.stringify(toc.slice(0, 6)));
    await page.evaluate(() => document.querySelector('.scrim')?.click());
    await sleep(300);
  }

  // 返回书架
  await page.evaluate(() => {
    const bars = document.querySelector('.rd');
    if (!bars) return;
    const btn = document.querySelector('.rd__top .icon-btn');
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await sleep(100);
  await page.mouse.click(195, 420);
  await sleep(300);
  await page.evaluate(() => document.querySelector('.rd__top .icon-btn')?.click());
  await sleep(900);
}

// 书架总览
const shelf = await page.$$eval('.bk__title', (n) => n.map((x) => x.textContent?.trim()));
console.log('书架:', JSON.stringify(shelf));
await page.screenshot({ path: `${OUT}/v14-01-shelf-all.png` });

console.log('errors:', errors.length ? JSON.stringify(errors.slice(0, 5), null, 1) : 'none');
await browser.close();
