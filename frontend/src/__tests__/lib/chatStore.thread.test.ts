/**
 * Phase 4 thread-panel unit tests
 * ─────────────────────────────────
 * Covers:
 *  1. applyReactionUpdate propagates to threadReplies as well as main messages
 *  2. updateThreadReply can edit content and clear rich_body
 *  3. updateThreadReply marks a reply deleted
 *  4. removeMessage removes from the main messages store (delete fix)
 */

import { useChatStore } from '@/lib/chatStore';
import type { Message } from '@/types/chat';

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 10,
  chat_id: 2,
  sender: { id: 1, email: 'sender@example.com', username: 'sender' },
  content: 'hello',
  created_at: '2026-05-27T00:00:00.000Z',
  updated_at: '2026-05-27T00:00:00.000Z',
  ...overrides,
});

const makeReply = (overrides: Partial<Message> = {}): Message =>
  makeMessage({ id: 99, chat_id: 2, content: 'a reply', ...overrides });

function resetStore() {
  useChatStore.setState({
    messages: {},
    threadReplies: {},
    chatsByProject: {},
    unreadCounts: {},
    capturedUnreadCounts: {},
    typingUsersByChat: {},
    presenceByUserId: {},
    presenceVersionByUserId: {},
    mentionedChatIds: {},
    currentChatId: null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. applyReactionUpdate propagates into threadReplies
// ─────────────────────────────────────────────────────────────────────────────

describe('applyReactionUpdate — thread replies', () => {
  beforeEach(resetStore);

  it('adds a reaction to a thread reply', () => {
    const reply = makeReply({ id: 99, reactions: [] });
    useChatStore.getState().setThreadReplies(10, [reply]);

    const user = { id: 3, username: 'zenobia' };
    useChatStore.getState().applyReactionUpdate(99, '🔥', 'added', user, 3);

    const [updated] = useChatStore.getState().threadReplies[10];
    expect(updated.reactions).toEqual([
      { emoji: '🔥', count: 1, users: [user], reacted_by_me: true },
    ]);
  });

  it('removes a reaction from a thread reply', () => {
    const user = { id: 3, username: 'zenobia' };
    const reply = makeReply({
      id: 99,
      reactions: [{ emoji: '🔥', count: 1, users: [user], reacted_by_me: true }],
    });
    useChatStore.getState().setThreadReplies(10, [reply]);

    useChatStore.getState().applyReactionUpdate(99, '🔥', 'removed', user, 3);

    const [updated] = useChatStore.getState().threadReplies[10];
    expect(updated.reactions).toEqual([]);
  });

  it('does not affect other replies in the same thread', () => {
    const user = { id: 3, username: 'zenobia' };
    const reply1 = makeReply({ id: 99, reactions: [] });
    const reply2 = makeReply({ id: 100, reactions: [] });
    useChatStore.getState().setThreadReplies(10, [reply1, reply2]);

    useChatStore.getState().applyReactionUpdate(99, '👍', 'added', user, 3);

    const replies = useChatStore.getState().threadReplies[10];
    expect(replies[0].reactions).toHaveLength(1); // reply 99 updated
    expect(replies[1].reactions).toEqual([]);      // reply 100 untouched
  });

  it('also updates the main messages store for the same message id', () => {
    const user = { id: 3, username: 'zenobia' };
    const msg = makeMessage({ id: 10, reactions: [] });
    useChatStore.getState().setMessages(2, [msg]);
    // Put it in thread replies too (root message reaction case)
    useChatStore.getState().setThreadReplies(5, [makeReply({ id: 10, reactions: [] })]);

    useChatStore.getState().applyReactionUpdate(10, '❤️', 'added', user, 3);

    const [mainMsg] = useChatStore.getState().messages[2];
    expect(mainMsg.reactions?.[0].emoji).toBe('❤️');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. updateThreadReply — edit content + clear rich_body
// ─────────────────────────────────────────────────────────────────────────────

describe('updateThreadReply — edit', () => {
  beforeEach(resetStore);

  it('updates content and clears rich_body on edit', () => {
    const reply = makeReply({ id: 99, content: 'old content', rich_body: { type: 'doc' } as any });
    useChatStore.getState().setThreadReplies(10, [reply]);

    useChatStore.getState().updateThreadReply(99, {
      content: 'new content',
      rich_body: null,
      is_edited: true,
    });

    const [updated] = useChatStore.getState().threadReplies[10];
    expect(updated.content).toBe('new content');
    expect(updated.rich_body).toBeNull();
    expect(updated.is_edited).toBe(true);
  });

  it('leaves other replies in the thread untouched', () => {
    const reply1 = makeReply({ id: 99, content: 'reply 1' });
    const reply2 = makeReply({ id: 100, content: 'reply 2' });
    useChatStore.getState().setThreadReplies(10, [reply1, reply2]);

    useChatStore.getState().updateThreadReply(99, { content: 'edited reply 1' });

    const replies = useChatStore.getState().threadReplies[10];
    expect(replies[0].content).toBe('edited reply 1');
    expect(replies[1].content).toBe('reply 2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. updateThreadReply — soft delete
// ─────────────────────────────────────────────────────────────────────────────

describe('updateThreadReply — delete', () => {
  beforeEach(resetStore);

  it('marks a reply as deleted', () => {
    const reply = makeReply({ id: 99, is_deleted: false });
    useChatStore.getState().setThreadReplies(10, [reply]);

    useChatStore.getState().updateThreadReply(99, { is_deleted: true, content: '' });

    const [updated] = useChatStore.getState().threadReplies[10];
    expect(updated.is_deleted).toBe(true);
    expect(updated.content).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. removeMessage — removes from main messages store (main chat delete fix)
// ─────────────────────────────────────────────────────────────────────────────

describe('removeMessage', () => {
  beforeEach(resetStore);

  it('removes the message from the chat messages array', () => {
    const msg1 = makeMessage({ id: 10 });
    const msg2 = makeMessage({ id: 11, content: 'another' });
    useChatStore.getState().setMessages(2, [msg1, msg2]);

    useChatStore.getState().removeMessage(10);

    const remaining = useChatStore.getState().messages[2];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(11);
  });

  it('is a no-op when the message id does not exist', () => {
    const msg = makeMessage({ id: 10 });
    useChatStore.getState().setMessages(2, [msg]);

    useChatStore.getState().removeMessage(999);

    expect(useChatStore.getState().messages[2]).toHaveLength(1);
  });

  it('handles an empty messages array without throwing', () => {
    useChatStore.getState().setMessages(2, []);
    expect(() => useChatStore.getState().removeMessage(10)).not.toThrow();
  });
});
