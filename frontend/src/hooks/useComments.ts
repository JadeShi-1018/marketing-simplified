'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { CommentAPI } from '@/lib/api/commentApi';
import type {
  CommentCreateRequest,
  CommentTarget,
  CommentUpdateRequest,
  CommentUploadRequest,
} from '@/types/comment';

export const commentKeys = {
  all: ['comments'] as const,
  // Keep target identity in the key so comment threads for different entity types never share cache.
  list: (target: CommentTarget) =>
    [...commentKeys.all, 'list', target.entityType, String(target.entityId)] as const,
};

export function useComments(target: CommentTarget, enabled = true) {
  const queryClient = useQueryClient();

  const commentsQuery = useQuery({
    queryKey: commentKeys.list(target),
    queryFn: () => CommentAPI.list(target),
    enabled: enabled && Boolean(target.entityType) && Boolean(target.entityId),
  });

  // Mutations invalidate the thread instead of patching optimistically because
  // permissions and preview state are derived on the backend response.
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: commentKeys.list(target),
    });

  const createComment = useMutation({
    mutationFn: (request: Omit<CommentCreateRequest, keyof CommentTarget>) =>
      CommentAPI.create({ ...target, ...request }),
    onSuccess: invalidate,
  });

  const updateComment = useMutation({
    mutationFn: ({
      commentId,
      request,
    }: {
      commentId: string;
      request: CommentUpdateRequest;
    }) => CommentAPI.update(commentId, request),
    onSuccess: invalidate,
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) => CommentAPI.remove(commentId),
    onSuccess: invalidate,
  });

  const uploadAttachment = useMutation({
    mutationFn: (request: Omit<CommentUploadRequest, keyof CommentTarget>) =>
      CommentAPI.uploadAttachment({ ...target, ...request }),
  });

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => CommentAPI.deleteAttachment(attachmentId),
  });

  return {
    commentsQuery,
    comments: commentsQuery.data ?? [],
    createComment,
    updateComment,
    deleteComment,
    uploadAttachment,
    deleteAttachment,
  };
}
