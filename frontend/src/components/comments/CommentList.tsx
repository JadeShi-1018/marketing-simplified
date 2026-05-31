'use client';

import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  CommentAttachment,
  CommentRecord,
  CommentTarget,
  TiptapJSONContent,
} from '@/types/comment';
import CommentItem from './CommentItem';

type CommentListProps = {
  target: CommentTarget;
  comments: CommentRecord[];
  loading?: boolean;
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

function getCreatedAtTime(comment: CommentRecord) {
  const timestamp = new Date(comment.created_at).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export default function CommentList({
  target,
  comments,
  loading,
  updating,
  deleting,
  readOnlyActions,
  onUpdate,
  onDelete,
  onUploadAttachment,
  onDeleteAttachment,
}: CommentListProps) {
  const newestFirstComments = useMemo(
    () =>
      [...comments].sort(
        (first, second) =>
          getCreatedAtTime(second) - getCreatedAtTime(first),
      ),
    [comments],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={`comment-skeleton-${index}`} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (comments.length === 0) {
    return <p className="text-sm text-gray-500">No comments yet.</p>;
  }

  return (
    <ul className="space-y-5">
      {newestFirstComments.map((comment) => (
        <CommentItem
          key={comment.id}
          target={target}
          comment={comment}
          updating={updating}
          deleting={deleting}
          readOnlyActions={readOnlyActions}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onUploadAttachment={onUploadAttachment}
          onDeleteAttachment={onDeleteAttachment}
        />
      ))}
    </ul>
  );
}
