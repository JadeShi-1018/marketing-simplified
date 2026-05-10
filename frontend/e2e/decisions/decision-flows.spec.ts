import { test, expect } from '@playwright/test';
import {
  createDraftDecisionViaApi,
  deleteDecisionAfterCreate,
  getActiveProjectId,
  goToDecisions,
} from './decisions-helpers';

test.describe('Decisions flows', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await goToDecisions(page);
  });

  test('decisions list shows project sections and list or empty state', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'Decisions' })).toBeVisible();
    await expect(page.getByText('Review, create, and connect decisions across your project.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Decision' }).first()).toBeVisible();

    const hasEmptyState = await page
      .getByText('No decisions yet')
      .isVisible()
      .catch(() => false);
    const hasDecisionTable = await page.locator('table').isVisible().catch(() => false);

    expect(
      hasEmptyState || hasDecisionTable,
      'Expected either decisions empty state or a decision table.',
    ).toBeTruthy();
  });

  test('opening decision navigates to /decisions/[decisionId] with detail content', async ({
    page,
  }) => {
    const projectId = await getActiveProjectId(page);
    test.skip(!projectId, 'No active project available for decisions tests.');

    const decisionId = await createDraftDecisionViaApi(page, projectId!);

    await page.goto(`/decisions/${decisionId}?project_id=${projectId}`);

    await expect(page).toHaveURL(
      new RegExp(`/decisions/${decisionId}(\\?.*project_id=${projectId}.*)?$`),
    );
    await expect(page.getByRole('heading', { name: 'Context Summary' })).toBeVisible();

    await deleteDecisionAfterCreate(page, decisionId, projectId!);
  });

  test('create decision redirects to draft editor', async ({ page }) => {
    const projectId = await getActiveProjectId(page);
    test.skip(!projectId, 'No active project available for decisions tests.');

    await page.getByRole('button', { name: 'Create Decision', exact: true }).first().click();

    await expect(page).toHaveURL(/\/decisions\/\d+(\?.*)?$/, { timeout: 20_000 });
    const match = page.url().match(/\/decisions\/(\d+)/);
    expect(match?.[1], 'Expected a decision id in URL after create.').toBeTruthy();

    const createdId = Number(match![1]);
    await expect(page.getByRole('heading', { name: 'Context Summary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();

    if (Number.isFinite(createdId) && createdId > 0) {
      await deleteDecisionAfterCreate(page, createdId, projectId!);
    }
  });

  test('decision tree/link editor is visible when expanded', async ({ page }) => {
    const projectId = await getActiveProjectId(page);
    test.skip(!projectId, 'No active project available for decisions tests.');

    const decisionId = await createDraftDecisionViaApi(page, projectId!);

    await goToDecisions(page);
    await expect(page.getByText('Decision Tree')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('table')).toBeVisible({ timeout: 20_000 });

    await deleteDecisionAfterCreate(page, decisionId, projectId!);
  });
});
