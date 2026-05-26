import type {
  CommentMediaKind,
  CommentUserSummary,
  TiptapJSONContent,
} from '@/types/comment';

export const EMPTY_COMMENT_DOC: TiptapJSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

export const COMMENT_INLINE_CHIP_WRAPPER_CLASS =
  'comment-inline-chip relative my-0.5 inline-flex max-w-full cursor-text align-middle';

export function isCommentInlineChipNodeType(type: unknown): boolean {
  return type === 'commentMedia' || type === 'smartLink';
}

function createCommentTextSpace(): TiptapJSONContent {
  // Inline atom chips need real text gaps so the cursor can land before/after them.
  return { type: 'text', text: '  ' };
}

export function createCommentInlineChipInsertionContent(
  chips: TiptapJSONContent[],
  options: { leadingSpace?: boolean; trailingSpace?: boolean } = {},
): TiptapJSONContent[] {
  const content: TiptapJSONContent[] = [];
  const { leadingSpace = false, trailingSpace = true } = options;

  if (leadingSpace && chips.length > 0) {
    content.push(createCommentTextSpace());
  }

  chips.forEach((chip, index) => {
    content.push(chip);
    if (index < chips.length - 1 || trailingSpace) {
      content.push(createCommentTextSpace());
    }
  });

  return content;
}

const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'mp4',
  'webm',
  'mov',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'ppt',
  'pptx',
  'txt',
  'md',
  'zip',
]);

const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'application/zip',
  'application/x-zip-compressed',
]);

export const COMMENT_UPLOAD_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.mp4',
  '.webm',
  '.mov',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.ppt',
  '.pptx',
  '.txt',
  '.md',
  '.zip',
].join(',');

export function getFileExtension(filename: string): string {
  const extension = filename.split('.').pop();
  return extension ? extension.toLowerCase() : '';
}

export function isSupportedCommentUploadFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  if (SUPPORTED_UPLOAD_EXTENSIONS.has(extension)) return true;
  return SUPPORTED_UPLOAD_MIME_TYPES.has(file.type.toLowerCase());
}

export function formatCommentTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function getUserDisplayName(user?: Partial<CommentUserSummary> | null): string {
  return user?.username || user?.email || (user?.id ? `User ${user.id}` : 'Unknown user');
}

export function getInitials(name: string): string {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function getCommentMediaKind(contentType: string): CommentMediaKind {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  return 'file';
}

export function extractMentionUserIds(doc: TiptapJSONContent | null | undefined): number[] {
  const ids = new Set<number>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const record = node as TiptapJSONContent;
    if (record.type === 'mention') {
      const rawId = record.attrs?.id;
      const id = typeof rawId === 'number' ? rawId : Number(rawId);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    }
    if (Array.isArray(record.content)) {
      record.content.forEach(visit);
    }
  };

  visit(doc);
  return Array.from(ids);
}

export function extractCommentAttachmentIds(doc: TiptapJSONContent | null | undefined): string[] {
  const ids = new Set<string>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const record = node as TiptapJSONContent;
    if (record.type === 'commentMedia') {
      const attachmentId = record.attrs?.attachmentId;
      if (typeof attachmentId === 'string' && attachmentId.trim()) {
        ids.add(attachmentId);
      }
    }
    if (Array.isArray(record.content)) {
      record.content.forEach(visit);
    }
  };

  visit(doc);
  return Array.from(ids);
}

export function hasUploadingCommentMedia(doc: TiptapJSONContent | null | undefined): boolean {
  let hasUploading = false;

  const visit = (node: unknown) => {
    if (hasUploading || !node || typeof node !== 'object') return;
    const record = node as TiptapJSONContent;
    if (record.type === 'commentMedia' && record.attrs?.status === 'uploading') {
      hasUploading = true;
      return;
    }
    if (Array.isArray(record.content)) {
      record.content.forEach(visit);
    }
  };

  visit(doc);
  return hasUploading;
}

export function isEmptyDoc(doc: TiptapJSONContent | null | undefined): boolean {
  if (!doc) return true;
  let hasContent = false;
  const meaningfulLeafNodes = new Set([
    'image',
    'mention',
    'inlineMedia',
    'commentMedia',
    'smartLink',
    'codeSnippet',
  ]);

  const visit = (node: unknown) => {
    if (hasContent || !node || typeof node !== 'object') return;
    const record = node as TiptapJSONContent;
    if (typeof record.text === 'string' && record.text.trim()) {
      hasContent = true;
      return;
    }
    if (
      record.type &&
      meaningfulLeafNodes.has(record.type) &&
      record.attrs?.status !== 'failed'
    ) {
      hasContent = true;
      return;
    }
    if (Array.isArray(record.content)) {
      record.content.forEach(visit);
    }
  };

  visit(doc);
  return !hasContent;
}

export function isPristineEmptyDoc(doc: TiptapJSONContent | null | undefined): boolean {
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content) || doc.content.length !== 1) {
    return false;
  }

  const paragraph = doc.content[0];
  return paragraph.type === 'paragraph' &&
    (!Array.isArray(paragraph.content) || paragraph.content.length === 0);
}

export function parseCommentApiError(error: unknown, fallback: string): string {
  const data = (error as any)?.response?.data;
  if (typeof data?.detail === 'string') return data.detail;
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const firstValue = Object.values(data)[0];
    if (typeof firstValue === 'string') return firstValue;
    if (Array.isArray(firstValue) && typeof firstValue[0] === 'string') return firstValue[0];
  }
  return fallback;
}
