'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import type { CommentUserSummary } from '@/types/comment';
import { getInitials, getUserDisplayName } from './commentUtils';

export type MentionPickerRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type MentionPickerProps = {
  items: CommentUserSummary[];
  command: (item: CommentUserSummary) => void;
};

const MentionPicker = forwardRef<MentionPickerRef, MentionPickerProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) {
          return ['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key);
        }
        if (event.key === 'ArrowUp') {
          setSelectedIndex((index) => (index + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((index) => (index + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="max-h-64 w-72 overflow-y-auto rounded-md border border-gray-200 bg-white p-1 shadow-xl">
        {items.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500">No mentionable users</div>
        ) : (
          items.map((item, index) => {
            const name = getUserDisplayName(item);
            return (
              <button
                key={item.id}
                type="button"
                className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm ${
                  index === selectedIndex ? 'bg-sky-50 text-sky-800' : 'text-gray-700'
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectItem(index);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3CCED7] to-[#A6E661] text-[10px] font-semibold text-white shadow-sm">
                  {getInitials(name) || 'U'}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{name}</span>
                  {item.email && (
                    <span className="block truncate text-xs text-gray-500">{item.email}</span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    );
  },
);

MentionPicker.displayName = 'MentionPicker';

export default MentionPicker;
