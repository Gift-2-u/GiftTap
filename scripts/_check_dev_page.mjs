import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) =>
  errs.push(`fail: ${r.url()} ${r.failure()?.errorText || ''}`),
);

try {
  await page.goto('http://127.0.0.1:5173/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
} catch (e) {
  errs.push(`goto: ${e.message}`);
}

await page.waitForTimeout(8000);
let root = '';
try {
  root = await page.$eval('#root', (el) => (el.innerHTML || '').slice(0, 300));
} catch (e) {
  root = `no-root: ${e.message}`;
}
console.log('TITLE:', await page.title());
console.log('ROOT:', root || '(empty)');
console.log('ERRS:');
console.log(errs.slice(0, 40).join('\n') || '(none)');
await browser.close();
