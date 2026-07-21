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

async function readAuth(
  context: BrowserContext,
): Promise<{ token: string; activeProjectId: number }> {
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

  return { token: token as string, activeProjectId: activeProjectId as number };
}

async function getOrCreateSpreadsheetSlug(
  context: BrowserContext,
  request: APIRequestContext,
): Promise<string> {
  const { token, activeProjectId } = await readAuth(context);
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
    await page2.evaluate(
      ({ expected }) => {
        const peerWindow = window as typeof window & {
          __sheetPropagation?: Promise<number>;
        };
        const cell = document.querySelector('td[data-row="3"][data-col="2"]');
        if (!cell) throw new Error('peer target cell not found');
        const startedAt = performance.now();
        peerWindow.__sheetPropagation = new Promise<number>((resolve) => {
          const finishIfUpdated = () => {
            if (!cell.textContent?.includes(expected)) return false;
            resolve(performance.now() - startedAt);
            return true;
          };
          if (finishIfUpdated()) return;
          const observer = new MutationObserver(() => {
            if (finishIfUpdated()) observer.disconnect();
          });
          observer.observe(cell, { childList: true, characterData: true, subtree: true });
          window.setTimeout(() => {
            observer.disconnect();
            resolve(Number.POSITIVE_INFINITY);
          }, 2_000);
        });
      },
      { expected: value },
    );
    await editor.press('Enter');

    // Tab 2 receives the broadcast and renders it without any navigation,
    // inside the ticket's end-to-end latency budget. The peer page's own
    // MutationObserver measures the DOM update directly, avoiding Playwright's
    // assertion polling interval from inflating the measurement.
    const propagationMs = await page2.evaluate(async () => {
      const peerWindow = window as typeof window & {
        __sheetPropagation?: Promise<number>;
      };
      return peerWindow.__sheetPropagation;
    });
    expect(
      propagationMs,
      `peer edit propagation took ${propagationMs}ms (expected <300ms)`,
    ).toBeLessThan(300);
    await expect(page2.locator('td[data-row="3"][data-col="2"]')).toContainText(value);

    // Tab 1 keeps its optimistic value and then applies the authoritative response.
    await expect(page.locator('td[data-row="3"][data-col="2"]')).toContainText(value, {
      timeout: 10_000,
    });

    await page2.close();
  });

  test('structure op (insert row) triggers auto-refresh in both tabs', async ({
    page,
    context,
    request,
  }) => {
    const spreadsheetSlug = await getOrCreateSpreadsheetSlug(context, request);
    const { token } = await readAuth(context);
    const headers = { Authorization: `Bearer ${token}` };

    // Resolve the first sheet id for API-driven mutations.
    const sheetsResp = await request.get(
      `/api/spreadsheet/spreadsheets/${spreadsheetSlug}/sheets/`,
      { headers },
    );
    expect(sheetsResp.ok(), `sheet list API returned ${sheetsResp.status()}`).toBeTruthy();
    const sheetsBody = await sheetsResp.json();
    const sheets: Array<{ id: number }> = sheetsBody.results ?? sheetsBody ?? [];
    expect(sheets.length).toBeGreaterThan(0);
    const sheetId = sheets[0].id;
    const base = `/api/spreadsheet/spreadsheets/${spreadsheetSlug}/sheets/${sheetId}`;

    await stubOnboardingComplete(page);
    await page.goto(`/spreadsheets/${spreadsheetSlug}`);
    await waitForSpreadsheetPageReady(page);
    await expect(page.locator('td[data-row][data-col]').first()).toBeVisible({
      timeout: 30_000,
    });

    const page2 = await context.newPage();
    await stubOnboardingComplete(page2);
    await page2.goto(page.url());
    await waitForSpreadsheetPageReady(page2);
    await expect(page2.locator('td[data-row][data-col]').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page2.getByTestId('sheet-presence-avatar').first()).toBeVisible({
      timeout: 15_000,
    });

    // Seed a unique marker via the API (no client_id → cells_updated reaches both tabs).
    const marker = `struct-${Date.now()}`;
    const batchResp = await request.post(`${base}/cells/batch/`, {
      headers,
      data: {
        operations: [{ operation: 'set', row: 5, column: 1, raw_input: marker }],
        auto_expand: true,
      },
    });
    expect(batchResp.ok(), `cell batch API returned ${batchResp.status()}`).toBeTruthy();
    await expect(page.locator('td[data-row="5"][data-col="1"]')).toContainText(marker, {
      timeout: 10_000,
    });
    await expect(page2.locator('td[data-row="5"][data-col="1"]')).toContainText(marker, {
      timeout: 10_000,
    });

    // Insert a row above; no X-Sheet-Client-Id header, so BOTH tabs must
    // receive sheet_refresh_required and reload — the marker shifts down one row.
    const insertResp = await request.post(`${base}/rows/insert/`, {
      headers,
      data: { position: 0, count: 1 },
    });
    expect(insertResp.ok(), `row insert API returned ${insertResp.status()}`).toBeTruthy();

    await expect(page.locator('td[data-row="6"][data-col="1"]')).toContainText(marker, {
      timeout: 10_000,
    });
    await expect(page2.locator('td[data-row="6"][data-col="1"]')).toContainText(marker, {
      timeout: 10_000,
    });

    await page2.close();
  });
});
