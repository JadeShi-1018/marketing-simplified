import { type Page, expect } from '@playwright/test';

export type WorkspaceTab = 'Summary' | 'Tasks' | 'Board';
export type TasksViewMode = 'list' | 'timeline';

const tabTestId: Record<WorkspaceTab, string> = {
  Summary: 'tab-summary',
  Tasks: 'tab-tasks',
  Board: 'tab-board',
};

/**
 * Click one of the top-level workspace tabs (Summary / Tasks / Board).
 */
export async function switchTab(page: Page, tab: WorkspaceTab): Promise<void> {
  const btn = page.getByTestId(tabTestId[tab]);
  await btn.click();
  await page.waitForTimeout(500);
}

/**
 * Toggle between List View and Timeline View inside the Tasks tab.
 */
export async function switchView(page: Page, mode: TasksViewMode): Promise<void> {
  const testId = mode === 'list' ? 'view-button-list' : 'view-button-timeline';
  await page.getByTestId(testId).click();
  await page.waitForTimeout(500);
}

/**
 * Click the first task row in the task list table and return the visible
 * summary text so the caller can assert on the detail page.
 */
export async function openFirstTask(page: Page): Promise<string> {
  const taskList = page.getByTestId('task-list');
  await expect(taskList).toBeVisible({ timeout: 10_000 });

  const firstRow = page.getByTestId('task-row').first();
  await expect(firstRow).toBeVisible({ timeout: 5_000 });

  // Summary is in the second data column (after priority-dot icon column).
  // Click the summary cell specifically — other cells stop propagation.
  const summaryCell = firstRow.locator('td').nth(1);
  const summary = ((await summaryCell.innerText()) || '').split('\n')[0].trim();

  await summaryCell.click();
  return summary;
}

/**
 * In Tasks (list) view: click the first task row — this navigates directly
 * to the task detail page (no separate "Open" button required).
 */
export async function openFirstTaskFromListAndNavigate(page: Page): Promise<void> {
  await openFirstTask(page);
}

/**
 * In Board view: click the first task card to navigate directly to the
 * task detail page.
 */
export async function openFirstTaskFromBoardAndNavigate(page: Page): Promise<void> {
  const board = page.getByTestId('board-columns');
  await expect(board).toBeVisible({ timeout: 10_000 });
  const firstCard = board.getByRole('button').first();
  await expect(firstCard).toBeVisible({ timeout: 5_000 });
  await firstCard.click();
}
