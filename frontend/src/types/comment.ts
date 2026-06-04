export type CommentEntityType = 'task' | (string & {});

export type CommentBodyFormat = 'rich_text_json';

export type TiptapJSONContent = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{
    type: string;
    attrs?: Record<string, unknown>;
  }>;
  content?: TiptapJSONContent[];
  [key: string]: unknown;
};

export type CommentUserSummary = {
  id: number;
  username: string;
  email: string;
};

export type CommentAttachment = {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  file_url: string | null;
  is_inline: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CommentAttachmentPreviewStatus =
  | 'unsupported'
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed';

export type CommentAttachmentPreviewPage = {
  page: number;
  image_url: string;
  width?: number;
  height?: number;
};

export type CommentAttachmentPreview = {
  attachment_id: string;
  status: CommentAttachmentPreviewStatus;
  kind: string;
  content_type: string;
  filename: string;
  size: number;
  original_file_url: string | null;
  preview_pages: CommentAttachmentPreviewPage[];
  error_message: string;
};

export type CommentMediaKind = 'image' | 'video' | 'file';

export type CommentMediaStatus = 'uploading' | 'uploaded' | 'failed';

export type CommentMediaAttrs = {
  attachmentId: string;
  uploadId?: string | null;
  src: string | null;
  filename: string;
  contentType: string;
  size: number;
  kind: CommentMediaKind;
  status?: CommentMediaStatus;
};

export type CommentSmartLinkStatus = 'resolved' | 'fallback';

export type CommentSmartLinkAttrs = {
  url: string;
  title: string;
  description?: string | null;
  siteName?: string | null;
  favicon?: string | null;
  image?: string | null;
  status?: CommentSmartLinkStatus;
};

export type CommentPanelType = 'info' | 'note' | 'success' | 'warning' | 'error';

export type CommentRecord = {
  id: string;
  entity_type: CommentEntityType | null;
  entity_id: string;
  author: CommentUserSummary;
  body: TiptapJSONContent;
  body_text: string;
  body_format: CommentBodyFormat;
  mentions: CommentUserSummary[];
  metadata: Record<string, unknown>;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
  can_delete: boolean;
};

export type CommentTarget = {
  entityType: CommentEntityType;
  entityId: string | number;
};

export type CommentCreateRequest = CommentTarget & {
  body: TiptapJSONContent;
  body_format?: CommentBodyFormat;
  mentions?: number[];
  attachment_ids?: string[];
};

export type CommentUpdateRequest = {
  body?: TiptapJSONContent;
  body_format?: CommentBodyFormat;
  mentions?: number[];
  attachment_ids?: string[];
};

export type CommentUploadRequest = CommentTarget & {
  file: File;
  is_inline?: boolean;
  metadata?: Record<string, unknown>;
};

export type CommentMentionSearchParams = CommentTarget & {
  q?: string;
};
