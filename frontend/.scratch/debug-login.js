const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('request', (req) => { if (req.url().includes('login') || req.url().includes('auth')) console.log('>>', req.method(), req.url(), req.postData()); });
  page.on('response', async (res) => { if (res.url().includes('login') || res.url().includes('auth')) { let body=''; try { body = await res.text(); } catch(e){} console.log('<<', res.status(), res.url(), body.slice(0,300)); } });
  await page.goto('http://nginx-dev/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/pre-fill.png' });
  const emailBox = page.getByPlaceholder('Enter your email');
  console.log('email box count:', await emailBox.count());
  await emailBox.fill('lzz123@gmail.com');
  await page.getByPlaceholder('Enter your password').fill('TempDevPass123!');
  await page.screenshot({ path: '/tmp/post-fill.png' });
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
  console.log('final url', page.url());
  await browser.close();
})();
