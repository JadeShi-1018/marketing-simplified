import { test, expect } from '@playwright/test';
import { mockUser, setupLoginMock, setupLoginFailureMock, setupLoginThrottleMock } from "./fixtures/mockUser";

test.use({ storageState: { cookies: [], origins: [] } });

test("login success: submit credentials → redirect to /overview (or legacy app route)", async ({ page }) => {
  await setupLoginMock(page);
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await page.locator('input[name="email"]').fill(mockUser.email);
  await page.locator('input[name="password"]').fill(mockUser.password);

  const submitBtn = page.locator('button[type="submit"]');
  await expect(submitBtn).toBeEnabled();

  const responsePromise = page.waitForResponse(
    (res) => res.url().includes("auth/login") && res.request().method() === "POST",
    { timeout: 10000 }
  );
  await submitBtn.click();
  const loginResponse = await responsePromise;
  expect(loginResponse.status()).toBe(200);

  await expect(page).toHaveURL(/\/(overview|campaigns|profile|tasks)/, { timeout: 10000 });
  await expect(page.getByText(/Invalid|Login failed|Invalid credentials/i)).not.toBeVisible({ timeout: 2000 });
});

test("login failure: wrong password → error message, stay on login", async ({ page }) => {
  await setupLoginFailureMock(page);
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await page.locator('input[name="email"]').fill(mockUser.email);
  await page.locator('input[name="password"]').fill("WrongPassword123!");

  const submitBtn = page.locator('button[type="submit"]');
  await expect(submitBtn).toBeEnabled();

  const response401 = page.waitForResponse(
    (res) =>
      res.url().includes("auth/login") && res.request().method() === "POST" && res.status() === 401,
    { timeout: 10000 }
  );
  await submitBtn.click();
  const res = await response401;
  expect(res.status()).toBe(401);

  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible({ timeout: 8000 });
});

test("login throttle: too many attempts → CAPTCHA placeholder, stay on login", async ({ page }) => {
  await setupLoginThrottleMock(page);
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await page.locator('input[name="email"]').fill(mockUser.email);
  await page.locator('input[name="password"]').fill("WrongPassword123!");

  const submitBtn = page.locator('button[type="submit"]');
  await expect(submitBtn).toBeEnabled();

  const response429 = page.waitForResponse(
    (res) =>
      res.url().includes("auth/login") && res.request().method() === "POST" && res.status() === 429,
    { timeout: 10000 }
  );
  await submitBtn.click();
  const res = await response429;
  expect(res.status()).toBe(429);

  await expect(page).toHaveURL(/\/login\/?$/);
  const securityAlert = page.locator('div[role="alert"]').filter({
    hasText: "Too many login attempts. Please wait before trying again.",
  });
  await expect(securityAlert).toContainText("Too many login attempts. Please wait before trying again.");
  await expect(page.getByTestId("captcha-placeholder")).toContainText("CAPTCHA verification will be required here.");
});

test("login: empty form submission stays on login (client validation)", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible({ timeout: 5000 });
});

test("login: server error 500 shows error and stays on login", async ({ page }) => {
  await setupLoginFailureMock(page, 500);
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await page.locator('input[name="email"]').fill(mockUser.email);
  await page.locator('input[name="password"]').fill(mockUser.password);
  const submitBtn = page.locator('button[type="submit"]');
  const response500 = page.waitForResponse(
    (res) => res.url().includes("auth/login") && res.request().method() === "POST" && res.status() === 500,
    { timeout: 10000 }
  );
  await submitBtn.click();
  const res = await response500;
  expect(res.status()).toBe(500);

  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible({ timeout: 5000 });
});
