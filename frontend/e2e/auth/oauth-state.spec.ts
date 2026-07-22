import { test, expect } from '@playwright/test';

test.describe('OAuth state callback handling', () => {
  test('passes Slack OAuth state through opaquely on a happy callback', async ({ page }) => {
    let postedState = '';
    await page.route('**/api/slack/oauth/callback/', async (route) => {
      const body = route.request().postDataJSON();
      postedState = body.state;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, team_name: 'Workspace', team_id: 'T123' }),
      });
    });

    const opaqueState = 'opaque.signed.state-value';
    await page.goto(`/slack/callback?code=valid-code&state=${encodeURIComponent(opaqueState)}`);

    await expect(page.getByText('Connection Successful!')).toBeVisible();
    expect(postedState).toBe(opaqueState);
  });

  test('shows backend invalid-state errors for tampered Slack state', async ({ page }) => {
    await page.route('**/api/slack/oauth/callback/', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid Slack OAuth state.' }),
      });
    });

    await page.goto('/slack/callback?code=valid-code&state=tampered-state');

    await expect(page.getByText('Connection Failed')).toBeVisible();
    await expect(page.getByText('Invalid Slack OAuth state.')).toBeVisible();
  });
});
