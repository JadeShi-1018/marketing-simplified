'use client';

import { X, MessageCircle, Users, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Chat } from '@/types/chat';
import { useAuthStore } from '@/lib/authStore';

interface DrawerChatHeaderProps {
  chat: Chat | null;
  projectId?: number | null;
  onClose: () => void;
  isLoading?: boolean;
}

export default function DrawerChatHeader({
  chat,
  projectId,
  onClose,
  isLoading = false,
}: DrawerChatHeaderProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ? Number(user.id) : null;

  // Get chat display name and info
  const getChatInfo = () => {
    if (!chat) {
      return {
        name: 'Loading...',
        subtitle: '',
        isPrivate: false,
      };
    }

    if (chat.type === 'group') {
      return {
        name: chat.name || 'Group Chat',
        subtitle: `${chat.participants?.length || 0} members`,
        isPrivate: false,
      };
    }

    // Private chat - find the other participant
    const otherParticipant = chat.participants?.find(
      (p) => p.user.id !== currentUserId
    );

    return {
      name: otherParticipant?.user?.username || 'Direct Message',
      subtitle: 'Direct Message',
      isPrivate: true,
    };
  };

  const { name, subtitle, isPrivate } = getChatInfo();

  // Navigate to full messages page
  const handleOpenFullChat = () => {
    if (!chat) return;

    const params = new URLSearchParams();
    const targetProjectId = projectId || chat.project_id;

    if (targetProjectId) {
      params.set('projectId', String(targetProjectId));
    }
    params.set('chatId', String(chat.id));

    const query = params.toString();
    router.push(query ? `/messages?${query}` : '/messages');
    onClose();
  };

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-gradient-to-r from-[#3CCED7] to-[#2AB5BD] px-4 py-3">
      {/* Top row: Icon, Title, Close button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Chat type icon */}
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            {isPrivate ? (
              <MessageCircle className="w-5 h-5 text-white" />
            ) : (
              <Users className="w-5 h-5 text-white" />
            )}
          </div>

          {/* Chat name and subtitle */}
          <div className="min-w-0 flex-1">
            {isLoading ? (
              <>
                <div className="h-5 w-32 bg-white/30 rounded animate-pulse" />
                <div className="h-3 w-20 bg-white/20 rounded animate-pulse mt-1" />
              </>
            ) : (
              <>
                <h3
                  className="font-semibold text-white truncate"
                  title={name}
                >
                  {name}
                </h3>
                {subtitle && (
                  <p className="text-xs text-white/80 truncate">{subtitle}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Open full chat button */}
          {chat && (
            <button
              onClick={handleOpenFullChat}
              className="p-2 rounded-full hover:bg-white/20 transition-colors"
              aria-label="Open full chat"
              title="Open in Messages"
            >
              <ExternalLink className="w-4 h-4 text-white" />
            </button>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
