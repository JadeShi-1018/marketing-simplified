'use client';

import { useMemo } from 'react';
import { Hash, Users, User, Check } from 'lucide-react';
import type { Chat } from '@/types/chat';
import type { ProjectMemberData } from '@/lib/api/projectApi';
import { useAuthStore } from '@/lib/authStore';

interface ForwardTargetListProps {
  chats: Chat[];
  projectMembers: ProjectMemberData[];
  selectedChatIds: number[];
  selectedUserIds: number[];
  onToggleChat: (chatId: number) => void;
  onToggleUser: (userId: number) => void;
  isLoading?: boolean;
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="px-3 flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
        <span className="text-gray-500">{icon}</span>
        <span className="flex-1 min-w-0">{title}</span>
      </div>
      <div className="mx-1">{children}</div>
    </div>
  );
}

function SelectableItem({
  label,
  icon,
  isSelected,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full px-3 py-2 flex items-center gap-2 text-sm text-left rounded-md transition-colors',
        isSelected
          ? 'bg-[#3CCED7]/10 text-[#3CCED7]'
          : 'text-gray-700 hover:bg-gray-100',
      ].join(' ')}
    >
      {icon}
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {isSelected && (
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-[#3CCED7] flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
    </button>
  );
}

export default function ForwardTargetList({
  chats,
  projectMembers,
  selectedChatIds,
  selectedUserIds,
  onToggleChat,
  onToggleUser,
  isLoading = false,
}: ForwardTargetListProps) {
  const currentUserId = useAuthStore((s) => (s.user?.id ? Number(s.user.id) : null));

  // Split chats into group and private
  const { groupChats, privateChats } = useMemo(() => {
    const group: Chat[] = [];
    const priv: Chat[] = [];
    for (const chat of chats) {
      if (chat.type === 'group') group.push(chat);
      else priv.push(chat);
    }
    return { groupChats: group, privateChats: priv };
  }, [chats]);

  // Get display name for private chat
  const getPrivateChatDisplayName = (chat: Chat): string => {
    const otherParticipant = chat.participants?.find(
      (p) => p.user?.id && p.user.id !== currentUserId
    );
    return otherParticipant?.user?.username || otherParticipant?.user?.email || 'Unknown';
  };

  // Get user IDs that already have a DM
  const dmUserIds = useMemo(() => {
    const ids = new Set<number>();
    for (const chat of privateChats) {
      for (const p of chat.participants ?? []) {
        if (p.user?.id && p.user.id !== currentUserId) {
          ids.add(p.user.id);
        }
      }
    }
    return ids;
  }, [privateChats, currentUserId]);

  // Filter out current user and users with existing DMs
  const availableMembers = useMemo(() => {
    return projectMembers.filter(
      (member) =>
        member.user.id !== currentUserId && !dmUserIds.has(member.user.id)
    );
  }, [projectMembers, currentUserId, dmUserIds]);

  if (isLoading) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="pb-2 space-y-1">
      {/* Channels Section */}
      {groupChats.length > 0 && (
        <Section title="Channels" icon={<Hash className="w-3.5 h-3.5" />}>
          <div className="space-y-0.5">
            {groupChats.map((chat) => (
              <SelectableItem
                key={chat.id}
                label={chat.name || 'Untitled'}
                icon={<Hash className="w-4 h-4 text-gray-400" />}
                isSelected={selectedChatIds.includes(chat.id)}
                onClick={() => onToggleChat(chat.id)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Direct Messages Section */}
      {privateChats.length > 0 && (
        <Section title="Direct Messages" icon={<Users className="w-3.5 h-3.5" />}>
          <div className="space-y-0.5">
            {privateChats.map((chat) => (
              <SelectableItem
                key={chat.id}
                label={getPrivateChatDisplayName(chat)}
                icon={<Users className="w-4 h-4 text-gray-400" />}
                isSelected={selectedChatIds.includes(chat.id)}
                onClick={() => onToggleChat(chat.id)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Project Members Section */}
      {availableMembers.length > 0 && (
        <Section title="Project Members" icon={<User className="w-3.5 h-3.5" />}>
          <div className="space-y-0.5">
            {availableMembers.map((member) => (
              <SelectableItem
                key={member.user.id}
                label={member.user.username || member.user.email}
                icon={<User className="w-4 h-4 text-gray-400" />}
                isSelected={selectedUserIds.includes(member.user.id)}
                onClick={() => onToggleUser(member.user.id)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Empty state */}
      {groupChats.length === 0 && privateChats.length === 0 && availableMembers.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-gray-500">
          No available targets to forward to
        </div>
      )}
    </div>
  );
}
