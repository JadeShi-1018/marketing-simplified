'use client';

import { useState } from 'react';
import ConfirmDialog from '@/components/tasks/detail/ConfirmDialog';
import type {
  CommentAttachment,
  CommentRecord,
  CommentTarget,
  TiptapJSONContent,
} from '@/types/comment';
import CommentActionsMenu from './CommentActionsMenu';
import CommentComposer from './CommentComposer';
import RichTextRenderer from './RichTextRenderer';
import {
  formatCommentTime,
  getInitials,
  getUserDisplayName,
} from './commentUtils';

type CommentItemProps = {
  target: CommentTarget;
  comment: CommentRecord;
  updating?: boolean;
  deleting?: boolean;
  readOnlyActions?: boolean;
  onUpdate: (
    commentId: string,
    payload: {
      body: TiptapJSONContent;
      mentions: number[];
      attachmentIds: string[];
    },
  ) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onUploadAttachment: (
    file: File,
    options?: { is_inline?: boolean },
  ) => Promise<CommentAttachment>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
};

export default function CommentItem({
  target,
  comment,
  updating,
  deleting,
  readOnlyActions,
  onUpdate,
  onDelete,
  onUploadAttachment,
  onDeleteAttachment,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const name = getUserDisplayName(comment.author);
  const canEdit = !readOnlyActions && comment.can_edit;
  const canDelete = !readOnlyActions && comment.can_delete;

  return (
    <li>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3CCED7] to-[#A6E661] flex items-center justify-center shrink-0 text-[11px] font-semibold text-white">
            {getInitials(name) || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-xs">
              <span className="truncate text-sm font-medium text-gray-900">{name}</span>
              <span className="shrink-0 text-gray-400">{formatCommentTime(comment.created_at)}</span>
              {comment.is_edited && (
                <span className="shrink-0 text-gray-400">edited</span>
              )}
            </p>
          </div>
          {!editing && (
            <CommentActionsMenu
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => setEditing(true)}
              onDelete={() => setConfirmingDelete(true)}
            />
          )}
        </div>

        {editing ? (
          <div className="ml-10 mt-2">
            <CommentComposer
              target={target}
              mode="edit"
              initialBody={comment.body}
              submitting={updating}
              onUploadAttachment={onUploadAttachment}
              onDeleteAttachment={onDeleteAttachment}
              onCancel={() => setEditing(false)}
              onSubmit={async (payload) => {
                await onUpdate(comment.id, payload);
                setEditing(false);
              }}
            />
          </div>
        ) : (
          <>
            <div className="ml-10 mt-1">
              <RichTextRenderer body={comment.body} />
            </div>
          </>
        )}

        <ConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title="Delete this comment?"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          busy={deleting}
          onConfirm={async () => {
            await onDelete(comment.id);
            setConfirmingDelete(false);
          }}
        />
      </div>
    </li>
  );
}
