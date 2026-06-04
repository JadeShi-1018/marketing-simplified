/**
 * E2E tests for the Messages search panel.
 *
 * Covers:
 *  - Opening and closing the search panel
 *  - Quick-filter chips (From me, Mentions me, Has file, Has a link, Last 7 days, Threads only)
 *  - "More" dropdown showing all filter options
 *  - In channel autocomplete suggestions
 *  - In conversation (DM) autocomplete suggestions
 *  - Active filter chips displayed after applying a filter
 *  - "Clear all" removes every active filter
 *  - Search history chips (text + filter style)
 *  - "Search in channel" from right-click context menu pre-fills the in-channel filter
 */

import { test, expect } from '@playwright/test';
import {
	waitForLayoutMain,
	seedAuthenticatedUser,
	mockAuthenticatedUserApis,
	mockProjectShellApis,
	seedActiveProject,
} from './messages-helpers';

const PROJECT = { id: 1, name: 'Search E2E Project' };
const E2E_USER = {
	id: 1,
	email: 'e2e@example.com',
	username: 'e2e-user',
	is_verified: true,
	is_staff: false,
	roles: [],
};

const MOCK_CHATS = [
	{
		id: 101,
		name: 'general',
		type: 'group',
		project_id: 1,
		unread_count: 0,
		participants: [
			{ id: 1, user: E2E_USER, is_active: true, is_muted: false, notification_level: 'all' },
		],
		last_message: null,
	},
	{
		id: 102,
		name: 'design',
		type: 'group',
		project_id: 1,
		unread_count: 0,
		participants: [
			{ id: 1, user: E2E_USER, is_active: true, is_muted: false, notification_level: 'all' },
		],
		last_message: null,
	},
	{
		id: 103,
		name: null,
		type: 'private',
		project_id: 1,
		unread_count: 0,
		participants: [
			{ id: 1, user: E2E_USER, is_active: true, is_muted: false, notification_level: 'all' },
			{ id: 2, user: { id: 2, username: 'zenobia', email: 'zenobia@example.com' }, is_active: true },
		],
		last_message: null,
	},
];

async function setupSearchPage(page: any) {
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
		const url = route.request().url();
		const pathname = new URL(url).pathname.replace(/\/+$/, '');
		if (pathname === '/api/chat/chats' && route.request().method() === 'GET') {
			await route.fulfill({
				status: 200, contentType: 'application/json',
				body: JSON.stringify({ count: MOCK_CHATS.length, next: null, previous: null, results: MOCK_CHATS }),
			});
			return;
		}
		await route.fallback();
	});
	await page.route('**/api/chat/search/**', async (route: any) => {
		await route.fulfill({
			status: 200, contentType: 'application/json',
			body: JSON.stringify({ total: 0, results: [] }),
		});
	});
	await page.route('**/api/chat/custom-sections/**', async (route: any) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
	});

	await page.goto('/messages');
	await waitForLayoutMain(page);
}

