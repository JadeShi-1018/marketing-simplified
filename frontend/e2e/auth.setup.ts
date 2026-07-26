import path from 'path';
import fs from 'fs';
import { test as setup, expect } from '@playwright/test';

const AUTH_DIR = path.join(__dirname, '.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'user.json');
const POST_LOGIN_ROUTE_PATTERN = /^\/(?!login)(.*)/i;

const TEST_EMAIL = process.env.DEV_USER_EMAIL || 'devuser@example.com';
const TEST_PASSWORD = process.env.DEV_USER_PASSWORD || 'password123!';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');

  await page.getByPlaceholder('Enter your email').fill(TEST_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(TEST_PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();

  // Accept either protected landing route used after sign-in.
  await page.waitForURL(
    (url) => POST_LOGIN_ROUTE_PATTERN.test(url.pathname) && !/\/login(\?|$)/i.test(url.pathname),
    { timeout: 15_000 },
  );

  await expect(page.getByText('Preparing your workspace')).not.toBeVisible({ timeout: 30_000 });

  const currentUrl = new URL(page.url());
  if (currentUrl.pathname.includes('/login')) {
    throw new Error(
      `Authentication setup expected a protected landing route after sign-in, but reached ${page.url()}.`,
    );
  }

  // Login persistence and project discovery complete on separate async paths.
  // Seed the persisted active project before capturing storageState so suites
  // that navigate directly to a project-scoped route cannot race hydration.
  const activeProjectReady = await page.evaluate(async () => {
    const rawAuth =
      window.localStorage.getItem('auth-storage-v1') ??
      window.localStorage.getItem('auth-storage');
    if (!rawAuth) return false;

    let token: string | undefined;
    let organizationToken: string | undefined;
    try {
      const authState = JSON.parse(rawAuth)?.state;
      token = authState?.token;
      organizationToken = authState?.organizationAccessToken;
    } catch {
      return false;
    }
    if (!token) return false;

    const response = await fetch('/api/core/projects/', {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(organizationToken ? { 'X-Organization-Token': organizationToken } : {}),
      },
    });
    if (!response.ok) return false;
    const body = await response.json();
    const projects = Array.isArray(body) ? body : body?.results ?? [];
    const activeProject =
      projects.find((project: { is_active?: boolean }) => project.is_active) ??
      projects[0] ??
      null;
    if (!activeProject?.id) return false;

    window.localStorage.setItem(
      'project-storage-v1',
      JSON.stringify({
        state: {
          activeProject,
          activeProjectIds: [activeProject.id],
          inactiveProjectIds: [],
          completedProjectIds: [],
        },
        version: 0,
      }),
    );
    return true;
  });
  expect(activeProjectReady, 'authentication setup could not resolve an active project').toBe(true);

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
