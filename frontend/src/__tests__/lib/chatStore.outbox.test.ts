import { sendMessage, getMessage } from '@/lib/api/chatApi';
import { useChatStore } from '@/lib/chatStore';
import type { Message, OutboxEntry } from '@/types/chat';

jest.mock('@/lib/api/chatApi', () => ({
  sendMessage: jest.fn(),
  getMessage: jest.fn(),
  getUnreadCount: jest.fn(),
}));

const user = {
  id: 7,
  email: 'outbox@example.com',
  username: 'outbox-user',
};

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 42,
  chat_id: 3,
  sender: user,
  content: 'hello',
  created_at: '2026-05-27T00:00:00.000Z',
  updated_at: '2026-05-27T00:00:00.000Z',
  ...overrides,
});

const makeOutboxEntry = (overrides: Partial<OutboxEntry> = {}): OutboxEntry => ({
  clientMessageId: 'client-msg-abc',
  chatId: 3,
  content: 'queued',
  attachmentIds: [99],
  status: 'pending',
  enqueuedAt: '2026-05-27T00:00:00.000Z',
  ...overrides,
});

describe('chatStore outbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatStore.setState({
      messages: {},
      outbox: [],
      chatsByProject: {},
      unreadCounts: {},
      capturedUnreadCounts: {},
      typingUsersByChat: {},
      presenceByUserId: {},
      presenceVersionByUserId: {},
      mentionedChatIds: {},
      currentChatId: null,
      threadReplies: {},
    });
  });

  it('persists outbox entries via getOutboxDigest', () => {
    useChatStore.getState().enqueueOutbox(makeOutboxEntry());
    expect(useChatStore.getState().getOutboxDigest()).toEqual(['client-msg-abc']);
  });

  it('flushOutbox retries pending sends with client_message_id', async () => {
    const entry = makeOutboxEntry();
    useChatStore.getState().enqueueOutbox(entry);
    const serverMessage = makeMessage({
      attachments: [
        {
          id: 99,
          message: 42,
          file_type: 'document',
          file_url: '/files/note.txt',
          thumbnail_url: null,
          file_size: 5,
          file_size_display: '5 B',
          original_filename: 'note.txt',
          mime_type: 'text/plain',
          created_at: '2026-05-27T00:00:00.000Z',
        },
      ],
    });
    (sendMessage as jest.Mock).mockResolvedValue(serverMessage);

    await useChatStore.getState().flushOutbox();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: 3,
        attachment_ids: [99],
        client_message_id: 'client-msg-abc',
      }),
    );
    expect(useChatStore.getState().outbox).toHaveLength(0);
    expect(useChatStore.getState().messages[3]?.[0]?.attachments).toHaveLength(1);
  });

  it('flushOutbox retries entries stuck in "sending" after a refresh (dedupe-safe)', async () => {
    // A page refresh mid-send leaves the persisted entry in "sending"; it must
    // still be retried on reconnect (server dedupe prevents duplicates).
    useChatStore
      .getState()
      .enqueueOutbox(makeOutboxEntry({ clientMessageId: 'client-msg-stuck', status: 'sending' }));
    (sendMessage as jest.Mock).mockResolvedValue(makeMessage({ id: 77 }));

    await useChatStore.getState().flushOutbox();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ client_message_id: 'client-msg-stuck' }),
    );
    expect(useChatStore.getState().outbox).toHaveLength(0);
  });

  it('merges attachments when addMessage receives a fuller payload for an existing id', () => {
    const sparse = makeMessage({ id: 10, attachments: [] });
    const full = makeMessage({
      id: 10,
      attachments: [
        {
          id: 1,
          message: 10,
          file_type: 'image',
          file_url: '/files/pic.png',
          thumbnail_url: null,
          file_size: 10,
          file_size_display: '10 B',
          original_filename: 'pic.png',
          mime_type: 'image/png',
          created_at: '2026-05-27T00:00:00.000Z',
        },
      ],
    });

    useChatStore.getState().setMessages(3, [sparse]);
    useChatStore.getState().addMessage(3, full);

    expect(useChatStore.getState().messages[3]).toHaveLength(1);
    expect(useChatStore.getState().messages[3][0].attachments).toHaveLength(1);
  });

  it('reconcileOutboxAck hydrates committed messages and clears outbox', async () => {
    useChatStore.getState().enqueueOutbox(makeOutboxEntry());
    const hydrated = makeMessage({
      id: 77,
      attachments: [
        {
          id: 99,
          message: 77,
          file_type: 'document',
          file_url: '/files/note.txt',
          thumbnail_url: null,
          file_size: 5,
          file_size_display: '5 B',
          original_filename: 'note.txt',
          mime_type: 'text/plain',
          created_at: '2026-05-27T00:00:00.000Z',
        },
      ],
    });
    (getMessage as jest.Mock).mockResolvedValue(hydrated);

    await useChatStore.getState().reconcileOutboxAck([
      { client_message_id: 'client-msg-abc', message_id: 77 },
    ]);

    expect(getMessage).toHaveBeenCalledWith(77);
    expect(useChatStore.getState().outbox).toHaveLength(0);
    expect(useChatStore.getState().messages[3]?.[0]?.id).toBe(77);
  });

  it('reconcileOutboxAck uses the embedded message without an extra fetch', async () => {
    useChatStore.getState().enqueueOutbox(makeOutboxEntry());
    const embedded = makeMessage({ id: 88 });

    await useChatStore.getState().reconcileOutboxAck([
      { client_message_id: 'client-msg-abc', message_id: 88, message: embedded },
    ]);

    // Solution 1: body came inline on the ack — no per-id REST fetch.
    expect(getMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().outbox).toHaveLength(0);
    expect(useChatStore.getState().messages[3]?.[0]?.id).toBe(88);
  });

  it('markOutboxSent swaps the optimistic placeholder atomically without a gap', () => {
    const chatId = 3;
    // Seed the optimistic placeholder that a pending send would have rendered.
    useChatStore.setState({
      messages: {
        [chatId]: [
          makeMessage({ id: -1, client_message_id: 'client-msg-abc', content: 'optimistic' }),
        ],
      },
    });
    useChatStore.getState().enqueueOutbox(makeOutboxEntry());

    // Capture the message-list length on every state transition that follows.
    const lengths: number[] = [];
    const unsubscribe = useChatStore.subscribe((state) => {
      lengths.push(state.messages[chatId]?.length ?? 0);
    });

    const committed = makeMessage({ id: 77, client_message_id: 'client-msg-abc', content: 'committed' });
    useChatStore.getState().markOutboxSent('client-msg-abc', committed);
    unsubscribe();

    // The list must never drop to zero mid-update: no disappear-then-reappear.
    expect(lengths.length).toBeGreaterThan(0);
    expect(lengths.every((len) => len >= 1)).toBe(true);

    // Outbox cleared, optimistic replaced by the committed message exactly once.
    expect(useChatStore.getState().outbox).toHaveLength(0);
    const finalMessages = useChatStore.getState().messages[chatId] ?? [];
    expect(finalMessages).toHaveLength(1);
    expect(finalMessages[0].id).toBe(77);
    expect(finalMessages[0].content).toBe('committed');
  });
});
