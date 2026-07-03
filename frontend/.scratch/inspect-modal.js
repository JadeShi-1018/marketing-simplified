const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--host-resolver-rules=MAP localhost 172.18.0.2'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('http://localhost/login', { waitUntil: 'load' });
  await page.getByPlaceholder('Enter your email').fill('lzz123@gmail.com');
  await page.getByPlaceholder('Enter your password').fill('TempDevPass123!');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(2000);
  console.log('URL after submit:', page.url());
  await page.screenshot({ path: '/tmp/00-after-submit.png', fullPage: false });
  console.log('body text snippet:', (await page.locator('body').innerText()).slice(0, 500));

  await page.goto('http://localhost/csm/templates', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/01-templates-page.png', fullPage: false });

  // Try to open an existing template's edit modal via its edit/pencil button.
  const editButtons = await page.locator('button[title="Edit"], button:has(svg.lucide-pencil)').all();
  console.log('edit buttons found:', editButtons.length);
  if (editButtons.length > 0) {
    await editButtons[0].click();
  } else {
    // No templates yet — create one so we can open the Edit modal state.
    await page.getByRole('button', { name: /New Template/i }).click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/02-modal-open.png', fullPage: false });

  // Inspect the header bar and the modal overlay boxes.
  const info = await page.evaluate(() => {
    const header = document.querySelector('header');
    const overlay = document.querySelector('.fixed.inset-0.z-50');
    const rectOf = (el) => el ? el.getBoundingClientRect() : null;
    const styleOf = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { position: cs.position, zIndex: cs.zIndex, transform: cs.transform, filter: cs.filter, backdropFilter: cs.backdropFilter, background: cs.backgroundColor };
    };
    // Walk up from header to html, collecting any transform/filter/perspective ancestors.
    const suspects = [];
    let el = header;
    while (el && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      if (cs.transform !== 'none' || cs.filter !== 'none' || cs.perspective !== 'none' || cs.contain !== 'none' || cs.willChange.includes('transform')) {
        suspects.push({ tag: el.tagName, cls: el.className, transform: cs.transform, filter: cs.filter, contain: cs.contain });
      }
      el = el.parentElement;
    }
    return {
      headerRect: rectOf(header),
      headerStyle: styleOf(header),
      overlayRect: rectOf(overlay),
      overlayStyle: styleOf(overlay),
      suspectAncestors: suspects,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  console.log('console errors:', errors);

  await browser.close();
})();
