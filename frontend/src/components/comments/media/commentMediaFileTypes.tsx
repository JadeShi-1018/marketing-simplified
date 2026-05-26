'use client';

import type { CommentMediaAttrs } from '@/types/comment';
import { cn } from '@/lib/utils';
import { getFileExtension } from '../commentUtils';

export type CommentFileBadge = {
  label: string;
  colorClassName: string;
  glyph: 'label' | 'presentation' | 'sheet' | 'image' | 'code' | 'doc' | 'zip' | 'generic';
};

type CommentMediaFileDescriptor = Pick<
  CommentMediaAttrs,
  'filename' | 'contentType' | 'kind'
>;

export type CommentMediaPreviewKind = 'image' | 'pdf' | 'placeholder' | 'none';

function normalizeContentType(contentType: string): string {
  return contentType.toLowerCase();
}

function isImageFile(file: CommentMediaFileDescriptor): boolean {
  return file.kind === 'image' || normalizeContentType(file.contentType).startsWith('image/');
}

function isVideoFile(file: CommentMediaFileDescriptor): boolean {
  const extension = getFileExtension(file.filename);
  const contentType = normalizeContentType(file.contentType);
  return (
    file.kind === 'video' ||
    contentType.startsWith('video/') ||
    ['mp4', 'webm', 'mov'].includes(extension)
  );
}

function isPdfFile(file: CommentMediaFileDescriptor): boolean {
  const extension = getFileExtension(file.filename);
  return extension === 'pdf' || normalizeContentType(file.contentType) === 'application/pdf';
}

export function isCommentZipFile(file: CommentMediaFileDescriptor): boolean {
  const extension = getFileExtension(file.filename);
  const contentType = normalizeContentType(file.contentType);
  return extension === 'zip' || contentType.includes('zip');
}

export function getCommentMediaPreviewKind(
  file: CommentMediaFileDescriptor,
): CommentMediaPreviewKind {
  if (isVideoFile(file) || isCommentZipFile(file)) return 'none';
  if (isImageFile(file)) return 'image';
  if (isPdfFile(file)) return 'pdf';
  return 'placeholder';
}

export function isCommentMediaPreviewable(file: CommentMediaFileDescriptor): boolean {
  return getCommentMediaPreviewKind(file) !== 'none';
}

export function getCommentMediaCategoryLabel(file: CommentMediaFileDescriptor): string {
  const extension = getFileExtension(file.filename);
  const contentType = normalizeContentType(file.contentType);

  if (isImageFile(file)) return 'Image';
  if (isVideoFile(file)) return 'Video';
  if (isPdfFile(file)) return 'PDF';
  if (['doc', 'docx'].includes(extension) || contentType.includes('word')) return 'Document';
  if (
    ['xls', 'xlsx'].includes(extension) ||
    contentType.includes('spreadsheet') ||
    contentType.includes('excel')
  ) {
    return 'Spreadsheet';
  }
  if (extension === 'csv' || contentType === 'text/csv') return 'CSV';
  if (['ppt', 'pptx'].includes(extension) || contentType.includes('presentation')) {
    return 'Presentation';
  }
  if (extension === 'md' || contentType === 'text/markdown') return 'Markdown';
  if (extension === 'txt' || contentType.startsWith('text/')) return 'Text';
  if (isCommentZipFile(file)) return 'ZIP archive';
  return 'File';
}

export function getCommentFileBadge(file: CommentMediaFileDescriptor): CommentFileBadge {
  const extension = getFileExtension(file.filename);
  const contentType = normalizeContentType(file.contentType);

  if (isImageFile(file)) {
    return {
      label: 'IMG',
      colorClassName: 'bg-teal-500',
      glyph: 'image',
    };
  }
  if (isPdfFile(file)) {
    return {
      label: 'PDF',
      colorClassName: 'bg-red-500',
      glyph: 'label',
    };
  }
  if (['doc', 'docx'].includes(extension) || contentType.includes('word')) {
    return {
      label: 'DOC',
      colorClassName: 'bg-blue-500',
      glyph: 'doc',
    };
  }
  if (
    ['xls', 'xlsx', 'csv'].includes(extension) ||
    contentType.includes('spreadsheet') ||
    contentType.includes('excel') ||
    contentType === 'text/csv'
  ) {
    return {
      label: extension === 'csv' || contentType === 'text/csv' ? 'CSV' : 'XLS',
      colorClassName: 'bg-emerald-500',
      glyph: 'sheet',
    };
  }
  if (['ppt', 'pptx'].includes(extension) || contentType.includes('presentation')) {
    return {
      label: 'PPT',
      colorClassName: 'bg-orange-600',
      glyph: 'presentation',
    };
  }
  if (['txt', 'md'].includes(extension) || contentType.startsWith('text/')) {
    return {
      label: 'TXT',
      colorClassName: 'bg-cyan-500',
      glyph: 'code',
    };
  }
  if (isCommentZipFile(file)) {
    return {
      label: 'ZIP',
      colorClassName: 'bg-purple-500',
      glyph: 'zip',
    };
  }
  return {
    label: 'FILE',
    colorClassName: 'bg-gray-500',
    glyph: 'generic',
  };
}

