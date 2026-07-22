import { test, expect } from '@playwright/test';

test.describe('Admin permissions matrix', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('project-storage', JSON.stringify({
        state: {
          activeProject: { id: 101, name: 'Matrix Project' },
          activeProjectIds: [101],
          inactiveProjectIds: [],
          completedProjectIds: [],
        },
        version: 0,
      }));
    });

    await page.route('**/api/access_control/projects/101/permission-matrix/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projectId: '101',
          projectName: 'Matrix Project',
          organizationId: '7',
          roles: [
            { id: '1', name: 'Admin', description: 'Role: Admin', rank: 1, organizationId: '7', isReadOnly: false },
            { id: '2', name: 'Viewer', description: 'Role: Viewer', rank: 5, organizationId: '7', isReadOnly: false },
          ],
          permissions: [
            { id: 'campaign_view', name: 'View Campaign', description: 'View access', module: 'Campaign Execution', action: 'View' },
            { id: 'campaign_edit', name: 'Edit Campaign', description: 'Edit access', module: 'Campaign Execution', action: 'Edit' },
          ],
          matrix: {
            '1': { campaign_view: true, campaign_edit: true },
            '2': { campaign_view: true, campaign_edit: false },
          },
          warnings: [
            {
              code: 'PROJECT_MEMBER_ROLE_UNMAPPED',
              message: 'Project member role "contractor" does not match an access-control role.',
            },
          ],
        }),
      });
    });
  });

  test('shows read-only effective permissions and warnings', async ({ page }) => {
    await page.goto('/admin/permissions');

    const matrix = page.getByTestId('project-permission-matrix');
    await expect(matrix).toBeVisible({ timeout: 20_000 });
    await expect(matrix.getByRole('heading', { name: 'Effective Permissions Matrix' })).toBeVisible();
    await expect(matrix.getByText('Project: Matrix Project')).toBeVisible();
    await expect(matrix.getByText('Admin')).toBeVisible();
    await expect(matrix.getByText('Viewer')).toBeVisible();
    await expect(matrix.getByText('Campaign Execution')).toBeVisible();

    await expect(page.getByTestId('permission-matrix-warnings')).toContainText('PROJECT_MEMBER_ROLE_UNMAPPED');
    await expect(page.getByTestId('permission-matrix-warnings')).toContainText('contractor');
  });
});
