import { type Page, expect } from '@playwright/test';

type MessagesProjectSeed = {
	id: number;
	name: string;
	[key: string]: unknown;
};

type MessagesUserSeed = {
	id: number;
	email: string;
	username: string;
	roles?: string[];
	[key: string]: unknown;
};

export const DEFAULT_MESSAGES_E2E_USER: MessagesUserSeed = {
	id: 1,
	email: 'e2e@example.com',
	username: 'e2e-user',
	is_verified: true,
	is_staff: false,
	roles: ['Media Buyer'],
};

export async function seedAuthenticatedUser(
	page: Page,
	user: MessagesUserSeed = DEFAULT_MESSAGES_E2E_USER
) {
	await page.addInitScript((authUser) => {
		window.localStorage.setItem(
			'auth-storage',
			JSON.stringify({
				state: {
					token: 'e2e-access-token',
					refreshToken: 'e2e-refresh-token',
					organizationAccessToken: 'e2e-organization-token',
					user: authUser,
					isAuthenticated: true,
					loading: false,
					initialized: true,
					hasHydrated: true,
					userTeams: [],
					selectedTeamId: null,
				},
				version: 0,
			})
		);
	}, user);
}

export async function mockAuthenticatedUserApis(
	page: Page,
	user: MessagesUserSeed = DEFAULT_MESSAGES_E2E_USER
) {
	await page.route('**/auth/me/', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(user),
		});
	});

	await page.route('**/auth/me/teams/', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ team_ids: [] }),
		});
	});
}

export async function mockProjectShellApis(page: Page) {
	await page.route('**/api/core/projects**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([]),
		});
	});

	await page.route('**/api/core/invitations/pending**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([]),
		});
	});

	await page.route('**/api/projects/*/meetings**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
		});
	});

	await page.route('**/api/dashboard/summary**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({}),
		});
	});

	await page.route('**/api/decisions**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
		});
	});

	await page.route('**/api/campaigns**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([]),
		});
	});

	await page.route('**/api/assets**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ results: [] }),
		});
	});

	await page.route('**/api/alerting/alert-tasks**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ results: [] }),
		});
	});
}

export async function seedActiveProject(page: Page, project: MessagesProjectSeed) {
	await page.addInitScript((activeProject) => {
		window.localStorage.setItem(
			'project-storage',
			JSON.stringify({
				state: {
					activeProject,
					activeProjectIds: [activeProject.id],
					inactiveProjectIds: [],
					completedProjectIds: [],
					hasHydrated: true,
					loading: false,
					error: null,
				},
				version: 0,
			})
		);
	}, project);
}

export async function clearProjectStore(page: Page) {
	await page.addInitScript(() => {
		window.localStorage.setItem(
			'project-storage',
			JSON.stringify({
				state: {
					activeProject: null,
					activeProjectIds: [],
					inactiveProjectIds: [],
					completedProjectIds: [],
					hasHydrated: true,
					loading: false,
					error: null,
				},
				version: 0,
			})
		);
	});
}

export async function waitForLayoutMain(page: Page) {
	await page.setViewportSize({ width: 1280, height: 800});
	await page.waitForLoadState('domcontentloaded');

	await page
	    .getByText('Loading...', { exact: true})
		.waitFor({ state: 'hidden', timeout: 45_000 })
		.catch(() => {});

	await page.waitForURL((url) => !/\/(login|unauthorized)(\?|$)/i.test(url.pathname), {
		timeout: 20_000,
	});

	await expect(page.locator('body')).toBeAttached({ timeout: 15_000});
}

export function getMessagesHeader(page: Page) {
	return page.getByTestId('messages-header');
}

export function getProjectSelector(page: Page) {
	return getMessagesHeader(page);
}

export function getChatRows(page: Page) {
	return page.getByTestId('messages-chat-row');
}

export function getMessagesNewChatButton(page: Page) {
	return page.getByTestId('messages-new-chat');
}

export async function selectFirstProject(page: Page): Promise<boolean> {
	await expect(getMessagesHeader(page)).toBeVisible();
	const newChatButton = getMessagesNewChatButton(page);
	const newChatCount = await newChatButton.count();
	if (newChatCount > 0 && !(await newChatButton.first().isDisabled().catch(() => true))) {
		return true;
	}

	return !(await page.getByText('Select a project to view chats').isVisible().catch(() => false));
}

export async function assertChatListOrEmptyState(page: Page) {
	const chatRows = getChatRows(page);
	const noChatsState = page.getByText('No chats yet', { exact: true });
	const selectProjectHint = page.getByText('Select a project to view chats');
	const selectProjectStart = page.getByRole('heading', { name: 'Select a project to start' });
	const noDirectMessages = page.getByText('No direct messages', { exact: true });

	await expect
		.poll(async () => {
			const rows = await chatRows.count();
			const noChatsVisible = await noChatsState.isVisible().catch(() => false);
			const selectHintVisible = await selectProjectHint.isVisible().catch(() => false);
			const selectStartVisible = await selectProjectStart.isVisible().catch(() => false);
			const noDirectMessagesVisible = await noDirectMessages.isVisible().catch(() => false);
			return rows > 0 || noChatsVisible || selectHintVisible || selectStartVisible || noDirectMessagesVisible;
		}, { timeout: 20_000 })
		.toBeTruthy();
}

export async function openFirstChatIfPresent(page: Page) {
	const chatRows = getChatRows(page);
	const count = await chatRows.count();

	if (count === 0) {
		return false;
	}

	await chatRows.first().click();
	await expect(page.getByTestId('messages-chat-window')).toBeVisible({
		timeout: 15_000,
	});
	return true;
}

export async function trySendMessage(page: Page, content: string) {
	const messageInput = page.getByPlaceholder(/Type a message|Add a message/);
	await expect(messageInput).toBeVisible({ timeout: 10_000 });
	await messageInput.fill(content);
	await page.getByRole('button', { name: 'Send message' }).click();

	await expect
		.poll(async () => {
			const sentVisible = await page.getByText(content, { exact: false }).isVisible().catch(() => false);
			const inputHasText = await messageInput.inputValue().catch(() => content);
			return sentVisible || inputHasText.trim().length === 0;
		}, { timeout: 15_000 })
		.toBeTruthy();
}
