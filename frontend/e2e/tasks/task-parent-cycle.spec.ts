import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import {
  createDraftTaskViaApi,
  deleteTaskById,
  linkSubtaskViaApi,
  moveSubtaskViaApi,
  navigateToTasksAndSelectProject,
  openTaskDetailPage,
  waitForTasksPageReady,
} from './tasks-helpers';

const CYCLE_MESSAGE =
  'Cannot set this parent: it would create a circular task hierarchy.';

function seedThreeNodeHierarchy(aId: number, bId: number, cId: number): boolean {
  try {
    execSync(
      `docker exec backend-dev python manage.py shell -c "` +
        `from task.models import Task, TaskHierarchy;` +
        `TaskHierarchy.objects.get_or_create(parent_task_id=${aId}, child_task_id=${bId});` +
        `TaskHierarchy.objects.get_or_create(parent_task_id=${bId}, child_task_id=${cId});` +
        `Task.objects.filter(id=${bId}).update(is_subtask=True);` +
        `Task.objects.filter(id=${cId}).update(is_subtask=True);` +
        `"`,
      { stdio: 'pipe' },
    );
    return true;
  } catch {
    return false;
  }
}

test.describe('Task hierarchy parent picker (MED-235)', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: number;
  const createdTaskIds: number[] = [];

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await context.newPage();
    projectId = await navigateToTasksAndSelectProject(page);
    await context.close();
  });

  test.afterEach(async ({ page }) => {
    while (createdTaskIds.length > 0) {
      const taskId = createdTaskIds.pop();
      if (taskId != null) {
        await deleteTaskById(page, taskId).catch(() => {});
      }
    }
  });

  test('API rejects a move that would create a 3-node cycle with 422', async ({ page }) => {
    await page.goto('/');
    await waitForTasksPageReady(page);

    const stamp = Date.now();
    const taskA = await createDraftTaskViaApi(page, projectId, `E2E Hierarchy A ${stamp}`);
    const taskB = await createDraftTaskViaApi(page, projectId, `E2E Hierarchy B ${stamp}`);
    const taskC = await createDraftTaskViaApi(page, projectId, `E2E Hierarchy C ${stamp}`);
    createdTaskIds.push(taskA.id, taskB.id, taskC.id);

    const seeded = seedThreeNodeHierarchy(taskA.id, taskB.id, taskC.id);
    if (!seeded) {
      test.skip(true, 'Docker backend unavailable for 3-node hierarchy seed');
    }

    const { status, body } = await moveSubtaskViaApi(
      page,
      taskC.slug,
      taskB.slug,
      taskA.id,
    );

    expect(status).toBe(422);
    expect(body?.code).toBe('task_hierarchy_cycle');
    expect(String(body?.detail ?? '')).toContain('circular task hierarchy');
  });

  test('subtask detail shows Parent picker', async ({ page }) => {
    await page.goto('/');
    await waitForTasksPageReady(page);

    const stamp = Date.now();
    const parent = await createDraftTaskViaApi(page, projectId, `E2E Parent visible ${stamp}`);
    const child = await createDraftTaskViaApi(page, projectId, `E2E Child visible ${stamp}`);
    createdTaskIds.push(parent.id, child.id);

    await linkSubtaskViaApi(page, parent.slug, child.id);
    await openTaskDetailPage(page, child.slug);

    await expect(page.getByTestId('task-parent-picker')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('combobox', { name: 'Parent task' })).toBeVisible();
    await expect(page.getByText('Parent', { exact: true })).toBeVisible();
  });

  test('parent picker shows inline error when move returns hierarchy cycle 422', async ({ page }) => {
    await page.goto('/');
    await waitForTasksPageReady(page);

    const stamp = Date.now();
    const parentA = await createDraftTaskViaApi(page, projectId, `E2E Cycle parent A ${stamp}`);
    const childB = await createDraftTaskViaApi(page, projectId, `E2E Cycle child B ${stamp}`);
    const parentC = await createDraftTaskViaApi(page, projectId, `E2E Cycle parent C ${stamp}`);
    createdTaskIds.push(parentA.id, childB.id, parentC.id);

    await linkSubtaskViaApi(page, parentA.slug, childB.id);
    await openTaskDetailPage(page, childB.slug);
    await expect(page.getByTestId('task-parent-picker')).toBeVisible({ timeout: 10_000 });

    await page.route('**/api/tasks/**/subtasks/**/move/**', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: CYCLE_MESSAGE,
          code: 'task_hierarchy_cycle',
        }),
      });
    });

    await page.getByRole('combobox', { name: 'Parent task' }).click();
    await page.getByTestId('task-parent-picker-search').fill(parentC.summary.slice(0, 12));
    await expect(page.getByRole('option', { name: parentC.summary })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('option', { name: parentC.summary }).click();

    await expect(page.getByTestId('task-parent-picker-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('task-parent-picker-error')).toContainText('circular task hierarchy');
  });

  test('parent picker can reassign subtask to a new valid parent', async ({ page }) => {
    await page.goto('/');
    await waitForTasksPageReady(page);

    const stamp = Date.now();
    const parentA = await createDraftTaskViaApi(page, projectId, `E2E Move parent A ${stamp}`);
    const childB = await createDraftTaskViaApi(page, projectId, `E2E Move child B ${stamp}`);
    const parentC = await createDraftTaskViaApi(page, projectId, `E2E Move parent C ${stamp}`);
    createdTaskIds.push(parentA.id, childB.id, parentC.id);

    await linkSubtaskViaApi(page, parentA.slug, childB.id);
    await openTaskDetailPage(page, childB.slug);
    await expect(page.getByTestId('task-parent-picker')).toBeVisible({ timeout: 10_000 });

    const moveResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('/subtasks/') &&
        resp.url().includes('/move/') &&
        resp.request().method() === 'POST',
    );

    await page.getByRole('combobox', { name: 'Parent task' }).click();
    await page.getByTestId('task-parent-picker-search').fill(parentC.summary.slice(0, 12));
    await expect(page.getByRole('option', { name: parentC.summary })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('option', { name: parentC.summary }).click();

    const response = await moveResponse;
    expect(response.ok()).toBeTruthy();

    await expect(page.getByTestId('task-parent-picker-error')).not.toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole('combobox', { name: 'Parent task' })).toContainText(parentC.summary);
  });
});
