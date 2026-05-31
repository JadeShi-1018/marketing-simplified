'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const BRAND_BUTTON_CLASS =
  'bg-gradient-to-r from-[#3CCED7] to-[#A6E661] text-white shadow-sm hover:opacity-95';
import type { Chat } from '@/types/chat';
import type { ProjectMemberData } from '@/lib/api/projectApi';
import ForwardTargetList from './ForwardTargetList';

interface ForwardMessageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (targetChatIds: number[], targetUserIds: number[]) => void;
  messageCount: number;  // Number of messages to forward
  selectedProjectId: number | null;
  chats: Chat[];
  projectMembers: ProjectMemberData[];
  isLoading?: boolean;
}

export default function ForwardMessageSheet({
  open,
  onOpenChange,
  onConfirm,
  messageCount,
  selectedProjectId,
  chats,
  projectMembers,
  isLoading = false,
}: ForwardMessageSheetProps) {
  const [selectedChatIds, setSelectedChatIds] = useState<number[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);

  // Handle animation states
  useEffect(() => {
    if (open) {
      setIsAnimating(true);
      // Reset selections when opening
      setSelectedChatIds([]);
      setSelectedUserIds([]);
      setSearchQuery('');
    }
  }, [open]);

  const handleToggleChat = (chatId: number) => {
    setSelectedChatIds((prev) =>
      prev.includes(chatId)
        ? prev.filter((id) => id !== chatId)
        : [...prev, chatId]
    );
  };

  const handleToggleUser = (userId: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleConfirm = () => {
    if (selectedChatIds.length === 0 && selectedUserIds.length === 0) {
      return; // Nothing selected
    }
    onConfirm(selectedChatIds, selectedUserIds);
    handleClose();
  };

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(() => onOpenChange(false), 300); // Wait for animation
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  // Filter chats and members based on search query
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;

    const query = searchQuery.toLowerCase();
    return chats.filter((chat) => {
      // Search by chat name
      if (chat.name?.toLowerCase().includes(query)) return true;

      // Search by participant names
      const participantMatch = chat.participants.some(
        (p) =>
          p.user.username?.toLowerCase().includes(query) ||
          p.user.email?.toLowerCase().includes(query)
      );
      if (participantMatch) return true;

      return false;
    });
  }, [chats, searchQuery]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return projectMembers;

    const query = searchQuery.toLowerCase();
    return projectMembers.filter(
      (member) =>
        member.user.username?.toLowerCase().includes(query) ||
        member.user.email?.toLowerCase().includes(query)
    );
  }, [projectMembers, searchQuery]);

  const totalSelected = selectedChatIds.length + selectedUserIds.length;

  if (!open && !isAnimating) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          'absolute inset-0 bg-black/30 z-[100] transition-opacity duration-300',
          isAnimating && open ? 'opacity-100' : 'opacity-0'
        )}
        onClick={handleOverlayClick}
      />

      {/* Sheet */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 z-[101]',
          'w-full rounded-t-2xl bg-white border-t border-gray-200',
          'shadow-lg flex flex-col',
          'transition-transform duration-300 ease-out',
          'max-h-[80vh]',
          isAnimating && open ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Forward {messageCount > 1 ? `${messageCount} Messages` : 'Message'}
            </h2>
            <button
              onClick={handleClose}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search chats or members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3CCED7] focus:border-transparent"
            />
          </div>
        </div>

        {/* Target List - Scrollable */}
        <div className="task-tab-scrollbar flex-1 overflow-y-auto px-3 py-4 min-h-0">
          <ForwardTargetList
            chats={filteredChats}
            projectMembers={filteredMembers}
            selectedChatIds={selectedChatIds}
            selectedUserIds={selectedUserIds}
            onToggleChat={handleToggleChat}
            onToggleUser={handleToggleUser}
            isLoading={isLoading}
          />
        </div>

        {/* Footer - Action Buttons */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200">
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 py-3 px-4 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={totalSelected === 0}
              className={cn(
                'flex-1 py-3 px-4 rounded-lg font-medium transition-all',
                totalSelected > 0
                  ? BRAND_BUTTON_CLASS
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              )}
            >
              {totalSelected > 0
                ? `Forward to ${totalSelected} ${totalSelected === 1 ? 'target' : 'targets'}`
                : 'Select targets'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
