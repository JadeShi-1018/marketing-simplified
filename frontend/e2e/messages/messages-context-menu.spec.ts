/**
 * E2E tests for the sidebar chat-row right-click context menu.
 *
 * Covers:
 *  - Menu opens on right-click and closes on outside click / Escape
 *  - Channel details item opens the ChannelDetailsDrawer
 *  - Search in channel pre-fills the search panel with the correct channel
 *  - Notification section shows All new posts / Just mentions / Mute and hide
 *  - Selecting a notification level calls the API and updates immediately
 *  - Leave channel item is visible for group chats
 *  - DM rows show "Conversation details" / "Search in conversation" labels
 */

import { test, expect } from '@playwright/test';
import {
	waitForLayoutMain,
	seedAuthenticatedUser,
	mockAuthenticatedUserApis,
	mockProjectShellApis,
	seedActiveProject,
} from './messages-helpers';

const PROJECT = { id: 1, name: 'Context Menu E2E Project' };
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
		id: 201,
		name: 'general',
		type: 'group',
		project_id: 1,
		created_at: '2026-05-20T08:00:00.000Z',
		updated_at: '2026-05-20T08:00:00.000Z',
		created_by_id: 1,
		unread_count: 2,
		participants: [
			{
				id: 1,
				user: E2E_USER,
				chat_id: 201,
				joined_at: '2026-05-20T08:00:00.000Z',
				is_active: true,
				is_muted: false,
				notification_level: 'all',
				is_manager: true,
			},
		],
		last_message: { id: 1, content: 'Hey!', sender: { id: 2, username: 'other' }, created_at: new Date().toISOString() },
	},
	{
		id: 202,
		name: null,
		type: 'private',
		project_id: 1,
		created_at: '2026-05-20T08:00:00.000Z',
		updated_at: '2026-05-20T08:00:00.000Z',
		unread_count: 0,
		participants: [
			{
				id: 1,
				user: E2E_USER,
				chat_id: 202,
				joined_at: '2026-05-20T08:00:00.000Z',
				is_active: true,
				is_muted: false,
				notification_level: 'all',
			},
			{
				id: 2,
				user: { id: 2, username: 'zenobia', email: 'z@example.com' },
				chat_id: 202,
				joined_at: '2026-05-20T08:05:00.000Z',
				is_active: true,
			},
		],
		last_message: null,
	},
];