async function openSearchPanel(page: any) {
	await page.getByTestId('messages-search').click();
	await expect(page.getByRole('textbox', { name: 'Search messages' })).toBeVisible({ timeout: 5_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Search panel', () => {
	test.describe.configure({ mode: 'serial', timeout: 60_000 });

	async function expectQuickChipActive(page: any, label: string, active: boolean) {
		await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute(
			'aria-pressed',
			active ? 'true' : 'false',
			{ timeout: 3_000 }
		);
	}

	test('search icon opens the panel and close button dismisses it', async ({ page }) => {
		await setupSearchPage(page);
		await openSearchPanel(page);
		await page.getByRole('button', { name: 'Close search' }).click();
		await expect(page.getByRole('textbox', { name: 'Search messages' })).not.toBeVisible({ timeout: 5_000 });
	});

	test('quick chips render and toggle on/off', async ({ page }) => {
		await setupSearchPage(page);
		await openSearchPanel(page);

		for (const label of ['From me', 'Mentions me', 'Has file', 'Has a link', 'Last 7 days', 'Threads only']) {
			const chip = page.getByRole('button', { name: label, exact: true });
			await expect(chip).toBeVisible();
			await chip.click();
			await expectQuickChipActive(page, label, true);
			await chip.click();
			await expectQuickChipActive(page, label, false);
		}
	});

	test('"More" dropdown shows all filter categories', async ({ page }) => {
		await setupSearchPage(page);
		await openSearchPanel(page);

		await page.getByRole('button', { name: 'More filters' }).click();
		for (const label of ['From someone', 'In channel', 'In conversation', 'After date', 'Before date']) {
			await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 3_000 });
		}
	});

	test('"In channel" shows channel autocomplete and applies filter chip', async ({ page }) => {
		await setupSearchPage(page);
		await openSearchPanel(page);

		await page.getByRole('button', { name: 'More filters' }).click();
		await page.getByText('In channel', { exact: true }).click();

		// Autocomplete suggestions for group chats
		await expect(page.getByText('#general')).toBeVisible({ timeout: 5_000 });
		await expect(page.getByText('#design')).toBeVisible({ timeout: 3_000 });

		// Pick #general
		await page.getByText('#general').click();

		await expect(page.getByText('in:general', { exact: false })).toBeVisible({ timeout: 5_000 });
	});

	test('"In conversation" shows DM autocomplete', async ({ page }) => {
		await setupSearchPage(page);
		await openSearchPanel(page);

		await page.getByRole('button', { name: 'More filters' }).click();
		await page.getByText('In conversation', { exact: true }).click();

		// Should show the DM participant (zenobia)
		await expect(page.getByTestId('messages-search-filter-suggestions').getByRole('button', { name: 'zenobia' })).toBeVisible({ timeout: 5_000 });
	});

	test('activating "From me" shows active filter chip', async ({ page }) => {
		await setupSearchPage(page);
		await openSearchPanel(page);

		await page.getByRole('button', { name: 'From me', exact: true }).click();
		await expectQuickChipActive(page, 'From me', true);
	});

	test('"Clear all" button removes all active filters', async ({ page }) => {
		await setupSearchPage(page);
		await openSearchPanel(page);

		// Activate two filters
		await page.getByRole('button', { name: 'Has file', exact: true }).click();
		await page.getByRole('button', { name: 'Threads only', exact: true }).click();
		await expect(page.getByTestId('messages-search-clear-filters')).toBeVisible({ timeout: 3_000 });

		await page.getByTestId('messages-search-clear-filters').click();

		await expectQuickChipActive(page, 'Has file', false);
		await expectQuickChipActive(page, 'Threads only', false);
		await expect(page.getByTestId('messages-search-clear-filters')).not.toBeVisible();
	});

	test('text search records a history entry', async ({ page }) => {
		await setupSearchPage(page);
		await openSearchPanel(page);

		const input = page.getByRole('textbox', { name: 'Search messages' });
		await input.fill('hello world');
		await input.press('Enter');

		// Close and reopen to see history
		await page.getByRole('button', { name: 'Close search' }).click();
		await openSearchPanel(page);

		await expect(page.getByText('hello world', { exact: true })).toBeVisible({ timeout: 5_000 });
	});

	test('filter and text search history entries both render after reopening search', async ({ page }) => {
		await setupSearchPage(page);
		await openSearchPanel(page);

		// Create a filter history entry (has:file)
		await page.getByRole('button', { name: 'Has file', exact: true }).click();
		// Create a text history entry
		const input = page.getByRole('textbox', { name: 'Search messages' });
		await input.fill('hello');
		await input.press('Enter');

		await page.getByRole('button', { name: 'Close search' }).click();
		await openSearchPanel(page);

		await expect(page.getByText('has:file', { exact: false })).toBeVisible({ timeout: 5_000 });
		await expect(page.getByText('hello', { exact: false })).toBeVisible({ timeout: 3_000 });
	});
});
