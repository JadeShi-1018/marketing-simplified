'use client';

import { useEffect, useMemo } from 'react';
import { Hash, MessageSquare } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useChatStore } from '@/lib/chatStore';
import { useAuthStore } from '@/lib/authStore';
import type { Chat } from '@/types/chat';

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
  currentChatId: number | null;
  onSelectChat: (chatId: number) => void;
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
];
function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

function ChatLabel({ chat, currentUserId }: { chat: Chat; currentUserId?: number }) {
  if (chat.type === 'group') {
    return (
      <span className="flex items-center gap-1.5">
        <Hash className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        {chat.name || 'Group Chat'}
      </span>
    );
  }
  const other = chat.participants?.find((p) => p.user.id !== currentUserId)?.user;
  const name = other?.username || other?.email || 'Direct Message';
  const initials = name[0]?.toUpperCase() ?? '?';
  return (
    <span className="flex items-center gap-1.5">
      {other?.avatar ? (
        <img src={other.avatar} alt={name} className="h-4 w-4 rounded-full object-cover" />
      ) : (
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${avatarColor(other?.id ?? 0)}`}>
          {initials}
        </span>
      )}
      {name}
    </span>
  );
}

export default function ChatCommandPalette({
  isOpen,
  onOpenChange,
  projectId,
  currentChatId,
  onSelectChat,
}: Props) {
  const chatsByProject = useChatStore((s) => s.chatsByProject);
  const user = useAuthStore((s) => s.user);

  const allChats = useMemo(
    () => (projectId ? (chatsByProject[projectId] ?? []) : []),
    [chatsByProject, projectId]
  );

  // Recent chats: sorted by updated_at desc, up to 8
  const recentChats = useMemo(
    () =>
      [...allChats]
        .sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime())
        .slice(0, 8),
    [allChats]
  );

  const handleSelect = (chatId: number) => {
    onOpenChange(false);
    onSelectChat(chatId);
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a conversation…" />
      <CommandList>
        <CommandEmpty>No conversations found.</CommandEmpty>

        {recentChats.length > 0 && (
          <CommandGroup heading="Recent">
            {recentChats.map((chat) => (
              <CommandItem
                key={chat.id}
                value={`recent-${chat.id}-${chat.name ?? ''}-${chat.participants?.map((p) => p.user.username).join(' ')}`}
                onSelect={() => handleSelect(chat.id)}
                className="cursor-pointer"
              >
                <ChatLabel chat={chat} currentUserId={user?.id} />
                {chat.unread_count > 0 && (
                  <span className="ml-auto flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#3CCED7] px-1 text-[10px] font-semibold text-white">
                    {chat.unread_count > 99 ? '99+' : chat.unread_count}
                  </span>
                )}
                {chat.last_message && (
                  <span className="ml-2 max-w-[180px] truncate text-xs text-gray-400">
                    {chat.last_message.content?.slice(0, 60)}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {allChats.length > recentChats.length && (
          <CommandGroup heading="All conversations">
            {allChats
              .filter((c) => !recentChats.some((r) => r.id === c.id))
              .map((chat) => (
                <CommandItem
                  key={chat.id}
                  value={`all-${chat.id}-${chat.name ?? ''}-${chat.participants?.map((p) => p.user.username).join(' ')}`}
                  onSelect={() => handleSelect(chat.id)}
                  className="cursor-pointer"
                >
                  <ChatLabel chat={chat} currentUserId={user?.id} />
                </CommandItem>
              ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
