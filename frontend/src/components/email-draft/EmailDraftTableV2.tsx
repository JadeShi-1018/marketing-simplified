'use client';

import { useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import EmailDraftStatusPill from './pills/EmailDraftStatusPill';
import type { EmailDraftRow, Platform } from './types';

interface Props {
  platform: Platform;
  rows: EmailDraftRow[];
  onOpen: (row: EmailDraftRow) => void;
  onEdit: (row: EmailDraftRow) => void;
  onDelete: (row: EmailDraftRow) => void;
}

const formatDate = (value?: string): string => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

const WRAP_CELL =
  'px-4 py-3 align-top break-words whitespace-normal text-left [overflow-wrap:anywhere]';
const NOWRAP_CELL = 'px-4 py-3 align-top whitespace-nowrap';

export default function EmailDraftTableV2({
  platform,
  rows,
  onOpen,
  onEdit,
  onDelete,
}: Props) {
  const [activeRow, setActiveRow] = useState<number | null>(null);

  const columns = useMemo(() => {
    if (platform === 'klaviyo') {
      return ['Name', 'Subject', 'Status', 'Updated', ''];
    }
    return ['Subject', 'Status', 'From', 'Updated', ''];
  }, [platform]);

  if (rows.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg bg-white ring-1 ring-gray-200">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          {platform === 'klaviyo' ? (
            <>
              <col className="w-[26%]" />
              <col className="w-[34%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-10" />
            </>
          ) : (
            <>
              <col className="w-[38%]" />
              <col className="w-[14%]" />
              <col className="w-[24%]" />
              <col className="w-[18%]" />
              <col className="w-10" />
            </>
          )}
        </colgroup>
        <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                className={`px-4 py-2.5 text-left ${
                  idx === columns.length - 1 ? 'w-10 text-right' : ''
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const titleField = platform === 'klaviyo' ? row.title : row.title;
            const secondaryField =
              platform === 'klaviyo' ? row.subject : row.fromName;

            return (
              <tr
                key={row.id}
                onMouseEnter={() => setActiveRow(row.id)}
                onMouseLeave={() => setActiveRow(null)}
                className="border-t border-gray-100 transition hover:bg-gray-50"
              >
                <td className={WRAP_CELL}>
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    className="block w-full break-words text-left font-medium text-gray-900 transition [overflow-wrap:anywhere] hover:text-[#3CCED7]"
                  >
                    {titleField || 'Untitled draft'}
                  </button>
                </td>
                {platform === 'klaviyo' ? (
                  <td className={`${WRAP_CELL} text-gray-600`}>
                    {secondaryField || '—'}
                  </td>
                ) : (
                  <td className={NOWRAP_CELL}>
                    <EmailDraftStatusPill
                      platform={platform}
                      status={row.status}
                    />
                  </td>
                )}
                {platform === 'klaviyo' ? (
                  <td className={NOWRAP_CELL}>
                    <EmailDraftStatusPill
                      platform={platform}
                      status={row.status}
                    />
                  </td>
                ) : (
                  <td className={`${WRAP_CELL} text-gray-600`}>
                    {secondaryField || '—'}
                  </td>
                )}
                <td className={`${NOWRAP_CELL} text-gray-500`}>
                  {formatDate(row.updatedAt || row.createdAt)}
                </td>
                <td className="px-2 py-2 text-right">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        aria-label="Row actions"
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 ${
                          activeRow === row.id ? 'opacity-100' : 'opacity-60'
                        }`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={4}
                        className="z-50 min-w-[140px] overflow-hidden rounded-lg bg-white p-1 shadow-lg ring-1 ring-gray-200"
                      >
                        <DropdownMenu.Item
                          onSelect={(e) => {
                            e.preventDefault();
                            onEdit(row);
                          }}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-gray-700 outline-none transition data-[highlighted]:bg-gray-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onSelect={(e) => {
                            e.preventDefault();
                            onDelete(row);
                          }}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-rose-600 outline-none transition data-[highlighted]:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
