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

  const details = await page.evaluate(() => {
    const overlay = document.querySelector('.fixed.inset-0.z-50');
    const cs = getComputedStyle(overlay);
    // find matching CSS rules for this element
    const rules = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let cssRules;
      try { cssRules = sheet.cssRules; } catch (e) { continue; }
      for (const rule of Array.from(cssRules || [])) {
        try {
          if (rule.selectorText && overlay.matches(rule.selectorText) && /top|inset/.test(rule.cssText)) {
            rules.push(rule.cssText.slice(0, 200));
          }
        } catch (e) {}
      }
    }
    return {
      className: overlay.className,
      top: cs.top, left: cs.left, right: cs.right, bottom: cs.bottom,
      inset: cs.inset,
      parentChain: (() => {
        const chain = [];
        let el = overlay.parentElement;
        let depth = 0;
        while (el && depth < 8) {
          chain.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0,100) });
          el = el.parentElement; depth++;
        }
        return chain;
      })(),
      matchingRules: rules,
    };
  });
  console.log(JSON.stringify(details, null, 2));
  await browser.close();
})();
