'use client';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type CommentActionsMenuProps = {
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

export default function CommentActionsMenu({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: CommentActionsMenuProps) {
  if (!canEdit && !canDelete) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem className="text-rose-600 focus:text-rose-600" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
