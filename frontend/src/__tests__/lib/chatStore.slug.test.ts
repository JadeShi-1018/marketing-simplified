import { useChatStore, getChatSlugById } from '@/lib/chatStore';
import type { Chat } from '@/types/chat';

const makeChat = (id: number, slug: string): Chat =>
  ({ id, slug, project_id: 1, type: 'group' } as Chat);

describe('getChatSlugById', () => {
  beforeEach(() => {
    useChatStore.setState({ chatsByProject: {} });
  });

  it('resolves a numeric chat id to its slug from loaded chats', () => {
    useChatStore.setState({
      chatsByProject: { 1: [makeChat(5, 'general-abc123'), makeChat(6, 'random-def456')] },
    });
    expect(getChatSlugById(5)).toBe('general-abc123');
    expect(getChatSlugById(6)).toBe('random-def456');
  });

  it('returns undefined when the chat is not loaded', () => {
    useChatStore.setState({ chatsByProject: { 1: [makeChat(5, 'general-abc123')] } });
    expect(getChatSlugById(999)).toBeUndefined();
  });
});
