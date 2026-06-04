'use client';

import toast from 'react-hot-toast';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useComments } from '@/hooks/useComments';
import type {
  CommentAttachment,
  CommentEntityType,
  TiptapJSONContent,
} from '@/types/comment';
import CommentComposer from './CommentComposer';
import CommentList from './CommentList';
import CommentQueryProvider from './CommentQueryProvider';
import { parseCommentApiError } from './commentUtils';

type CommentSectionProps = {
  entityType: CommentEntityType;
  entityId: string | number;
  className?: string;
  readOnlyComposer?: boolean;
  queryEnabled?: boolean;
};

export default function CommentSection({
  entityType,
  entityId,
  className = '',
  readOnlyComposer = false,
  queryEnabled = true,
}: CommentSectionProps) {
  return (
    <CommentQueryProvider>
      <CommentSectionContent
        entityType={entityType}
        entityId={entityId}
        className={className}
        readOnlyComposer={readOnlyComposer}
        queryEnabled={queryEnabled}
      />
    </CommentQueryProvider>
  );
}

function CommentSectionContent({
  entityType,
  entityId,
  className = '',
  readOnlyComposer = false,
  queryEnabled = true,
}: CommentSectionProps) {
  const target = useMemo(() => ({ entityType, entityId }), [entityType, entityId]);
  const {
    comments,
    commentsQuery,
    createComment,
    updateComment,
    deleteComment,
    uploadAttachment,
    deleteAttachment,
  } = useComments(target, queryEnabled);

  const upload = async (
    file: File,
    options?: { is_inline?: boolean },
  ): Promise<CommentAttachment> =>
    uploadAttachment.mutateAsync({
      file,
      is_inline: options?.is_inline,
    });

  const deleteUploadedAttachment = async (attachmentId: string): Promise<void> => {
    try {
      await deleteAttachment.mutateAsync(attachmentId);
    } catch (error) {
      toast.error(parseCommentApiError(error, 'Failed to remove attachment'));
      throw error;
    }
  };

  const update = async (
    commentId: string,
    payload: {
      body: TiptapJSONContent;
      mentions: number[];
      attachmentIds: string[];
    },
  ) => {
    try {
      await updateComment.mutateAsync({
        commentId,
        request: {
          body: payload.body,
          body_format: 'rich_text_json',
          mentions: payload.mentions,
          attachment_ids: payload.attachmentIds,
        },
      });
    } catch (error) {
      toast.error(parseCommentApiError(error, 'Failed to update comment'));
      throw error;
    }
  };

  const remove = async (commentId: string) => {
    try {
      await deleteComment.mutateAsync(commentId);
    } catch (error) {
      toast.error(parseCommentApiError(error, 'Failed to delete comment'));
      throw error;
    }
  };

  return (
    <section className={`rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-900">
          Activity
          {comments.length > 0 && (
            <span className="ml-2 text-[11px] font-medium normal-case text-gray-400">
              {comments.length}
            </span>
          )}
        </h2>
        {commentsQuery.isError && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void commentsQuery.refetch()}
          >
            Retry
          </Button>
        )}
      </div>

      {commentsQuery.isError ? (
        <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {parseCommentApiError(commentsQuery.error, 'Failed to load comments')}
        </p>
      ) : null}

      {!readOnlyComposer && !commentsQuery.isError && (
        <div className="mb-5">
          <CommentComposer
            target={target}
            submitting={createComment.isPending}
            onUploadAttachment={upload}
            onDeleteAttachment={deleteUploadedAttachment}
            onSubmit={async (payload) => {
              try {
                await createComment.mutateAsync({
                  body: payload.body,
                  body_format: 'rich_text_json',
                  mentions: payload.mentions,
                  attachment_ids: payload.attachmentIds,
                });
              } catch (error) {
                toast.error(parseCommentApiError(error, 'Failed to add comment'));
                throw error;
              }
            }}
          />
        </div>
      )}

      <CommentList
        target={target}
        comments={comments}
        loading={commentsQuery.isLoading}
        updating={updateComment.isPending}
        deleting={deleteComment.isPending}
        readOnlyActions={readOnlyComposer}
        onUpdate={update}
        onDelete={remove}
        onUploadAttachment={upload}
        onDeleteAttachment={deleteUploadedAttachment}
      />
    </section>
  );
}
