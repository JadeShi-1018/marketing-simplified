import { test, expect } from '@playwright/test';
import {
	waitForLayoutMain,
	seedAuthenticatedUser,
	mockAuthenticatedUserApis,
	mockProjectShellApis,
	seedActiveProject,
	clearProjectStore,
	getMessagesHeader,
	getMessagesNewChatButton,
	getChatRows,
	selectFirstProject,
	assertChatListOrEmptyState,
	openFirstChatIfPresent,
	trySendMessage,
} from './messages-helpers';

async function mockProjects(page: any, projects: Array<Record<string, any>>) {
	await page.route('**/api/core/projects**', async (route: any) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(projects),
		});
	});
}

async function mockStarredChats(page: any) {
	await page.route('**/api/chat/starred/**', async (route: any) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([]),
		});
	});
}

test.beforeEach(async ({ page }) => {
	await seedAuthenticatedUser(page);
	await mockAuthenticatedUserApis(page);
	await mockProjectShellApis(page);
});


test.describe('Messages and main layout', () => {
	test.describe.configure({ mode: 'serial', timeout: 90_000});

	test('Logged-in user opens /messages → assert current Messages layout and initial state', async ({
		page,
	}) => {
		await page.goto('/messages');
		await waitForLayoutMain(page);
		await expect(getMessagesHeader(page)).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Messages', level: 1 })).toBeVisible();
		await expect(page.getByTestId('messages-layout')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('messages-left')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('messages-chat-panel')).toBeVisible({ timeout: 15_000 });
		await assertChatListOrEmptyState(page);
	});

	test('Active project store (mocked): project name and empty chat state render', async ({
		page,
	}) => {
		const alpha = { id: 701, name: 'E2E Selector Alpha', member_count: 1 };

		await seedActiveProject(page, alpha);
		await mockProjects(page, [alpha]);
		await mockStarredChats(page);

		await page.route('**/api/core/projects/*/members/**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ results: [], next: null }),
			});
		});

		await page.route('**/api/chat/chats/**', async (route) => {
			if (route.request().method() !== 'GET') {
				await route.fallback();
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					count: 0,
					next: null,
					previous: null,
					results: [],
				}),
			});
		});

		await page.goto('/messages');
		await waitForLayoutMain(page);

		await expect(getMessagesHeader(page)).toContainText(alpha.name);
		await expect(page.getByText('No direct messages yet', { exact: true })).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByRole('heading', { name: 'Select a conversation' })).toBeVisible({
			timeout: 15_000,
		});
		await assertChatListOrEmptyState(page);
	});

	test('Open first chat and optionally send a message', async ({ page }) => {
		const projectId = 601;
		const chatId = 801;

		await seedActiveProject(page, { id: projectId, name: 'Open Chat Project', member_count: 2 });
		await mockProjects(page, [{ id: projectId, name: 'Open Chat Project', member_count: 2 }]);
		await mockStarredChats(page);

		await page.route(`**/api/core/projects/${projectId}/members/**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ results: [], next: null }),
			});
		});

		await page.route('**/api/chat/chats/**', async (route) => {
			if (route.request().method() !== 'GET') { await route.fallback(); return; }
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					count: 1, next: null, previous: null,
					results: [{
						id: chatId, type: 'private', project_id: projectId,
						participants: [
							{ id: 1, user: { id: 1, username: 'e2e-user', email: 'e2e@example.com' } },
							{ id: 2, user: { id: 2, username: 'teammate', email: 'tm@example.com' } },
						],
						last_message: null, unread_count: 0,
					}],
				}),
			});
		});

		await page.route('**/api/chat/messages/**', async (route) => {
			if (route.request().method() !== 'GET') { await route.fallback(); return; }
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ results: [], next_cursor: null, prev_cursor: null, page_size: 50 }),
			});
		});

		await page.route(`**/api/chat/chats/${chatId}/mark_as_read/**`, async (route) => {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
		});

		await page.goto(`/messages?projectId=${projectId}`);
		await waitForLayoutMain(page);
		await assertChatListOrEmptyState(page);

		const opened = await openFirstChatIfPresent(page);
		if (!opened) {
			await expect(page.getByRole('heading', { name: 'No chats yet' })).toBeVisible();
			return;
		}

		const messageInput = page.getByPlaceholder(/Type a message|Add a message/);
		await expect(messageInput).toBeVisible({ timeout: 15_000 });
	});

	test('Send message with mocked chat APIs → message appears in thread', async ({ page }) => {
		const projectId = 101;
		const chatId = 201;
		const currentUserId = 1;
		const mockNow = new Date().toISOString();
		const messagesStore: Array<Record<string, any>> = [
			{
				id: 9001,
				chat: chatId,
				content: 'Seed message',
				created_at: mockNow,
				sender: { id: 2, username: 'teammate' },
				statuses: [],
				attachments: [],
			},
		];

		await mockStarredChats(page);

		await page.route('**/api/core/projects/', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([{ id: projectId, name: 'E2E Project', member_count: 2 }]),
			});
		});

		await page.route(`**/api/core/projects/${projectId}/members/**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ results: [], next: null }),
			});
		});

		await page.route('**/api/chat/chats/**', async (route) => {
			if (route.request().method() !== 'GET') {
				await route.fallback();
				return;
			}

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					count: 1,
					next: null,
					previous: null,
					results: [
						{
							id: chatId,
							type: 'private',
							project_id: projectId,
							participants: [
								{ id: 1, user: { id: 1, username: 'e2e-user', email: 'e2e@example.com' } },
								{ id: 2, user: { id: 2, username: 'teammate', email: 'tm@example.com' } },
							],
							last_message: null,
							unread_count: 0,
						},
					],
				}),
			});
		});

		await page.route('**/api/chat/messages/unread_count/**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ unread_count: 0 }),
			});
		});

		await page.route(`**/api/chat/chats/${chatId}/mark_as_read/**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({}),
			});
		});

		await page.route('**/api/chat/messages/**', async (route) => {
			const method = route.request().method();

			if (method === 'GET') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						results: messagesStore,
						next_cursor: null,
						prev_cursor: null,
						page_size: 50,
					}),
				});
				return;
			}

			if (method === 'POST') {
				const payload = route.request().postDataJSON() as { content?: string; chat?: number };
				const newMessage = {
					id: 9000 + messagesStore.length + 1,
					chat: payload.chat || chatId,
					content: payload.content || '',
					created_at: new Date().toISOString(),
					sender: { id: currentUserId, username: 'e2e-user' },
					statuses: [],
					attachments: [],
				};
				messagesStore.push(newMessage);

				await route.fulfill({
					status: 201,
					contentType: 'application/json',
					body: JSON.stringify(newMessage),
				});
				return;
			}

			await route.fallback();
		});

		await page.goto(`/messages?projectId=${projectId}&chatId=${chatId}`);
		await waitForLayoutMain(page);
		await expect(page.getByRole('heading', { name: 'Messages', level: 1 })).toBeVisible();

		const mockMessage = `Mocked send ${Date.now()}`;
		await trySendMessage(page, mockMessage);
		await expect(page.getByText(mockMessage, { exact: true })).toBeVisible();
	});

	test('Create chat (mocked): New Chat → pick participant → create → appears in list', async ({
		page,
	}) => {
		const projectId = 301;
		const me = { id: 1, username: 'e2e-user', email: 'e2e@example.com' };
		const teammate = { id: 2, username: 'teammate', email: 'teammate@example.com' };
		const chatsStore: Array<Record<string, any>> = [];

		await mockStarredChats(page);

		await page.route('**/api/core/projects/', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([{ id: projectId, name: 'Create Chat Project', member_count: 2 }]),
			});
		});

		await page.route(`**/api/core/projects/${projectId}/members/**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					results: [
						{
							id: 11,
							user: me,
							project: { id: projectId, name: 'Create Chat Project' },
							role: 'owner',
							is_active: true,
						},
						{
							id: 12,
							user: teammate,
							project: { id: projectId, name: 'Create Chat Project' },
							role: 'member',
							is_active: true,
						},
					],
					next: null,
				}),
			});
		});

		await page.route('**/api/chat/chats/**', async (route) => {
			const req = route.request();
			const method = req.method();
			const url = new URL(req.url());
			const isPrivateLookup = url.searchParams.get('type') === 'private';

			if (method === 'GET') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						count: chatsStore.length,
						next: null,
						previous: null,
						results: isPrivateLookup ? [] : chatsStore,
					}),
				});
				return;
			}

			if (method === 'POST') {
				const payload = req.postDataJSON() as {
					type: 'private' | 'group';
					project: number;
					participant_ids: number[];
					name?: string;
				};
				const newId = 700 + chatsStore.length + 1;
				const createdAt = new Date().toISOString();
				const newChat = {
					id: newId,
					project_id: payload.project,
					type: payload.type,
					name: payload.type === 'group' ? payload.name || null : null,
					participants: [
						{ id: 101, user: me, chat_id: newId, joined_at: createdAt },
						...payload.participant_ids.map((uid, idx) => ({
							id: 102 + idx,
							user: uid === teammate.id ? teammate : { id: uid, username: `user-${uid}`, email: `u${uid}@example.com` },
							chat_id: newId,
							joined_at: createdAt,
						})),
					],
					created_at: createdAt,
					updated_at: createdAt,
					last_message: null,
					unread_count: 0,
				};
				chatsStore.push(newChat);
				await route.fulfill({
					status: 201,
					contentType: 'application/json',
					body: JSON.stringify(newChat),
				});
				return;
			}

			await route.fallback();
		});

		await page.route('**/api/chat/messages**', async (route) => {
			if (route.request().method() !== 'GET') {
				await route.fallback();
				return;
			}

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					results: [],
					next_cursor: null,
					prev_cursor: null,
					page_size: 50,
				}),
			});
		});

		await page.route('**/api/chat/messages/unread_count/**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ unread_count: 0 }),
			});
		});

		await page.route('**/api/chat/chats/*/mark_as_read/**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({}),
			});
		});

		await page.goto(`/messages?projectId=${projectId}`);
		await waitForLayoutMain(page);

		await page.getByText('Direct messages', { exact: true }).hover();
		await getMessagesNewChatButton(page).click();
		await expect(page.getByRole('heading', { name: 'Create New Chat' })).toBeVisible();

		await page
			.locator('label', { has: page.getByText(teammate.username, { exact: true }) })
			.locator('input[type="checkbox"]')
			.first()
			.check();

		await expect(page.getByText('Selected: 1 member')).toBeVisible();
		const chatRows = getChatRows(page);
		const beforeCount = await chatRows.count();
		await page.getByRole('button', { name: 'Create Chat' }).click();

		await expect
			.poll(async () => await chatRows.count(), { timeout: 15_000 })
			.toBeGreaterThan(beforeCount);
	});
});

test.describe('Messages edge cases without mock', () => {
	test.describe.configure({ mode: 'serial', timeout: 90_000 });

	test('Invalid query params should not break page rendering', async ({ page }) => {
		await page.goto('/messages?projectId=abc&chatId=-1');
		await waitForLayoutMain(page);
		await expect(page.getByRole('heading', { name: 'Messages', level: 1 })).toBeVisible({ timeout: 15_000 });
		await expect(page.locator('main')).toBeVisible();
		await assertChatListOrEmptyState(page);
	});

	test('No selected project: select-project hints render and New Chat is unavailable', async ({ page }) => {
		await clearProjectStore(page);
		await mockProjects(page, []);
		await page.goto('/messages');
		await waitForLayoutMain(page);

		await expect(page.getByRole('heading', { name: 'Messages', level: 1 })).toBeVisible();
		await expect(page.getByText('Select a project to view chats')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Select a project to start' })).toBeVisible();
		await expect(
			page.getByText('Select a project from the workspace navigation to view and manage team conversations.')
		).toBeVisible();
		await expect(getMessagesNewChatButton(page)).toHaveCount(0);

		await assertChatListOrEmptyState(page);
	});

	test('New Chat button is enabled when a project is selected', async ({ page }) => {
		const project = { id: 403, name: 'Button State Project', member_count: 1 };
		await seedActiveProject(page, project);
		await mockProjects(page, [project]);
		await mockStarredChats(page);
		await page.route('**/api/core/projects/*/members/**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ results: [], next: null }),
			});
		});
		await page.route('**/api/chat/chats/**', async (route) => {
			if (route.request().method() !== 'GET') {
				await route.fallback();
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
			});
		});

		await page.goto('/messages');
		await waitForLayoutMain(page);

		const newChatBtn = getMessagesNewChatButton(page);
		await page.getByText('Direct messages', { exact: true }).hover();
		await expect(newChatBtn).toBeVisible();
		await expect(newChatBtn).toBeEnabled();
		await assertChatListOrEmptyState(page);
	});

test('Open chat then back to list (mocked)', async ({ page }) => {
		const projectId = 405;
		const chatId = 505;
		await mockProjects(page, [{ id: projectId, name: 'Back Flow Project', member_count: 2 }]);
		await mockStarredChats(page);

		await page.route(`**/api/core/projects/${projectId}/members/**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ results: [], next: null }),
			});
		});

		await page.route('**/api/chat/chats/**', async (route) => {
			if (route.request().method() !== 'GET') {
				await route.fallback();
				return;
			}

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					count: 1,
					next: null,
					previous: null,
					results: [
						{
							id: chatId,
							type: 'private',
							project_id: projectId,
							participants: [
								{ id: 1, user: { id: 1, username: 'e2e-user', email: 'e2e@example.com' } },
								{ id: 2, user: { id: 2, username: 'teammate', email: 'teammate@example.com' } },
							],
							last_message: null,
							unread_count: 0,
						},
					],
				}),
			});
		});

		await page.route('**/api/chat/messages/**', async (route) => {
			if (route.request().method() !== 'GET') {
				await route.fallback();
				return;
			}

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					results: [
						{
							id: 9501,
							chat_id: chatId,
							content: 'hello in thread',
							created_at: new Date().toISOString(),
							sender: { id: 2, username: 'teammate' },
							statuses: [],
							attachments: [],
						},
					],
					next_cursor: null,
					prev_cursor: null,
					page_size: 50,
				}),
			});
		});

		await page.route('**/api/chat/messages/unread_count/**', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ unread_count: 0 }),
			});
		});

		await page.route(`**/api/chat/chats/${chatId}/mark_as_read/**`, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({}),
			});
		});

		await page.goto(`/messages?projectId=${projectId}`);
		await waitForLayoutMain(page);
		await expect(getChatRows(page)).toHaveCount(1);

		await getChatRows(page).first().click();
		await page.waitForURL((url) => url.searchParams.get('chatId') === String(chatId));
		await expect(page.getByTestId('messages-chat-window')).toBeVisible();

		// On desktop the back button is hidden (sidebar always visible) — verify this.
		await expect(page.getByRole('button', { name: 'Back to chat list' })).not.toBeVisible();

		// Navigate back by removing chatId from the URL (equivalent to deselecting the chat on desktop).
		await page.goto(`/messages?projectId=${projectId}`);
		await waitForLayoutMain(page);
		await expect(page.getByRole('heading', { name: 'Select a conversation' })).toBeVisible();
	});
});
