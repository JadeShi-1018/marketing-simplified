'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { ProjectAPI } from '@/lib/api/projectApi';
import type { ParticipantSelectorProps, ProjectMember } from '@/types/chat';

export default function ParticipantSelector({
  projectId,
  selectedIds,
  onSelect,
  maxSelection,
  currentUserId,
  allowSolo = false,
}: ParticipantSelectorProps) {
  const [members, setMembers] = useState<Pick<ProjectMember, 'id' | 'role' | 'user'>[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setSearchQuery('');
  }, [projectId]);

  useEffect(() => {
    const fetchMembers = async () => {
      if (!projectId) {
        setMembers([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setLoadError(null);
        const rows = await ProjectAPI.getAllProjectMembers(projectId);
        const mapped: Pick<ProjectMember, 'id' | 'role' | 'user'>[] = rows.map((row) => ({
          id: row.id,
          role: row.role,
          user: {
            id: Number(row.user.id),
            username: row.user.username ?? row.user.email ?? 'Unknown',
            email: row.user.email ?? '',
          },
        }));

        const filteredMembers = mapped.filter(
          (member) => Number(member.user.id) !== Number(currentUserId),
        );

        setMembers(filteredMembers);
      } catch (error) {
        console.error('Error fetching project members:', error);
        setLoadError('Could not load project members');
        setMembers([]);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchMembers();
  }, [projectId, currentUserId]);

  const filteredMembers = members.filter((member) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      member.user.username?.toLowerCase().includes(query) ||
      member.user.email?.toLowerCase().includes(query)
    );
  });

  const handleToggle = (userId: number) => {
    if (selectedIds.includes(userId)) {
      onSelect(selectedIds.filter((id) => id !== userId));
    } else if (maxSelection && selectedIds.length >= maxSelection) {
      onSelect([userId]);
    } else {
      onSelect([...selectedIds, userId]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search members..."
          className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3CCED7] focus:border-transparent text-sm"
        />
      </div>

      <div className="task-tab-scrollbar border border-gray-300 rounded-lg max-h-60 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3CCED7]" />
          </div>
        ) : loadError ? (
          <div className="text-center py-8 text-red-600 text-sm px-4">{loadError}</div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm px-4">
            {searchQuery.trim()
              ? 'No members match your search'
              : allowSolo
                ? 'No other members in this project yet. You can still create the channel solo, or invite teammates from Project Settings.'
                : 'No other team members in this project. Invite someone from Project Settings to start a chat.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredMembers.map((member) => (
              <label
                key={member.id}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(member.user.id)}
                  onChange={() => handleToggle(member.user.id)}
                  className="w-4 h-4 text-[#3CCED7] border-gray-300 rounded focus:ring-[#3CCED7]"
                />

                <div className="w-8 h-8 rounded-full bg-[#3CCED7] text-white flex items-center justify-center font-medium text-sm flex-shrink-0">
                  {member.user.username?.charAt(0)?.toUpperCase() || '?'}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {member.user.username || 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{member.user.email}</p>
                </div>

                {member.role && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded flex-shrink-0">
                    {member.role}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
