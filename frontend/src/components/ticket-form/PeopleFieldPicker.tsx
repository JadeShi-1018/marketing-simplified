'use client';

import type { ProjectMemberStub } from '@/types/ticketForm';

interface Props {
  members: ProjectMemberStub[];
  allowMultiple: boolean;
  selectedIds: number[];
  disabled?: boolean;
  onChange: (ids: number[]) => void;
}

export default function PeopleFieldPicker({
  members,
  allowMultiple,
  selectedIds,
  disabled,
  onChange,
}: Props) {
  if (members.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">No project members available.</p>
    );
  }

  if (allowMultiple) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-gray-200 p-3">
        {members.map((member) => {
          const checked = selectedIds.includes(member.id);
          return (
            <label key={member.id} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => {
                  const next = checked
                    ? selectedIds.filter((id) => id !== member.id)
                    : [...selectedIds, member.id];
                  onChange(next);
                }}
              />
              <span>{member.name}</span>
              {member.email && (
                <span className="text-xs text-gray-400">({member.email})</span>
              )}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <select
      value={selectedIds[0] ? String(selectedIds[0]) : ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? [Number(e.target.value)] : [])}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
    >
      <option value="">Select a person...</option>
      {members.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name}
          {member.email ? ` (${member.email})` : ''}
        </option>
      ))}
    </select>
  );
}
