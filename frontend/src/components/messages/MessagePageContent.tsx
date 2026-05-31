'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Bookmark, MessageSquare, PanelLeftOpen, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/authStore';
import { useChatStore } from '@/lib/chatStore';
import { useChatData } from '@/hooks/useChatData';
import { useProjectMemberRoles } from '@/hooks/useProjectMemberRoles';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { useProjectStore } from '@/lib/projectStore';
import ChatWindow from '@/components/chat/ChatWindow';
import CreateChatDialog from '@/components/chat/CreateChatDialog';
import SlackMessagesLayout from '@/components/messages/SlackMessagesLayout';
import SearchPanel from '@/components/chat/search/SearchPanel';
import SavedItemsPanel from '@/components/chat/SavedItemsPanel';
import ChatCommandPalette from '@/components/chat/ChatCommandPalette';
import type { MessageSearchResult } from '@/types/chat';

const MESSAGES_MOBILE_QUERY = '(max-width: 767px)';

const isMessagesMobileViewport = () =>
  typeof window !== 'undefined' && window.matchMedia(MESSAGES_MOBILE_QUERY).matches;

export default function MessagePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const activeProject = useProjectStore((s) => s.activeProject);
  const hasProjectStoreHydrated = useProjectStore((s) => s.hasHydrated);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreateChannelDialogOpen, setIsCreateChannelDialogOpen] = useState(false);
  const [isConversationDrawerOpen, setIsConversationDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSavedOpen, setIsSavedOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Chat store state
  const currentChatId = useChatStore(state => state.currentChatId);
  const setCurrentChat = useChatStore(state => state.setCurrentChat);
  const chatsByProject = useChatStore(state => state.chatsByProject);
  // Get chats for the selected project only (independent from widget)
  const chats = useMemo(
    () => (selectedProjectId ? (chatsByProject[selectedProjectId] || []) : []),
    [chatsByProject, selectedProjectId]
  );

  const { roleByUserId } = useProjectMemberRoles(selectedProjectId);
  const { members: projectMembers, isLoading: isLoadingMembers } = useProjectMembers(selectedProjectId);
  
  // Fetch chats for selected project
  const { fetchChats, createNewChat, isLoading } = useChatData({
    projectId: selectedProjectId || undefined,
    autoFetch: false,
  });
  
  // Real-time updates are handled by useNotificationSSE (mounted in ChatWidget).
  // When a chat SSE event arrives, chatStore.lastChatActivity is bumped and the
  // widget's fetchChats runs.  Here we only need to fetch on project change.
  const lastChatActivity = useChatStore(state => state.lastChatActivity);
  const hasFetchedRef = useRef<string | null>(null);

  // Global Cmd/Ctrl-K → open conversation switcher
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        // Don't steal from Tiptap composer
        if ((e.target as HTMLElement)?.closest?.('.ProseMirror')) return;
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Re-fetch the chat list when the project changes or an SSE chat event arrives.
  useEffect(() => {
    if (isAuthenticated && selectedProjectId) {
      const fetchKey = `${selectedProjectId}-${lastChatActivity}`;
      if (hasFetchedRef.current !== fetchKey) {
        hasFetchedRef.current = fetchKey;
        fetchChats();
      }
    }
  }, [isAuthenticated, selectedProjectId, lastChatActivity, fetchChats]);

  useEffect(() => {
    const projectIdParam = searchParams.get('projectId');
    const chatIdParam = searchParams.get('chatId');
    const projectIdFromQuery = projectIdParam ? Number(projectIdParam) : NaN;
    const chatIdFromQuery = chatIdParam ? Number(chatIdParam) : NaN;

    if (
      Number.isFinite(projectIdFromQuery) &&
      projectIdFromQuery > 0 &&
      projectIdFromQuery !== selectedProjectId
    ) {
      setSelectedProjectId(projectIdFromQuery);
    } else if (
      !Number.isFinite(projectIdFromQuery) &&
      activeProject?.id &&
      activeProject.id !== selectedProjectId
    ) {
      setSelectedProjectId(activeProject.id);
    }

    if (
      Number.isFinite(chatIdFromQuery) &&
      chatIdFromQuery > 0 &&
      chatIdFromQuery !== useChatStore.getState().currentChatId
    ) {
      setCurrentChat(chatIdFromQuery);
    }
  }, [searchParams, selectedProjectId, setCurrentChat, activeProject?.id]);

  const replaceMessagesQuery = useCallback(
    (next: { projectId?: number | null; chatId?: number | null; messageId?: number | null }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.projectId === null) params.delete('projectId');
      else if (typeof next.projectId === 'number' && Number.isFinite(next.projectId) && next.projectId > 0) {
        params.set('projectId', String(next.projectId));
      }

      if (next.chatId === null) params.delete('chatId');
      else if (typeof next.chatId === 'number' && Number.isFinite(next.chatId) && next.chatId > 0) {
        params.set('chatId', String(next.chatId));
      }

      if (next.messageId === null) params.delete('messageId');
      else if (typeof next.messageId === 'number' && Number.isFinite(next.messageId) && next.messageId > 0) {
        params.set('messageId', String(next.messageId));
      }

      const query = params.toString();
      router.replace(query ? `/messages?${query}` : '/messages');
    },
    [router, searchParams]
  );
  

  // Get current chat from store
  const currentChat = chats.find(chat => chat.id === currentChatId);
  
  // Filter chats by search query
  const isSearchingConversations = searchQuery.trim().length > 0;
  const filteredChats = chats.filter(chat => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    
    // Search by chat name
    if (chat.name?.toLowerCase().includes(query)) return true;
    
    // Search by participant names
    const participantMatch = chat.participants.some(p => 
      p.user.username?.toLowerCase().includes(query) ||
      p.user.email?.toLowerCase().includes(query)
    );
    if (participantMatch) return true;
    
    // Search by last message content
    if (chat.last_message?.content.toLowerCase().includes(query)) return true;
    
    return false;
  });

  const projectIdFromQuery = searchParams.get('projectId');
  const parsedProjectIdFromQuery = projectIdFromQuery ? Number(projectIdFromQuery) : NaN;
  const hasProjectCandidate =
    (Number.isFinite(parsedProjectIdFromQuery) && parsedProjectIdFromQuery > 0) ||
    Boolean(activeProject?.id);
  const projectSelectionLoading =
    selectedProjectId === null && (!hasProjectStoreHydrated || hasProjectCandidate);
  
  const handleSelectChat = (chatId: number) => {
    setIsSearchOpen(false);
    setIsSavedOpen(false);
    // Clicking the already-open chat closes it and returns to the list
    if (chatId === currentChatId) {
      setCurrentChat(null);
      replaceMessagesQuery({ projectId: selectedProjectId, chatId: null, messageId: null });
      return;
    }
    setCurrentChat(chatId);
    replaceMessagesQuery({
      projectId: selectedProjectId,
      chatId,
      messageId: null,
    });
  };
  
  const handleBackToList = () => {
    if (isMessagesMobileViewport()) {
      setIsConversationDrawerOpen(true);
    }
  };
  
  const handleCreateChat = () => {
    setIsCreateDialogOpen(true);
  };

  const handleCreateChannel = () => {
    setIsCreateChannelDialogOpen(true);
  };
  
  const handleChatCreated = (chatId: number) => {
    setIsCreateDialogOpen(false);
    setCurrentChat(chatId);
    replaceMessagesQuery({ projectId: selectedProjectId, chatId, messageId: null });
    // Refresh chats to include the new one
    fetchChats();
  };

  const handleChannelCreated = (chatId: number) => {
    setIsCreateChannelDialogOpen(false);
    setCurrentChat(chatId);
    replaceMessagesQuery({ projectId: selectedProjectId, chatId, messageId: null });
    fetchChats();
  };

  const handleStartDM = useCallback(async (targetUserId: number) => {
    if (!selectedProjectId) return;

    // Check if a DM thread already exists with this user
    const existingChat = chats.find(
      (c) =>
        c.type === 'private' &&
        c.participants?.some((p) => p.user.id === targetUserId)
    );

    if (existingChat) {
      setCurrentChat(existingChat.id);
      replaceMessagesQuery({ projectId: selectedProjectId, chatId: existingChat.id, messageId: null });
      return;
    }

    try {
      const newChat = await createNewChat({
        type: 'private',
        project_id: selectedProjectId,
        participant_ids: [targetUserId],
      });
      setCurrentChat(newChat.id);
      replaceMessagesQuery({ projectId: selectedProjectId, chatId: newChat.id, messageId: null });
    } catch {
      // createNewChat already shows a toast on error
    }
  }, [selectedProjectId, chats, createNewChat, setCurrentChat, replaceMessagesQuery]);

  // When the user clicks a search result: navigate to that chat + message
  const handleSelectSearchResult = useCallback(
    (result: MessageSearchResult) => {
      setIsSearchOpen(false);
      // Switch project if the result is from a different one
      if (result.project_id && result.project_id !== selectedProjectId) {
        setSelectedProjectId(result.project_id);
      }
      setCurrentChat(result.chat_id);
      replaceMessagesQuery({
        projectId: result.project_id ?? selectedProjectId,
        chatId: result.chat_id,
        messageId: result.id,
      });
    },
    [selectedProjectId, setCurrentChat, replaceMessagesQuery]
  );

  // Sidebar chat-list filter input (mobile drawer only).
  const renderSearchInput = (testId: string) => (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        placeholder="Search conversations…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full rounded-md border border-gray-200 py-1.5 pl-10 pr-4 text-sm focus:border-[#3CCED7] focus:outline-none focus:ring-2 focus:ring-[#3CCED7]/30"
        data-testid={testId}
        aria-label="Search conversations"
      />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-2 sm:px-6 sm:py-3"
        data-testid="messages-header"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
          <MessageSquare className="h-5 w-5 shrink-0 text-[#3CCED7]" />
          <h1 className="shrink-0 text-lg font-semibold text-gray-900">Messages</h1>
          {activeProject?.name && (
            <span className="min-w-0 truncate text-sm text-gray-400 sm:ml-2">· {activeProject.name}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsConversationDrawerOpen(true)}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 md:hidden"
          aria-label="Open conversations"
          title="Open conversations"
        >
          <PanelLeftOpen className="h-4 w-4" />
          <span className="hidden min-[380px]:inline">Chats</span>
        </button>
        <div className="ml-auto hidden items-center gap-1 md:flex">
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(true);
              setIsSavedOpen(false);
            }}
            className="rounded-md p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            data-testid="messages-search"
            aria-label="Search messages"
            title="Search messages"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSavedOpen((v) => !v);
              setIsSearchOpen(false);
            }}
            className={[
              'rounded-md p-2 transition',
              isSavedOpen
                ? 'bg-teal-50 text-teal-700'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600',
            ].join(' ')}
            data-testid="messages-saved"
            aria-label="Saved messages"
            aria-pressed={isSavedOpen}
            title="Saved messages"
          >
            <Bookmark className="h-4 w-4" />
          </button>
        </div>
      </div>

      <SlackMessagesLayout
        selectedProjectId={selectedProjectId}
        chats={filteredChats}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onCreateChat={handleCreateChat}
        onCreateChannel={handleCreateChannel}
        roleByUserId={roleByUserId}
        isLoadingChats={isLoading}
        projectMembers={projectMembers}
        isLoadingMembers={isLoadingMembers}
        onStartDM={handleStartDM}
        mobileSidebarOpen={isConversationDrawerOpen}
        onMobileSidebarOpenChange={setIsConversationDrawerOpen}
        mobileSidebarHeader={renderSearchInput('messages-mobile-search')}
        isSearchActive={isSearchingConversations}
        chatListEmptyState={
          selectedProjectId ? (
            <div className="p-6 text-sm text-gray-500">No chats yet</div>
          ) : projectSelectionLoading ? null : (
            <div className="flex items-center justify-center p-6 text-center">
              <div>
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Select a project to view chats</p>
              </div>
            </div>
          )
        }
        chatPanel={
          isSearchOpen ? (
            <div className="h-full">
              <SearchPanel
                projectId={selectedProjectId}
                chats={chats}
                onSelectResult={handleSelectSearchResult}
                onClose={() => setIsSearchOpen(false)}
              />
            </div>
          ) : isSavedOpen ? (
            <div className="h-full">
              <SavedItemsPanel
                onClose={() => setIsSavedOpen(false)}
                onJumpToMessage={(msgId, chatId, parentMsgId) => {
                  // Navigate to the chat — same URL flow as cross-chat jumps.
                  // The destination ChatWindow reads `messageId` + optional
                  // `threadMessageId` and opens the thread/highlights the reply.
                  setIsSavedOpen(false);
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('chatId', String(chatId));
                  if (parentMsgId) {
                    params.set('messageId', String(parentMsgId));
                    params.set('threadMessageId', String(msgId));
                  } else {
                    params.set('messageId', String(msgId));
                    params.delete('threadMessageId');
                  }
                  setCurrentChat(chatId);
                  router.push(`/messages?${params.toString()}`);
                }}
              />
            </div>
          ) : projectSelectionLoading ? (
            <div className="flex-1" />
          ) : !selectedProjectId ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <MessageSquare className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-700 mb-2">
                  Select a project to start
                </h3>
                <p className="text-gray-500 text-sm max-w-sm">
                  Select a project from the workspace navigation to view and manage team conversations.
                </p>
              </div>
            </div>
          ) : !currentChat ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <MessageSquare className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-700 mb-2">
                  Select a conversation
                </h3>
                <p className="text-gray-500 text-sm max-w-sm">
                  Choose a chat from the list or start a new conversation with your team members.
                </p>
                <button
                  type="button"
                  onClick={() => setIsConversationDrawerOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#3CCED7] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#2AB5BD] md:hidden"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                  Browse conversations
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full" data-testid="messages-chat-window">
              <ChatWindow
                chat={currentChat}
                onBack={handleBackToList}
                roleByUserId={roleByUserId}
                hideBackOnDesktop
              />
            </div>
          )
        }
      />
      
      {/* Create Chat Dialog */}
      {selectedProjectId && (
        <>
          <CreateChatDialog
            isOpen={isCreateDialogOpen}
            onClose={() => setIsCreateDialogOpen(false)}
            projectId={String(selectedProjectId)}
            onChatCreated={handleChatCreated}
          />
          <CreateChatDialog
            isOpen={isCreateChannelDialogOpen}
            onClose={() => setIsCreateChannelDialogOpen(false)}
            projectId={String(selectedProjectId)}
            onChatCreated={handleChannelCreated}
            variant="channel"
          />
        </>
      )}

      {/* Cmd/Ctrl-K conversation switcher */}
      <ChatCommandPalette
        isOpen={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        projectId={selectedProjectId}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
      />
    </div>
  );
}
