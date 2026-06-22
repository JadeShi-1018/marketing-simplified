import { test, expect } from '@playwright/test';
import {
  createDraftTaskViaApi,
  deleteTaskById,
  navigateToTasksAndSelectProject,
  waitForTasksPageReady,
  getActiveProjectSlug,
} from './tasks-helpers';

test.describe('Quick task drawer', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: number;
  let projectSlug: string;
  let fixtureTaskIds: number[] = [];

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await context.newPage();
    projectId = await navigateToTasksAndSelectProject(page);
    projectSlug = await getActiveProjectSlug(page);
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    fixtureTaskIds = [];
    await page.goto(`/projects/${encodeURIComponent(projectSlug)}/tasks`);
    await waitForTasksPageReady(page);
    const a = await createDraftTaskViaApi(page, projectId, `Drawer fixture ${Date.now()} A`);
    const b = await createDraftTaskViaApi(page, projectId, `Drawer fixture ${Date.now()} B`);
    fixtureTaskIds.push(a.id, b.id);
    await page.reload();
    await waitForTasksPageReady(page);
    await page.getByTestId('tab-tasks').click();
    await expect(page.getByTestId('task-list')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('task-row-open').nth(1)).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async ({ page }) => {
    for (const taskId of fixtureTaskIds) {
      await deleteTaskById(page, taskId).catch(() => {});
    }
    fixtureTaskIds = [];
  });

  test('clicking a task row opens the drawer without navigating away from the list', async ({ page }) => {
    const firstSummary = page.getByTestId('task-row-open').first();
    await expect(firstSummary).toBeVisible({ timeout: 10_000 });
    await firstSummary.click();

    await expect(page).toHaveURL(/\/projects\/[^/]+\/tasks\/[^/?#]+/, { timeout: 5_000 });
    await expect(page.getByTestId('task-drawer')).toBeVisible({ timeout: 10_000 });
  });

  test('drawer shows task summary instead of numeric id', async ({ page }) => {
    await page.getByTestId('task-row-open').first().click();
    await expect(page.getByTestId('task-drawer')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('task-drawer').getByText(/Task #\d+/)).not.toBeVisible({ timeout: 3_000 });
  });

  test('drawer can be closed with X button', async ({ page }) => {
    await page.getByTestId('task-row-open').first().click();
    await expect(page.getByTestId('task-drawer')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('task-drawer-close').click();
    await expect(page.getByTestId('task-drawer')).not.toBeVisible({ timeout: 5_000 });
  });

  test('drawer can be closed with Escape key', async ({ page }) => {
    await page.getByTestId('task-row-open').first().click();
    await expect(page.getByTestId('task-drawer')).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('task-drawer')).not.toBeVisible({ timeout: 5_000 });
  });

  test('drawer can be closed by clicking the backdrop', async ({ page }) => {
    await page.getByTestId('task-row-open').first().click();
    await expect(page.getByTestId('task-drawer')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('task-drawer-backdrop').click();
    await expect(page.getByTestId('task-drawer')).not.toBeVisible({ timeout: 5_000 });
  });

  test('"Open full page" button navigates to slug task detail', async ({ page }) => {
    await page.getByTestId('task-row-open').first().click();
    await expect(page.getByTestId('task-drawer')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('task-drawer-open-full').click();
    await page.waitForURL(/\/tasks\/[^/?#]+/, { timeout: 10_000 });
    expect(page.url()).not.toMatch(/\/tasks\/\d+(\?|$|\/)/);
  });

  test('task list remains visible behind the drawer', async ({ page }) => {
    await page.getByTestId('task-row-open').first().click();
    await expect(page.getByTestId('task-drawer')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('task-list')).toBeAttached();
  });

  test('j/k nav buttons appear when multiple tasks are visible', async ({ page }) => {
    const rows = page.getByTestId('task-row-open');
    const count = await rows.count();
    if (count < 2) return;

    await rows.first().click();
    await expect(page.getByTestId('task-drawer')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('drawer-nav-prev')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('drawer-nav-next')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('drawer-nav-prev')).toBeDisabled();
    await expect(page.getByTestId('drawer-nav-next')).not.toBeDisabled();
  });

  test('j key navigates to next task', async ({ page }) => {
    const rows = page.getByTestId('task-row-open');
    const count = await rows.count();
    if (count < 2) return;

    await rows.first().click();
    await expect(page.getByTestId('task-drawer')).toBeVisible({ timeout: 10_000 });

    const firstUrl = page.url();
    await page.keyboard.press('j');
    await expect.poll(() => page.url()).not.toBe(firstUrl);
  });

  test('k key navigates to previous task after j', async ({ page }) => {
    const rows = page.getByTestId('task-row-open');
    const count = await rows.count();
    if (count < 2) return;

    await rows.first().click();
    await expect(page.getByTestId('task-drawer')).toBeVisible({ timeout: 10_000 });

    const firstUrl = page.url();
    await page.keyboard.press('j');
    await expect.poll(() => page.url()).not.toBe(firstUrl);

    const secondUrl = page.url();
    await page.keyboard.press('k');
    await expect.poll(() => page.url()).toBe(firstUrl);
    expect(page.url()).not.toBe(secondUrl);
  });

  test('priority chip opens dropdown when clicked', async ({ page }) => {
    await page.getByTestId('task-row-open').first().click();
    await expect(page.getByTestId('task-drawer')).toBeVisible({ timeout: 10_000 });

    const priorityTrigger = page.getByTestId('header-priority-trigger');
    await expect(priorityTrigger).toBeVisible({ timeout: 10_000 });
    await priorityTrigger.click();

    await expect(page.getByRole('button', { name: /urgent/i }).or(page.getByRole('button', { name: /high/i })).first()).toBeVisible({ timeout: 3_000 });
  });
});