export function CommentFileTypeIcon({
  badge,
  size = 'sm',
}: {
  badge: CommentFileBadge;
  size?: 'sm' | 'lg';
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.16)]',
        size === 'lg' ? 'h-9 w-9 rounded-md' : 'h-4 w-4',
        badge.colorClassName,
      )}
      aria-hidden="true"
    >
      <FileBadgeGlyph badge={badge} size={size} />
    </span>
  );
}

function FileBadgeGlyph({
  badge,
  size,
}: {
  badge: CommentFileBadge;
  size: 'sm' | 'lg';
}) {
  if (badge.glyph === 'sheet') {
    return (
      <span
        className={cn(
          'grid grid-cols-2 gap-px',
          size === 'lg' ? 'h-5 w-5' : 'h-2.5 w-2.5',
        )}
      >
        <span className="rounded-[1px] bg-white" />
        <span className="rounded-[1px] bg-white" />
        <span className="rounded-[1px] bg-white" />
        <span className="rounded-[1px] bg-white" />
      </span>
    );
  }

  if (badge.glyph === 'presentation') {
    return (
      <svg
        viewBox="0 0 16 16"
        className={size === 'lg' ? 'h-6 w-6' : 'h-3.5 w-3.5'}
        focusable="false"
        aria-hidden="true"
      >
        <rect x="2.75" y="2.25" width="10.5" height="11.5" rx="1.75" fill="white" />
        <path
          d="M5.25 11V5h2.18c1.45 0 2.35.76 2.35 2 0 1.25-.9 2-2.35 2H6.6v2H5.25Zm1.35-3.05h.7c.72 0 1.08-.32 1.08-.95s-.36-.95-1.08-.95h-.7v1.9Z"
          fill="#EA580C"
        />
      </svg>
    );
  }

  if (badge.glyph === 'image') {
    return (
      <svg
        viewBox="0 0 16 16"
        className={size === 'lg' ? 'h-6 w-6' : 'h-3.5 w-3.5'}
        focusable="false"
        aria-hidden="true"
      >
        <circle cx="11.25" cy="4.75" r="1.35" fill="white" />
        <path
          d="M2.5 12.1 6.2 8.35a1 1 0 0 1 1.44.02l1.28 1.37.78-.82a1 1 0 0 1 1.43-.01l2.37 2.46V13H2.5v-.9Z"
          fill="white"
        />
      </svg>
    );
  }

  if (badge.glyph === 'code') {
    return (
      <span
        className={cn(
          'font-black leading-none',
          size === 'lg' ? 'text-[14px]' : 'text-[7px]',
        )}
      >
        &lt;/&gt;
      </span>
    );
  }

  if (badge.glyph === 'doc' || badge.glyph === 'generic') {
    return (
      <span
        className={cn(
          'flex flex-col',
          size === 'lg' ? 'w-5 gap-1' : 'w-2.5 gap-[2px]',
        )}
      >
        <span className={cn('rounded-full bg-white', size === 'lg' ? 'h-0.5' : 'h-px')} />
        <span className={cn('rounded-full bg-white', size === 'lg' ? 'h-0.5' : 'h-px')} />
        <span className={cn('rounded-full bg-white', size === 'lg' ? 'h-0.5 w-4' : 'h-px w-2')} />
      </span>
    );
  }

  if (badge.glyph === 'zip') {
    return (
      <span
        className={cn(
          'flex items-center justify-center gap-px',
          size === 'lg' ? 'h-6 w-4' : 'h-3 w-2',
        )}
      >
        <span className="flex flex-col gap-px">
          <span
            className={cn(
              'rounded-full bg-white',
              size === 'lg' ? 'h-1 w-1' : 'h-0.5 w-0.5',
            )}
          />
          <span
            className={cn(
              'rounded-full bg-white',
              size === 'lg' ? 'h-1 w-1' : 'h-0.5 w-0.5',
            )}
          />
          <span
            className={cn(
              'rounded-full bg-white',
              size === 'lg' ? 'h-1 w-1' : 'h-0.5 w-0.5',
            )}
          />
        </span>
        <span
          className={cn(
            'rounded-full bg-white/80',
            size === 'lg' ? 'h-6 w-0.5' : 'h-3 w-px',
          )}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'font-black leading-none tracking-normal',
        size === 'lg' ? 'text-[10px]' : 'text-[5px]',
      )}
    >
      {badge.label}
    </span>
  );
}
