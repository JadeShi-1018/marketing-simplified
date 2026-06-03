import { expect, type Locator, type Page } from "@playwright/test";
import { canvasLocator } from "./email-draft-helpers";

/** Convert `#RRGGBB` to `rgb(r, g, b)` for Playwright `toHaveCSS('color', ...)`. */
export function hexToRgbString(hex: string): string {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length !== 6) {
    return hex;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

export async function openInspectorTab(
  page: Page,
  tabName: "Content" | "Styles",
): Promise<void> {
  const tab = page.getByRole("button", { name: tabName });
  await tab.click();
  await expect(tab).toHaveClass(/border-b-2/);
}

export async function expectCanvasHeadingTypography(
  page: Page,
  headingText: string,
  expected: { fontSize: string; colorHex: string; fontWeight?: string },
): Promise<void> {
  const canvas = canvasLocator(page);
  const roleHeading = canvas.getByRole("heading", { name: headingText }).first();
  const heading =
    (await roleHeading.count()) > 0
      ? roleHeading
      : canvas.getByText(headingText, { exact: false }).first();

  await expect(heading).toBeVisible();
  await expect(heading).toHaveCSS("font-size", expected.fontSize);
  await expect(heading).toHaveCSS("color", hexToRgbString(expected.colorHex));
  if (expected.fontWeight) {
    const normalizedExpectedWeight = expected.fontWeight.toLowerCase();
    let allowedWeights: RegExp;
    if (normalizedExpectedWeight === "bold") {
      allowedWeights = /^(bold|700)$/i;
    } else if (normalizedExpectedWeight === "normal") {
      allowedWeights = /^(normal|400)$/i;
    } else {
      allowedWeights = new RegExp(`^${expected.fontWeight}$`, "i");
    }
    await expect(heading).toHaveCSS("font-weight", allowedWeights);
  }
}

export async function expectCanvasButtonTypography(
  page: Page,
  label: string,
  expected: { fontSize: string; colorHex: string; backgroundColorHex: string },
): Promise<void> {
  const button = canvasLocator(page).getByRole("button", { name: label }).first();
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS("font-size", expected.fontSize);
  await expect(button).toHaveCSS("color", hexToRgbString(expected.colorHex));
  await expect(button).toHaveCSS("background-color", hexToRgbString(expected.backgroundColorHex));
}

export async function clickKlaviyoCanvasBlockByBadge(
  page: Page,
  badgeText: string,
): Promise<void> {
  const escaped = badgeText.replace(
    /[.*+?^${}()|[\]\\]/g,
    String.raw`\$&`,
  );
  const containerMatch = canvasLocator(page)
    .locator(".relative.border")
    .filter({ hasText: new RegExp(String.raw`\b${escaped}\b`, "i") })
    .first();

  if ((await containerMatch.count()) > 0) {
    await expect(containerMatch).toBeVisible({ timeout: 30_000 });
    await containerMatch.click();
    return;
  }

  // Fallback for DOM variants where block wrapper classes differ:
  // find badge label text inside the canvas block (e.g. "Code", "Social"),
  // then click its parent block container (badge chip itself is pointer-events-none).
  const badge = canvasLocator(page).getByText(new RegExp(String.raw`^${escaped}$`, "i")).first();
  await expect(badge).toBeVisible({ timeout: 30_000 });
  const blockFromBadge = badge.locator(
    "xpath=ancestor::div[.//button[contains(@aria-label,'Remove block')]][1]",
  );
  await expect(blockFromBadge).toBeVisible({ timeout: 30_000 });
  await blockFromBadge.click();
}

export function klaviyoTextInspectorPanel(page: Page): Locator {
  return page.locator("div.flex-1.flex.flex-col.bg-white").filter({
    has: page.getByText("Font Family", { exact: true }),
  });
}

export function mailchimpBlockInspectorPanel(page: Page): Locator {
  return page.locator("div.flex-1.min-h-0.overflow-y-auto").filter({
    has: page.getByRole("button", { name: "Content" }),
  });
}

export async function clickMailchimpCanvasBlockByBadge(
  page: Page,
  badgeText: string,
): Promise<void> {
  const escaped = badgeText.replace(
    /[.*+?^${}()|[\]\\]/g,
    String.raw`\$&`,
  );
  const containerMatch = canvasLocator(page)
    .locator(".relative.border")
    .filter({ hasText: new RegExp(String.raw`\b${escaped}\b`, "i") })
    .first();

  if ((await containerMatch.count()) > 0) {
    await expect(containerMatch).toBeVisible({ timeout: 30_000 });
    await containerMatch.click();
    return;
  }

  const layoutContainer = canvasLocator(page).locator(".layout-container").first();
  if (badgeText.toLowerCase() === "layout" && (await layoutContainer.count()) > 0) {
    await expect(layoutContainer).toBeVisible({ timeout: 30_000 });
    await layoutContainer.click();
    return;
  }

  const badge = canvasLocator(page)
    .getByText(new RegExp(String.raw`^${escaped}$`, "i"))
    .first();
  await expect(badge).toBeVisible({ timeout: 30_000 });
  const blockFromBadge = badge.locator(
    "xpath=ancestor::div[.//button[contains(@aria-label,'Remove block')]][1]",
  );
  await expect(blockFromBadge).toBeVisible({ timeout: 30_000 });
  await blockFromBadge.click();
}

export async function expectMailchimpLayoutInspectorStructure(
  page: Page,
): Promise<void> {
  await expect(page.getByText("Number of columns", { exact: true })).toBeVisible();
  for (const columnCount of ["1", "2", "3", "4"]) {
    await expect(page.getByRole("button", { name: columnCount, exact: true })).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "2", exact: true }),
  ).toHaveClass(/bg-white/);
  await expect(page.getByText("Desktop column ratio", { exact: true })).toBeVisible();
  await expect(page.getByText("Mobile content orientation", { exact: true })).toBeVisible();
  for (const orientation of ["Stack left", "Stack right", "Stack center"] as const) {
    await expect(page.getByRole("button", { name: orientation, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Stack left", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

export async function expectMailchimpLayoutInspectorStyle(
  page: Page,
): Promise<void> {
  await expect(page.getByText("Layout Background", { exact: true })).toBeVisible();
  await expect(page.getByText("Border", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Padding", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Margin", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Link Desktop and Mobile Styles")).toBeVisible();
}