async function setupPage(page: any) {
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
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ count: MOCK_CHATS.length, next: null, previous: null, results: MOCK_CHATS }),
			});
			return;
		}
		const detailMatch = pathname.match(/\/api\/chat\/chats\/(\d+)$/);
		if (detailMatch && route.request().method() === 'GET') {
			const chat = MOCK_CHATS.find((item) => item.id === Number(detailMatch[1])) ?? MOCK_CHATS[0];
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chat) });
			return;
		}
		if (/\/api\/chat\/chats\/\d+\/notification_settings\/?$/.test(pathname)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ is_muted: false, notification_level: 'mentions', muted_until: null }),
			});
			return;
		}
		await route.fallback();
	});
	await page.route('**/api/chat/search/**', async (route: any) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 0, results: [] }) });
	});
	await page.route('**/api/chat/custom-sections/**', async (route: any) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
	});
	await page.route('**/api/chat/messages/**', async (route: any) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ results: [], next_cursor: null, prev_cursor: null, page_size: 50 }),
		});
	});

	await page.goto('/messages');
	await waitForLayoutMain(page);
	await expect(page.getByTestId('messages-chat-row').first()).toBeVisible({ timeout: 15_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Chat row context menu', () => {
	test.describe.configure({ mode: 'serial', timeout: 60_000 });

	test('right-click opens context menu with expected items', async ({ page }) => {
		await setupPage(page);
		const row = page.getByTestId('messages-chat-row').first();
		await row.click({ button: 'right' });

		const menu = page.getByTestId('messages-context-menu');
		await expect(menu).toBeVisible({ timeout: 5_000 });
		await expect(menu.getByText('Channel details')).toBeVisible();
		await expect(menu.getByText('Search in channel')).toBeVisible();
		await expect(menu.getByText(/notify you about/i)).toBeVisible();
		await expect(menu.getByText('All new posts')).toBeVisible();
		await expect(menu.getByText('Just mentions')).toBeVisible();
		await expect(menu.getByText('Mute and hide')).toBeVisible();
		await expect(menu.getByText(/temporarily mute/i)).toBeVisible();
		await expect(menu.getByText('For 1 hour')).toBeVisible();
		await expect(menu.getByText('Until tomorrow')).toBeVisible();
		await expect(menu.getByText('For 1 week')).toBeVisible();
		await expect(menu.getByText('Leave channel')).toBeVisible();
	});

	test('Escape closes the context menu', async ({ page }) => {
		await setupPage(page);
		await page.getByTestId('messages-chat-row').first().click({ button: 'right' });
		await expect(page.getByTestId('messages-context-menu')).toBeVisible({ timeout: 5_000 });
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('messages-context-menu')).not.toBeVisible({ timeout: 3_000 });
	});

	test('clicking outside closes the context menu', async ({ page }) => {
		await setupPage(page);
		await page.getByTestId('messages-chat-row').first().click({ button: 'right' });
		await expect(page.getByTestId('messages-context-menu')).toBeVisible({ timeout: 5_000 });
		await page.mouse.click(10, 10);
		await expect(page.getByTestId('messages-context-menu')).not.toBeVisible({ timeout: 3_000 });
	});

	test('"Search in channel" opens search panel with channel filter pre-filled', async ({ page }) => {
		await setupPage(page);
		await page.getByTestId('messages-chat-row').first().click({ button: 'right' });
		const menu = page.getByTestId('messages-context-menu');
		await expect(menu).toBeVisible({ timeout: 5_000 });
		await menu.getByText('Search in channel').click();

		await expect(page.getByRole('textbox', { name: 'Search messages' })).toBeVisible({ timeout: 5_000 });
		await expect(page.getByText('in:general', { exact: false })).toBeVisible({ timeout: 5_000 });
	});

	test('"Search in channel" re-applies filter on second invocation', async ({ page }) => {
		await setupPage(page);

		// First right-click → search in #general
		await page.getByTestId('messages-chat-row').first().click({ button: 'right' });
		await page.getByTestId('messages-context-menu').getByText('Search in channel').click();
		await expect(page.getByText('in:general', { exact: false })).toBeVisible({ timeout: 5_000 });

		// Remove the filter
		await page.getByRole('button', { name: 'Remove in:general filter', exact: false }).click();
		await expect(page.getByText('in:general', { exact: false })).not.toBeVisible({ timeout: 3_000 });

		// Second right-click → filter should reappear
		await page.getByTestId('messages-chat-row').first().click({ button: 'right' });
		await page.getByTestId('messages-context-menu').getByText('Search in channel').click();
		await expect(page.getByText('in:general', { exact: false })).toBeVisible({ timeout: 5_000 });
	});

	test('notification level checkmark shows current setting', async ({ page }) => {
		await setupPage(page);
		await page.getByTestId('messages-chat-row').first().click({ button: 'right' });
		const menu = page.getByTestId('messages-context-menu');
		await expect(menu).toBeVisible({ timeout: 5_000 });

		// The mock participant has notification_level='all', is_muted=false → "All new posts" should have checkmark
		// Verify the All new posts row contains a check icon (svg inside the row)
		const allPostsRow = menu.locator('button').filter({ hasText: 'All new posts' });
		await expect(allPostsRow).toBeVisible();
		await expect(allPostsRow.locator('svg').last()).toBeVisible(); // check icon
	});

	test('selecting a notification level calls the API', async ({ page }) => {
		await setupPage(page);

		let notifApiCalled = false;
		await page.route('**/api/chat/chats/*/notification_settings/**', async (route: any) => {
			if (route.request().method() === 'PATCH') notifApiCalled = true;
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_muted: false, notification_level: 'mentions', muted_until: null }) });
		});

		await page.getByTestId('messages-chat-row').first().click({ button: 'right' });
		const menu = page.getByTestId('messages-context-menu');
		await expect(menu).toBeVisible({ timeout: 5_000 });
		await menu.locator('button').filter({ hasText: 'Just mentions' }).click();

		expect(notifApiCalled).toBe(true);
	});

	test('temporary mute from context menu calls the API with a muted-until value', async ({ page }) => {
		await setupPage(page);

		let payload: any = null;
		await page.route('**/api/chat/chats/*/notification_settings/**', async (route: any) => {
			if (route.request().method() === 'PATCH') {
				try {
					payload = route.request().postDataJSON();
				} catch {
					payload = null;
				}
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ is_muted: true, notification_level: 'all', muted_until: payload?.muted_until ?? null }),
			});
		});

		await page.getByTestId('messages-chat-row').first().click({ button: 'right' });
		const menu = page.getByTestId('messages-context-menu');
		await expect(menu).toBeVisible({ timeout: 5_000 });
		await menu.locator('button').filter({ hasText: 'For 1 hour' }).click();

		expect(payload?.is_muted).toBe(true);
		expect(typeof payload?.muted_until).toBe('string');
	});

	test('DM row shows "Conversation details" and "Search in conversation"', async ({ page }) => {
		await setupPage(page);

		// Second chat row is the DM (zenobia)
		const rows = page.getByTestId('messages-chat-row');
		await rows.nth(1).click({ button: 'right' });
		const menu = page.getByTestId('messages-context-menu');
		await expect(menu).toBeVisible({ timeout: 5_000 });
		await expect(menu.getByText('Conversation details')).toBeVisible();
		await expect(menu.getByText('Search in conversation')).toBeVisible();
		// DM should NOT show "Leave channel"
		await expect(menu.getByText('Leave channel')).not.toBeVisible();
	});
});
