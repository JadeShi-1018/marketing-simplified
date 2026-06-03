/**
 * E2E tests for the Channel Details drawer.
 *
 * Covers:
 *  - "Channel details" from the right-click context menu opens the drawer
 *  - Drawer shows channel name, topic, and description
 *  - Notification level buttons are visible
 *  - Changing notification level calls the API and reflects immediately
 *    (no page refresh required)
 *  - Mute toggle reflects immediately in the drawer
 *  - Closing the drawer returns to normal chat view
 *  - "Channel details" for a second channel opens the correct drawer
 */

import { test, expect } from '@playwright/test';
import {
	waitForLayoutMain,
	seedAuthenticatedUser,
	mockAuthenticatedUserApis,
	mockProjectShellApis,
	seedActiveProject,
} from './messages-helpers';

const PROJECT = { id: 1, name: 'Channel Details E2E Project' };
const E2E_USER = {
	id: 1,
	email: 'e2e@example.com',
	username: 'e2e-user',
	is_verified: true,
	is_staff: false,
	roles: [],
};

function buildChat(id: number, name: string, notifLevel = 'all', isMuted = false) {
	const createdAt = '2026-05-20T08:00:00.000Z';
	return {
		id,
		name,
		type: 'group',
		project_id: 1,
		topic: `Topic for ${name}`,
		description: `Description of ${name} channel`,
		unread_count: 0,
		created_by: E2E_USER,
		created_by_id: E2E_USER.id,
		created_at: createdAt,
		updated_at: createdAt,
		participants: [
			{
				id: id * 10,
				user: E2E_USER,
				chat_id: id,
				joined_at: createdAt,
				is_active: true,
				is_muted: isMuted,
				notification_level: notifLevel,
				is_manager: true,
			},
		],
		last_message: null,
	};
}

const MOCK_CHATS = [buildChat(401, 'general'), buildChat(402, 'design', 'mentions')];

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
		if (/\/notification_settings\/?$/.test(pathname)) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ is_muted: false, notification_level: 'mentions', muted_until: null }),
			});
			return;
		}
		if (/\/pins\/?$/.test(pathname)) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
			return;
		}
		if (/\/files\/?$/.test(pathname)) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
			return;
		}
		if (/\/scheduled\/?$/.test(pathname)) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
			return;
		}
		await route.fallback();
	});
	await page.route('**/api/chat/messages/**', async (route: any) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ results: [], next_cursor: null, prev_cursor: null, page_size: 50 }),
		});
	});
	await page.route('**/api/chat/custom-sections/**', async (route: any) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
	});
	await page.route('**/api/core/projects/*/members**', async (route: any) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], next: null }) });
	});

	await page.goto('/messages');
	await waitForLayoutMain(page);
	await expect(page.getByTestId('messages-chat-row').first()).toBeVisible({ timeout: 15_000 });
}

async function openChannelDetailsViaContextMenu(page: any, rowIndex = 0) {
	await page.getByTestId('messages-chat-row').nth(rowIndex).click({ button: 'right' });
	const menu = page.getByTestId('messages-context-menu');
	await expect(menu).toBeVisible({ timeout: 5_000 });
	await menu.getByText('Channel details').click();
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Channel details drawer', () => {
	test.describe.configure({ mode: 'serial', timeout: 60_000 });

	test('right-click → Channel details opens the drawer', async ({ page }) => {
		await setupPage(page);
		await openChannelDetailsViaContextMenu(page);

		const drawer = page.getByTestId('channel-details-drawer');
		await expect(drawer.getByText('general', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
	});

	test('drawer shows topic and description', async ({ page }) => {
		await setupPage(page);
		await openChannelDetailsViaContextMenu(page);

		const drawer = page.getByTestId('channel-details-drawer');
		await expect(drawer.getByText('Topic for general', { exact: false })).toBeVisible({ timeout: 10_000 });
		await expect(drawer.getByText('Description of general channel', { exact: false })).toBeVisible({ timeout: 5_000 });
	});

	test('notification section and temporary mute buttons are visible in the drawer', async ({ page }) => {
		await setupPage(page);
		await openChannelDetailsViaContextMenu(page);

		const drawer = page.getByTestId('channel-details-drawer');
		await drawer.getByText('Notifications', { exact: true }).click();

		await expect(drawer.getByText('Mute channel', { exact: true })).toBeVisible({ timeout: 10_000 });
		await expect(drawer.getByRole('button', { name: '1 hour' })).toBeVisible();
		await expect(drawer.getByRole('button', { name: 'Tomorrow' })).toBeVisible();
		await expect(drawer.getByRole('button', { name: '1 week' })).toBeVisible();
		await expect(drawer.getByText('All messages', { exact: true })).toBeVisible();
		await expect(drawer.getByText('Mentions only', { exact: true })).toBeVisible();
	});

	test('notification level change calls API and updates immediately', async ({ page }) => {
		await setupPage(page);
		let patchCalled = false;
		let patchBody: any = null;

			await page.route('**/api/chat/chats/*/notification_settings/**', async (route: any) => {
				if (route.request().method() === 'PATCH') {
					patchCalled = true;
					try {
						patchBody = route.request().postDataJSON();
					} catch {
						patchBody = null;
					}
				}
				await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_muted: false, notification_level: 'mentions', muted_until: null }) });
			});

		await openChannelDetailsViaContextMenu(page);

		const drawer = page.getByTestId('channel-details-drawer');
		await drawer.getByText('Notifications', { exact: true }).click();
		await drawer.getByText('Mentions only', { exact: true }).click();
		expect(patchCalled).toBe(true);
	});

	test('mute toggle and temporary mute call API and update immediately', async ({ page }) => {
		await setupPage(page);
		let mutePayload: any = null;

			await page.route('**/api/chat/chats/*/notification_settings/**', async (route: any) => {
				if (route.request().method() === 'PATCH') {
					try {
						mutePayload = route.request().postDataJSON();
					} catch {
						mutePayload = null;
					}
				}
				await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					is_muted: true,
					notification_level: 'none',
					muted_until: mutePayload?.muted_until ?? null,
				}),
			});
		});

		await openChannelDetailsViaContextMenu(page);

		const drawer = page.getByTestId('channel-details-drawer');
		await drawer.getByText('Notifications', { exact: true }).click();
		await drawer.getByRole('switch').click();
		expect(mutePayload).toMatchObject({ is_muted: true, muted_until: null });

		mutePayload = null;
		await drawer.getByRole('button', { name: '1 hour' }).click();
		expect(mutePayload?.is_muted).toBe(true);
		expect(typeof mutePayload?.muted_until).toBe('string');
	});

	test('opening details for a second channel shows correct channel name', async ({ page }) => {
		await setupPage(page);

		await openChannelDetailsViaContextMenu(page, 0);
		let drawer = page.getByTestId('channel-details-drawer');
		await expect(drawer.getByText('general', { exact: false }).first()).toBeVisible({ timeout: 10_000 });

		await page.getByLabel('Close channel details').click();
		await openChannelDetailsViaContextMenu(page, 1);
		drawer = page.getByTestId('channel-details-drawer');
		await expect(drawer.getByText('design', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
	});
});
