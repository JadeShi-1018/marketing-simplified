const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--host-resolver-rules=MAP localhost 172.18.0.2'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto('http://localhost/login', { waitUntil: 'load' });
  await page.getByPlaceholder('Enter your email').fill('lzz123@gmail.com');
  await page.getByPlaceholder('Enter your password').fill('TempDevPass123!');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.goto('http://localhost/csm/templates', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const editButtons = await page.locator('button[title="Edit"], button:has(svg.lucide-pencil)').all();
  if (editButtons.length > 0) { await editButtons[0].click(); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/modal-full.png' });
  await page.screenshot({ path: '/tmp/modal-top-strip.png', clip: { x: 0, y: 0, width: 1600, height: 80 } });

  const overlayInfo = await page.evaluate(() => {
    const overlay = document.querySelector('.fixed.inset-0.z-50');
    const cs = overlay ? getComputedStyle(overlay) : null;
    return cs ? { top: cs.top, right: cs.right, bottom: cs.bottom, left: cs.left, position: cs.position, inset: cs.inset } : null;
  });
  console.log('overlay inset props:', JSON.stringify(overlayInfo));

  // Find all elements whose top edge is within the top 20px band and are actually painted (non-zero size, visible)
  const topElements = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.top <= 20 && r.height > 0 && r.width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden') {
        results.push({
          tag: el.tagName,
          id: el.id,
          cls: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
          rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height },
          bg: cs.backgroundColor,
          zIndex: cs.zIndex,
          position: cs.position,
        });
      }
    });
    return results;
  });
  console.log(JSON.stringify(topElements, null, 2));
  await browser.close();
})();
