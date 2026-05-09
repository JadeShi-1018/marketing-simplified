import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Wait for any blocking overlay (Guided Onboarding, "Preparing your workspace")
 * to dismiss before interacting with the tasks page.
 * If "Failed to load projects" is shown, clicks "Retry check" and waits for success.
 */
export async function waitForTasksPageReady(page: Page) {
  const retryBtn = page.getByRole('button', { name: 'Retry check' });
  if (await retryBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await retryBtn.click();
  }

  await expect(page.getByText('Guided Onboarding')).not.toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Preparing your workspace')).not.toBeVisible({
    timeout: 5_000,
  });
}

/**
 * Navigate to /tasks, select a project by name, and return its ID.
 * Run once before all tests (in beforeAll) to grab the project ID.
 * Uses E2E_PROJECT_NAME env var (default "Q1 E2E Task").
 */
export async function navigateToTasksAndSelectProject(page: Page): Promise<number> {
  await page.goto('/tasks');
  await expect(page.getByText('Preparing your workspace')).not.toBeVisible({ timeout: 30_000 });
  await waitForTasksPageReady(page);

  // Get the active project from the Zustand persisted store in localStorage.
  const projectId: number | null = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('project-storage');
      if (!raw) return null;
      return (JSON.parse(raw) as any)?.state?.activeProject?.id ?? null;
    } catch {
      return null;
    }
  });

  if (!projectId) throw new Error('No active project found in store — ensure the test user has at least one project');
  return projectId;
}

/**
 * Ensure we are on the tasks page for the given project.
 * Run before each test (in beforeEach) to navigate to /tasks?project_id=X&view=timeline.
 */
export async function ensureOnTasksPage(page: Page, projectId: number): Promise<void> {
  await page.goto(`/tasks?project_id=${projectId}&view=timeline`);
  await waitForTasksPageReady(page);
}

/**
 * Full flow: navigate, select project, wait for ready.
 * Use when you need the full flow in each test (e.g. task-create.spec).
 */
export async function goToTasks(page: Page): Promise<void> {
  await navigateToTasksAndSelectProject(page);
}

/** Alias for goToTasks (same behavior). */
export const goToTasksWithProject = goToTasks;

/**
 * Click the Create button, capture the task ID from the POST response,
 * and wait for the panel to close.
 * @deprecated Use submitNewTaskAndGetId for the /tasks/new page flow.
 */
export async function submitCreateAndGetId(
  page: Page,
  panel: Locator,
): Promise<number | null> {
  const responsePromise = page.waitForResponse((resp) => {
    const path = new URL(resp.url()).pathname;
    return (
      (path === '/api/tasks/' || path === '/api/tasks') &&
      resp.request().method() === 'POST'
    );
  });

  await panel.getByRole('button', { name: 'Create', exact: true }).click();

  const response = await responsePromise;
  let taskId: number | null = null;
  if (response.ok()) {
    const body = await response.json();
    taskId = body.id ?? null;
  }

  await expect(panel).not.toBeVisible({ timeout: 10_000 });
  return taskId;
}

/**
 * Navigate to the /tasks/new page for the given project.
 */
export async function navigateToNewTaskPage(page: Page, projectId: number): Promise<void> {
  await page.goto(`/tasks/new?project_id=${projectId}`);
  await expect(page.getByPlaceholder('Summary of this task')).toBeVisible({ timeout: 15_000 });
}

/**
 * On the /tasks/new page: intercept the POST, click "Create task", return the new task ID.
 */
export async function submitNewTaskAndGetId(page: Page): Promise<number | null> {
  const responsePromise = page.waitForResponse((resp) => {
    const path = new URL(resp.url()).pathname;
    return (path === '/api/tasks/' || path === '/api/tasks') && resp.request().method() === 'POST';
  });

  await page.getByRole('button', { name: 'Create task', exact: true }).click();

  const response = await responsePromise;
  if (!response.ok()) return null;
  const body = await response.json();
  return body.id ?? null;
}

/**
 * Delete a task by ID via the REST API using the auth token from localStorage.
 */
export async function deleteTaskById(page: Page, taskId: number) {
  const token: string | null = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('auth-storage');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.state?.token ?? null;
    } catch {
      return null;
    }
  });

  if (!token) return;

  const origin = new URL(page.url()).origin;
  await page.request.delete(`${origin}/api/tasks/${taskId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
