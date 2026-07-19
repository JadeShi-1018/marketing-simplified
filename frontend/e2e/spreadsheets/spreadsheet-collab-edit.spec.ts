import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';
import { stubOnboardingComplete, waitForSpreadsheetPageReady } from './spreadsheet-helpers';

/**
 * MED-293 Phase 3: two tabs on the same sheet — an edit committed in tab 1
 * must appear in tab 2 via the cells_updated broadcast, WITHOUT reloading.
 *
 * Same navigation strategy as spreadsheet-presence.spec.ts: go straight to the
 * flat slug route, read token/active project from storageState.
 */

async function getOrCreateSpreadsheetSlug(
  context: BrowserContext,
  request: APIRequestContext,
): Promise<string> {
  const state = await context.storageState();
  const localStorageOf = (name: string): string | undefined => {
    for (const origin of state.origins ?? []) {
      const hit = origin.localStorage?.find((item) => item.name === name);
      if (hit) return hit.value;
    }
    return undefined;
  };
  const parseState = (raw: string | undefined) => {
    try {
      return raw ? JSON.parse(raw)?.state : undefined;
    } catch {
      return undefined;
    }
  };

  const token: string | undefined = parseState(localStorageOf('auth-storage'))?.token;
  expect(token, 'auth token missing from storageState (auth.setup failed?)').toBeTruthy();

  const activeProjectId: number | undefined = parseState(
    localStorageOf('project-storage'),
  )?.activeProject?.id;
  expect(activeProjectId, 'no active project in storageState (auth.setup incomplete?)').toBeTruthy();

  const headers = { Authorization: `Bearer ${token}` };
  const listUrl = `/api/spreadsheet/spreadsheets/?project_id=${activeProjectId}`;

  const listResp = await request.get(listUrl, { headers });
  expect(listResp.ok(), `spreadsheet list API returned ${listResp.status()}`).toBeTruthy();
  const body = await listResp.json();
  const results: Array<{ slug: string }> = body.results ?? body ?? [];
  if (results.length > 0) return results[0].slug;

  const createResp = await request.post(listUrl, {
    headers,
    data: { name: 'Collab Edit E2E' },
  });
  expect(createResp.ok(), `spreadsheet create API returned ${createResp.status()}`).toBeTruthy();
  return (await createResp.json()).slug;
}

test.describe('Spreadsheet realtime edit (two tabs)', () => {
  test.describe.configure({ mode: 'serial' });

  test('edit committed in tab 1 appears in tab 2 without reload', async ({
    page,
    context,
    request,
  }) => {
    const spreadsheetSlug = await getOrCreateSpreadsheetSlug(context, request);

    // The gate would intercept dblclick with a z-[9999] overlay on seeds where
    // devuser lacks an OrganizationMembership row; stub it out for both tabs.
    await stubOnboardingComplete(page);
    await page.goto(`/spreadsheets/${spreadsheetSlug}`);
    await waitForSpreadsheetPageReady(page);
    await expect(page.locator('td[data-row][data-col]').first()).toBeVisible({
      timeout: 30_000,
    });

    const detailUrl = page.url();
    const page2 = await context.newPage();
    await stubOnboardingComplete(page2);
    await page2.goto(detailUrl);
    await waitForSpreadsheetPageReady(page2);
    await expect(page2.locator('td[data-row][data-col]').first()).toBeVisible({
      timeout: 30_000,
    });

    // Both sockets joined (presence avatar of the peer tab visible) before editing,
    // so the broadcast has a live subscriber.
    await expect(page2.getByTestId('sheet-presence-avatar').first()).toBeVisible({
      timeout: 15_000,
    });

    // Unique value so reruns on the same seeded sheet never false-pass.
    const value = `collab-${Date.now()}`;
    // Row 3 / col 2 (0-based): away from the header row used by other suites.
    const cell1 = page.locator('td[data-row="3"][data-col="2"]');
    await cell1.dblclick();
    const editor = cell1.locator('input');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await editor.fill(value);
    await editor.press('Enter');

    // Tab 1 shows its own committed value.
    await expect(page.locator('td[data-row="3"][data-col="2"]')).toContainText(value, {
      timeout: 10_000,
    });

    // Tab 2 receives the broadcast and renders it without any navigation.
    await expect(page2.locator('td[data-row="3"][data-col="2"]')).toContainText(value, {
      timeout: 10_000,
    });

    await page2.close();
  });
});
