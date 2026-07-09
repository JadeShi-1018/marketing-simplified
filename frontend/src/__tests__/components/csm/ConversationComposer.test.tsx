import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationComposer } from '@/components/csm/conversations/ConversationComposer';
import CsmConversationAPI, { QuickReplyTemplateAPI } from '@/lib/api/csmConversationApi';
import type { QuickReplyTemplate } from '@/types/csmConversation';

jest.mock('@/lib/api/csmConversationApi', () => ({
  __esModule: true,
  default: { sendMessage: jest.fn() },
  QuickReplyTemplateAPI: { list: jest.fn() },
}));

// The composer only orchestrates the Tiptap editor (reading text/JSON out of it
// and calling its commands) — it doesn't need a real ProseMirror instance to
// verify that behaviour, so the editor itself is faked here.
let mockEditor: {
  getText: jest.Mock;
  getJSON: jest.Mock;
  isEmpty: boolean;
  isActive: jest.Mock;
  commands: {
    clearContent: jest.Mock;
    setContent: jest.Mock;
    insertContent: jest.Mock;
    focus: jest.Mock;
  };
  chain: jest.Mock;
};

jest.mock('@tiptap/react', () => ({
  useEditor: jest.fn(() => mockEditor),
  EditorContent: () => null,
}));

const mockedList = QuickReplyTemplateAPI.list as jest.Mock;
const mockedSendMessage = CsmConversationAPI.sendMessage as jest.Mock;

function makeTemplate(overrides: Partial<QuickReplyTemplate>): QuickReplyTemplate {
  return {
    id: 1,
    slug: 'greeting',
    organisation: 5,
    team: null,
    title: 'Greeting',
    content: 'Hello there, how can I help?',
    rich_body: null,
    tags: ['greeting'],
    is_active: true,
    created_by: 1,
    created_by_name: 'Agent',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ConversationComposer — quick reply template insertion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    interface Chainable {
      focus: jest.Mock<Chainable, []>;
      toggleBold: jest.Mock<Chainable, []>;
      toggleItalic: jest.Mock<Chainable, []>;
      toggleBulletList: jest.Mock<Chainable, []>;
      toggleOrderedList: jest.Mock<Chainable, []>;
      run: jest.Mock;
    }
    const chainable: Chainable = {
      focus: jest.fn(() => chainable),
      toggleBold: jest.fn(() => chainable),
      toggleItalic: jest.fn(() => chainable),
      toggleBulletList: jest.fn(() => chainable),
      toggleOrderedList: jest.fn(() => chainable),
      run: jest.fn(),
    };
    mockEditor = {
      getText: jest.fn(() => ''),
      getJSON: jest.fn(() => ({ type: 'doc', content: [] })),
      isEmpty: true,
      isActive: jest.fn(() => false),
      commands: {
        clearContent: jest.fn(),
        setContent: jest.fn(),
        insertContent: jest.fn(),
        focus: jest.fn(),
      },
      chain: jest.fn(() => chainable),
    };
  });

  const openTemplatePicker = async () => {
    render(<ConversationComposer conversationId={42} organisationId={5} />);
    fireEvent.click(screen.getByTitle('Insert quick reply template'));
    await screen.findByText('Greeting');
  };

  test('inserting a plain-text template writes into the editor but does not send the message', async () => {
    mockedList.mockResolvedValue([makeTemplate({ content: 'Hello there', rich_body: null })]);
    await openTemplatePicker();

    fireEvent.click(screen.getByText('Greeting').closest('button')!);

    expect(mockEditor.commands.insertContent).toHaveBeenCalledWith('Hello there');
    expect(mockEditor.commands.setContent).not.toHaveBeenCalled();
    expect(mockedSendMessage).not.toHaveBeenCalled();
    // Single action: the picker closes itself once a template is chosen.
    expect(screen.queryByText('Greeting')).not.toBeInTheDocument();
  });

  test('inserting a rich-text template replaces editor content via setContent, not insertContent', async () => {
    const richBody = { type: 'doc', content: [{ type: 'paragraph' }] };
    mockedList.mockResolvedValue([makeTemplate({ rich_body: richBody })]);
    await openTemplatePicker();

    fireEvent.click(screen.getByText('Greeting').closest('button')!);

    expect(mockEditor.commands.setContent).toHaveBeenCalledWith(richBody);
    expect(mockEditor.commands.insertContent).not.toHaveBeenCalled();
    expect(mockedSendMessage).not.toHaveBeenCalled();
  });

  test('the agent can edit the inserted text before an explicit Send click dispatches it', async () => {
    mockedList.mockResolvedValue([makeTemplate({ content: 'Hello there', rich_body: null })]);
    mockedSendMessage.mockResolvedValue({ id: 999, content: 'Hello there, edited', rich_body: null });
    await openTemplatePicker();

    fireEvent.click(screen.getByText('Greeting').closest('button')!);
    expect(mockedSendMessage).not.toHaveBeenCalled();

    // Simulate the agent having edited the inserted text before sending.
    mockEditor.getText.mockReturnValue('Hello there, edited');

    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledTimes(1));
    const [conversationId, payload] = mockedSendMessage.mock.calls[0];
    expect(conversationId).toBe(42);
    expect(payload.content).toBe('Hello there, edited');
  });
});
