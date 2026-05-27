import api from '@/lib/api';
import type {
  CommentAttachment,
  CommentAttachmentPreview,
  CommentCreateRequest,
  CommentMentionSearchParams,
  CommentRecord,
  CommentTarget,
  CommentUpdateRequest,
  CommentUploadRequest,
  CommentUserSummary,
} from '@/types/comment';

const targetParams = ({ entityType, entityId }: CommentTarget) => ({
  entity_type: entityType,
  entity_id: String(entityId),
});

export const CommentAPI = {
  // Comments are entity-agnostic; every list/create request carries the parent target.
  list: async (target: CommentTarget): Promise<CommentRecord[]> => {
    const response = await api.get('/api/comments/', {
      params: targetParams(target),
    });
    return Array.isArray(response.data) ? response.data : response.data?.results || [];
  },

  create: async (request: CommentCreateRequest): Promise<CommentRecord> => {
    const response = await api.post('/api/comments/', {
      entity_type: request.entityType,
      entity_id: String(request.entityId),
      body: request.body,
      body_format: request.body_format ?? 'rich_text_json',
      mentions: request.mentions ?? [],
      attachment_ids: request.attachment_ids ?? [],
    });
    return response.data as CommentRecord;
  },

  update: async (
    commentId: string,
    request: CommentUpdateRequest,
  ): Promise<CommentRecord> => {
    const response = await api.patch(`/api/comments/${commentId}/`, request);
    return response.data as CommentRecord;
  },

  remove: async (commentId: string): Promise<void> => {
    await api.delete(`/api/comments/${commentId}/`);
  },

  // Uploads are staged first, then bound to a comment by inline commentMedia IDs on submit.
  uploadAttachment: async ({
    entityType,
    entityId,
    file,
    is_inline,
    metadata,
  }: CommentUploadRequest): Promise<CommentAttachment> => {
    const formData = new FormData();
    formData.append('entity_type', entityType);
    formData.append('entity_id', String(entityId));
    formData.append('file', file);
    if (typeof is_inline === 'boolean') {
      formData.append('is_inline', String(is_inline));
    }
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }
    const response = await api.post('/api/attachments/', formData);
    return response.data as CommentAttachment;
  },

  // Preview generation is asynchronous; callers should handle pending/processing states.
  getAttachmentPreview: async (attachmentId: string): Promise<CommentAttachmentPreview> => {
    const response = await api.get(`/api/attachments/${attachmentId}/preview/`);
    return response.data as CommentAttachmentPreview;
  },

  deleteAttachment: async (attachmentId: string): Promise<void> => {
    await api.delete(`/api/attachments/${attachmentId}/`);
  },

  searchMentionUsers: async ({
    q,
    ...target
  }: CommentMentionSearchParams): Promise<CommentUserSummary[]> => {
    const response = await api.get('/api/comment-mention-users/', {
      params: {
        ...targetParams(target),
        q,
      },
    });
    return Array.isArray(response.data) ? response.data : [];
  },
};
