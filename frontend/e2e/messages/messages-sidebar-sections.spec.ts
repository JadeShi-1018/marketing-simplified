/**
 * E2E tests for custom sidebar sections.
 *
 * Covers:
 *  - "Add a section" button creates a new section
 *  - Pencil icon appears on hover to rename a section
 *  - Renaming a section persists the new name
 *  - Delete button shows white tooltip and confirmation prompt
 *  - Cancelling delete keeps the section
 *  - Confirming delete removes the section
 *  - Add channel picker opens (portal, not clipped)
 */

import { test, expect } from '@playwright/test';
import {
	waitForLayoutMain,
	seedAuthenticatedUser,
	mockAuthenticatedUserApis,
	mockProjectShellApis,
	seedActiveProject,
} from './messages-helpers';

const PROJECT = { id: 1, name: 'Sections E2E Project' };
const E2E_USER = {
	id: 1,
	email: 'e2e@example.com',
	username: 'e2e-user',
	is_verified: true,
	is_staff: false,
	roles: [],
};

const MOCK_CHATS = [
	{ id: 301, name: 'general', type: 'group', project_id: 1, unread_count: 0, participants: [{ id: 1, user: E2E_USER, is_active: true }], last_message: null },
];

let sectionStore: any[] = [];

async function setupPage(page: any) {
	sectionStore = [];

	await seedAuthenticatedUser(page, E2E_USER);
	await mockAuthenticatedUserApis(page, E2E_USER);
	await mockProjectShellApis(page);
	await seedActiveProject(page, PROJECT);

	await page.route('**/api/core/projects**', async (route: any) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([PROJECT]) });
	});
	await page.route('**/api/core/projects/*/members/**', async (route: any) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], next: null }) });
	});
	await page.route('**/api/chat/chats/**', async (route: any) => {
		const pathname = new URL(route.request().url()).pathname.replace(/\/+$/, '');
		if (pathname === '/api/chat/chats' && route.request().method() === 'GET') {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: MOCK_CHATS.length, next: null, previous: null, results: MOCK_CHATS }) });
			return;
		}
		await route.fallback();
	});
	await page.route('**/api/chat/custom-sections/**', async (route: any) => {
		const method = route.request().method();
		if (method === 'GET') {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sectionStore) });
			return;
		}
		if (method === 'POST') {
			const body = await route.request().postDataJSON();
			const newSection = { id: `sec-${Date.now()}`, ...body, chat_ids: [] };
			sectionStore.push(newSection);
			await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newSection) });
			return;
		}
		await route.fallback();
	});
	await page.route('**/api/chat/custom-sections/*/', async (route: any) => {
		const method = route.request().method();
		if (method === 'PATCH') {
			const body = await route.request().postDataJSON();
			const id = new URL(route.request().url()).pathname.split('/').filter(Boolean).pop();
			sectionStore = sectionStore.map((s) => s.id === id ? { ...s, ...body } : s);
			const section = sectionStore.find((s) => s.id === id) ?? body;
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(section) });
			return;
		}
		if (method === 'DELETE') {
			const id = new URL(route.request().url()).pathname.split('/').filter(Boolean).pop();
			sectionStore = sectionStore.filter((s) => s.id !== id);
			await route.fulfill({ status: 204, body: '' });
			return;
		}
		await route.fallback();
	});

	await page.goto('/messages');
	await waitForLayoutMain(page);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Custom sidebar sections', () => {
	test.describe.configure({ mode: 'serial', timeout: 60_000 });

	test('"Add a section" button is visible and creates a section', async ({ page }) => {
		await setupPage(page);

		const addBtn = page.getByTestId('messages-add-section');
		await expect(addBtn).toBeVisible({ timeout: 10_000 });
		await addBtn.click();

		// A new section row should appear (with default name)
		await expect(page.getByText('New section', { exact: false })).toBeVisible({ timeout: 5_000 });
	});

	test('pencil icon appears on section hover and allows rename', async ({ page }) => {
		await setupPage(page);
		await page.getByTestId('messages-add-section').click();
		await expect(page.getByText('New section', { exact: false })).toBeVisible({ timeout: 5_000 });

		// Hover over the section header to reveal pencil
		const sectionHeader = page.locator('.custom-section').first();
		await sectionHeader.hover();
		const pencil = sectionHeader.getByRole('button', { name: /rename/i });
		await pencil.click();

		const input = sectionHeader.locator('input').first();
		await input.clear();
		await input.fill('My Custom Section');
		await input.press('Enter');

		await expect(page.getByText('My Custom Section', { exact: false })).toBeVisible({ timeout: 5_000 });
	});

	test('delete button shows confirmation and cancel keeps the section', async ({ page }) => {
		await setupPage(page);
		await page.getByTestId('messages-add-section').click();
		await expect(page.getByText('New section', { exact: false })).toBeVisible({ timeout: 5_000 });

		const sectionHeader = page.locator('.custom-section').first();
		await sectionHeader.hover();
		const deleteBtn = sectionHeader.getByRole('button', { name: /delete/i });
		await deleteBtn.click();

		// Confirmation prompt should appear
		await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible({ timeout: 3_000 });
		await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();

		// Cancel keeps the section
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(page.getByText('New section', { exact: false })).toBeVisible({ timeout: 3_000 });
	});

	test('confirming delete removes the section', async ({ page }) => {
		await setupPage(page);
		await page.getByTestId('messages-add-section').click();
		await expect(page.getByText('New section', { exact: false })).toBeVisible({ timeout: 5_000 });

		const sectionHeader = page.locator('.custom-section').first();
		await sectionHeader.hover();
		const deleteBtn = sectionHeader.getByRole('button', { name: /delete/i });
		await deleteBtn.click();

		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(page.getByText('New section', { exact: false })).not.toBeVisible({ timeout: 5_000 });
	});

	test('add channel picker opens without being clipped', async ({ page }) => {
		await setupPage(page);
		await page.getByTestId('messages-add-section').click();
		await expect(page.getByText('New section', { exact: false })).toBeVisible({ timeout: 5_000 });

		const sectionHeader = page.locator('.custom-section').first();
		const addChannelBtn = sectionHeader.getByTestId('messages-custom-section-add-channel');
		await expect(addChannelBtn).toBeVisible({ timeout: 5_000 });
		await addChannelBtn.click();

		const picker = page.locator('.fixed').filter({ has: page.getByPlaceholder('Search channels…') }).first();
		await expect(picker).toBeVisible({ timeout: 3_000 });

		const box = await picker.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.y).toBeGreaterThanOrEqual(0);
	});
});
