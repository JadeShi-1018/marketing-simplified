import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import {
  createDraftTaskViaApi,
  deleteTaskById,
  ensureE2EPageReady,
  getActiveProjectIdFromStore,
  linkSubtaskViaApi,
  moveSubtaskViaApi,
  openSubtaskDetailWithPicker,
  searchAndSelectParentInPicker,
  waitForTasksPageReady,
} from './tasks-helpers';

const CYCLE_MESSAGE =
  'Cannot set this parent: it would create a circular task hierarchy.';

/** Override with E2E_BACKEND_CONTAINER when the dev backend service name differs. */
const BACKEND_CONTAINER = process.env.E2E_BACKEND_CONTAINER ?? 'backend-dev';

/**
 * Seed A→B→C via direct DB writes. Public API cannot build this chain: one-level nesting
 * blocks B→C after A→B (and the reverse order fails for the same reason).
 * 3-node move-cycle 422 is covered in backend/task/tests/test_hierarchy_cycle.py;
 * this E2E test asserts the same contract through the HTTP move endpoint.
 * Follow-up: management command or test fixture endpoint to remove docker exec (MED-235).
 */
function seedThreeNodeHierarchyViaDocker(aId: number, bId: number, cId: number): boolean {
  try {
    execSync(
      `docker exec ${BACKEND_CONTAINER} python manage.py shell -c "` +
        `from task.models import Task, TaskHierarchy;` +
        `TaskHierarchy.objects.get_or_create(parent_task_id=${aId}, child_task_id=${bId});` +
        `TaskHierarchy.objects.get_or_create(parent_task_id=${bId}, child_task_id=${cId});` +
        `"`,
      { stdio: 'pipe' },
    );
    return true;
  } catch {
    return false;
  }
}

test.describe('Task hierarchy parent picker (MED-235)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let projectId: number;
  const createdTaskIds: number[] = [];

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    const page = await context.newPage();
    projectId = await getActiveProjectIdFromStore(page);
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
    await page.goto('/overview', { waitUntil: 'domcontentloaded' });

    const stamp = Date.now();
    const taskA = await createDraftTaskViaApi(page, projectId, `E2E Hierarchy A ${stamp}`);
    const taskB = await createDraftTaskViaApi(page, projectId, `E2E Hierarchy B ${stamp}`);
    const taskC = await createDraftTaskViaApi(page, projectId, `E2E Hierarchy C ${stamp}`);
    createdTaskIds.push(taskA.id, taskB.id, taskC.id);

    const seeded = seedThreeNodeHierarchyViaDocker(taskA.id, taskB.id, taskC.id);
    if (!seeded) {
      test.skip(
        true,
        `Docker backend (${BACKEND_CONTAINER}) unavailable — 3-node cycle seed requires DB bypass; see backend test_hierarchy_cycle.py`,
      );
    }

    const { status, body } = await moveSubtaskViaApi(page, taskC, taskB, taskA.id);

    expect(status).toBe(422);
    expect(body?.code).toBe('task_hierarchy_cycle');
    expect(String(body?.detail ?? '')).toContain('circular task hierarchy');
  });

  test('subtask detail shows Parent picker', async ({ page }) => {
    await ensureE2EPageReady(page);

    const stamp = Date.now();
    const parent = await createDraftTaskViaApi(page, projectId, `E2E Parent visible ${stamp}`);
    const child = await createDraftTaskViaApi(page, projectId, `E2E Child visible ${stamp}`);
    createdTaskIds.push(parent.id, child.id);

    await linkSubtaskViaApi(page, parent, child.id);
    await openSubtaskDetailWithPicker(page, child.slug);

    await expect(page.getByText('Parent', { exact: true })).toBeVisible();
  });

  test('parent picker shows inline error when move returns hierarchy cycle 422', async ({ page }) => {
    await ensureE2EPageReady(page);

    const stamp = Date.now();
    const parentA = await createDraftTaskViaApi(page, projectId, `E2E Cycle parent A ${stamp}`);
    const childB = await createDraftTaskViaApi(page, projectId, `E2E Cycle child B ${stamp}`);
    const parentC = await createDraftTaskViaApi(page, projectId, `E2E Cycle parent C ${stamp}`);
    createdTaskIds.push(parentA.id, childB.id, parentC.id);

    await linkSubtaskViaApi(page, parentA, childB.id);
    await openSubtaskDetailWithPicker(page, childB.slug);

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

    const moveResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('/subtasks/') &&
        resp.url().includes('/move/') &&
        resp.request().method() === 'POST',
    );

    await searchAndSelectParentInPicker(
      page,
      parentC.summary.slice(0, 12),
      parentC.summary,
    );

    const response = await moveResponse;
    expect(response.status()).toBe(422);

    await expect(page.getByTestId('task-parent-picker-error')).toBeVisible();
    await expect(page.getByTestId('task-parent-picker-error')).toContainText('circular task hierarchy');
  });

  test('parent picker can reassign subtask to a new valid parent', async ({ page }) => {
    await ensureE2EPageReady(page);

    const stamp = Date.now();
    const parentA = await createDraftTaskViaApi(page, projectId, `E2E Move parent A ${stamp}`);
    const childB = await createDraftTaskViaApi(page, projectId, `E2E Move child B ${stamp}`);
    const parentC = await createDraftTaskViaApi(page, projectId, `E2E Move parent C ${stamp}`);
    createdTaskIds.push(parentA.id, childB.id, parentC.id);

    await linkSubtaskViaApi(page, parentA, childB.id);
    await openSubtaskDetailWithPicker(page, childB.slug);

    const moveResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('/subtasks/') &&
        resp.url().includes('/move/') &&
        resp.request().method() === 'POST',
    );

    await searchAndSelectParentInPicker(
      page,
      parentC.summary.slice(0, 12),
      parentC.summary,
    );

    const response = await moveResponse;
    expect(response.ok()).toBeTruthy();

    await expect(page.getByTestId('task-parent-picker-error')).not.toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Parent task' })).toContainText(parentC.summary);
  });
});
