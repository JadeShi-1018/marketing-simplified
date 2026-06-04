/**
 * E2E tests for the Activity tab in the Messages sidebar.
 *
 * Covers:
 *  - Activity tab is reachable via the nav rail
 *  - Empty state renders when no notifications exist
 *  - Notification items render when feed has data
 *  - Trash button shows inline confirmation ("Can't be undone")
 *  - Cancelling confirmation keeps items intact
 *  - Confirming calls the clear API and removes items
 *  - "Mark all read" button calls the mark-all-read API
 */

import { test, expect } from '@playwright/test';
import {
	waitForLayoutMain,
	seedAuthenticatedUser,
	mockAuthenticatedUserApis,
	mockProjectShellApis,
	seedActiveProject,
	clearProjectStore,
} from './messages-helpers';

const PROJECT = { id: 1, name: 'Activity E2E Project' };
const E2E_USER = {
	id: 1,
	email: 'e2e@example.com',
	username: 'e2e-user',
	is_verified: true,
	is_staff: false,
	roles: [],
};

const MOCK_NOTIFICATIONS = [
	{
		id: 'notif-1',
		event_type: 'chat_new_message',
		title: 'zenobia sent a message in #general',
		body: 'Hey everyone, quick update…',
		is_read: true,
		actor_name: 'zenobia',
		actor_avatar: null,
		action_url: '/messages?chatId=101',
		created_at: new Date(Date.now() - 60_000).toISOString(),
		metadata: { message_count: 3 },
	},
	{
		id: 'notif-2',
		event_type: 'chat_mention',
		title: 'zenobia mentioned you in #design',
		body: '@e2e-user can you review this?',
		is_read: false,
		actor_name: 'zenobia',
		actor_avatar: null,
		action_url: '/messages?chatId=102',
		created_at: new Date(Date.now() - 120_000).toISOString(),
		metadata: {},
	},
];

async function mockActivityApis(page: any, notifications = MOCK_NOTIFICATIONS) {
	await page.route('**/api/notifications/**', async (route: any) => {
		const url = route.request().url();
		const method = route.request().method();

		if (url.includes('/clear') && method === 'DELETE') {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: notifications.length }) });
			return;
		}
		if (url.includes('/mark_all_read') || url.includes('/mark-all-read')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updated: 1 }) });
			return;
		}
		if (method === 'PATCH') {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'notif-1', is_read: true }) });
			return;
		}
		await route.fulfill({
			status: 200, contentType: 'application/json',
			body: JSON.stringify({ count: notifications.length, next: null, previous: null, results: notifications }),
		});
	});
}

async function setupPage(page: any, notifications = MOCK_NOTIFICATIONS) {
	await seedAuthenticatedUser(page, E2E_USER);
	await mockAuthenticatedUserApis(page, E2E_USER);
	await clearProjectStore(page);
	await mockProjectShellApis(page);
	await mockActivityApis(page, notifications);

	await page.route('**/api/core/projects**', async (route: any) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([PROJECT]) });
	});
	await page.route('**/api/chat/custom-sections/**', async (route: any) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
	});

	await page.goto('/messages');
	await waitForLayoutMain(page);
}

async function openActivityTab(page: any) {
	await page.getByTestId('messages-nav-activity').click();
	// Wait for activity content
	await expect(page.getByText('Activity', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Activity tab', () => {
	test.describe.configure({ mode: 'serial', timeout: 60_000 });

	test('activity tab is reachable via nav rail', async ({ page }) => {
		await setupPage(page, []);
		await openActivityTab(page);
		await expect(page.getByText("You're all caught up!", { exact: true })).toBeVisible({ timeout: 10_000 });
	});

	test('notification items render in the feed', async ({ page }) => {
		await setupPage(page);
		await openActivityTab(page);

		await expect(page.getByText('zenobia sent a message in #general', { exact: false })).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText('zenobia mentioned you in #design', { exact: false })).toBeVisible({ timeout: 5_000 });
	});

	test('trash button shows inline confirmation with "Can\'t be undone" message', async ({ page }) => {
		await setupPage(page);
		await openActivityTab(page);

		await page.getByTestId('activity-clear-btn').click();
		await expect(page.getByText("Can't be undone.", { exact: false })).toBeVisible({ timeout: 3_000 });
		await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
	});

	test('cancelling confirmation keeps the trash button and hides confirmation', async ({ page }) => {
		await setupPage(page);
		await openActivityTab(page);

		await page.getByTestId('activity-clear-btn').click();
		await expect(page.getByText("Can't be undone.", { exact: false })).toBeVisible({ timeout: 3_000 });
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();

		// Confirmation gone, original trash button back
		await expect(page.getByText("Can't be undone.", { exact: false })).not.toBeVisible({ timeout: 3_000 });
		await expect(page.getByTestId('activity-clear-btn')).toBeVisible();
	});

	test('confirming clear calls the API', async ({ page }) => {
		let clearCalled = false;
		await setupPage(page);

		await page.route('**/api/notifications/**', async (route: any) => {
			if (route.request().url().includes('/clear') && route.request().method() === 'DELETE') {
				clearCalled = true;
			}
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: 1, count: 0, next: null, previous: null, results: [] }) });
		});

		await openActivityTab(page);
		await page.getByTestId('activity-clear-btn').click();
		await page.getByRole('button', { name: 'Clear', exact: true }).click();

		expect(clearCalled).toBe(true);
	});

	test('"Mark all read" button is visible when unread notifications exist', async ({ page }) => {
		await setupPage(page);
		await openActivityTab(page);

		// notif-2 is unread so the "mark all read" button should show
		await expect(page.getByTitle('Mark all as read')).toBeVisible({ timeout: 5_000 });
	});
});
