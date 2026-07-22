import { test, expect } from '@playwright/test';

const user = {
  id: 99,
  username: 'privacy.user',
  email: 'privacy@example.com',
  first_name: 'Privacy',
  last_name: 'User',
  roles: ['Media Buyer'],
  organization: { id: 7, name: 'Outlook' },
};

test.describe('Profile privacy export', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((mockUser) => {
      localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          token: 'test-token',
          refreshToken: null,
          organizationAccessToken: null,
          user: mockUser,
          isAuthenticated: true,
        },
        version: 0,
      }));
      localStorage.setItem('project-storage', JSON.stringify({
        state: {
          activeProject: { id: 101, name: 'Matrix Project', organization: { name: 'Outlook' } },
          activeProjectIds: [101],
          inactiveProjectIds: [],
          completedProjectIds: [],
        },
        version: 0,
      }));
    }, user);

    await page.route('**/auth/me/', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    });
    await page.route('**/api/teams/my-teams/', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ team_ids: [] }) });
    });
  });

  test('requests personal data export and downloads the ready ZIP', async ({ page }) => {
    let listCalls = 0;
    let requestedFormat = 'json';
    await page.route('**/api/core/privacy/export-requests/', async (route) => {
      if (route.request().method() === 'POST') {
        requestedFormat = route.request().postDataJSON().export_format;
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'export-1',
            status: 'processing',
            export_format: requestedFormat,
            created_at: '2026-07-09T08:00:00Z',
            updated_at: '2026-07-09T08:00:00Z',
            completed_at: null,
            expires_at: null,
            download_url: null,
            failure_reason: '',
            metadata: {},
          }),
        });
        return;
      }

      listCalls += 1;
      const ready = listCalls > 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ready ? [{
          id: 'export-1',
          status: 'ready',
          export_format: requestedFormat,
          created_at: '2026-07-09T08:00:00Z',
          updated_at: '2026-07-09T08:01:00Z',
          completed_at: '2026-07-09T08:01:00Z',
          expires_at: '2026-07-10T08:01:00Z',
          download_url: '/api/core/privacy/export-requests/export-1/download/?token=signed-token',
          failure_reason: '',
          metadata: { section_count: 5, included_sections: ['core.customuser', 'task.task'] },
        }] : []),
      });
    });

    await page.route('**/api/core/privacy/export-requests/export-1/download/**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="personal-data-export.zip"',
        },
        body: 'fake zip',
      });
    });

    await page.goto('/profile');
    await page.getByRole('button', { name: 'Privacy' }).click();
    await expect(page.getByTestId('privacy-export-panel')).toBeVisible();

    await page.getByRole('button', { name: 'csv' }).click();
    await expect(page.getByText('Processing')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Privacy' }).click();
    await expect(page.getByText('Ready')).toBeVisible();
    await expect(page.getByText('CSV')).toBeVisible();
    await expect(page.getByText('5')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download ZIP' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('personal-data-export.zip');
  });
});
