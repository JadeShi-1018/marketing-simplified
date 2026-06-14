'use client';

import { useEffect, useState } from 'react';
import {
  File,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';
import { getFileIconType } from '@/lib/api/attachmentApi';

interface Props {
  file: File;
  disabled?: boolean;
  onRemove: () => void;
}

export function truncateFilenameMiddle(filename: string, maxLength = 22): string {
  if (filename.length <= maxLength) return filename;

  const tailLength = Math.min(10, Math.max(6, Math.floor(maxLength * 0.4)));
  const tail = filename.slice(filename.length - tailLength);
  const headLength = maxLength - tailLength - 3;

  if (headLength < 1) return `${filename.slice(0, maxLength - 3)}...`;

  return `${filename.slice(0, headLength)}...${tail}`;
}

function FileTypePreview({ file }: { file: File }) {
  const iconType = getFileIconType(file.type);
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : '';

  const icon =
    iconType === 'video' ? (
      <Film className="h-8 w-8 text-gray-500" aria-hidden />
    ) : iconType === 'pdf' ? (
      <FileText className="h-8 w-8 text-red-500" aria-hidden />
    ) : iconType === 'word' ? (
      <FileText className="h-8 w-8 text-blue-600" aria-hidden />
    ) : iconType === 'excel' ? (
      <FileSpreadsheet className="h-8 w-8 text-green-600" aria-hidden />
    ) : iconType === 'presentation' ? (
      <FileText className="h-8 w-8 text-orange-500" aria-hidden />
    ) : iconType === 'image' ? (
      <ImageIcon className="h-8 w-8 text-gray-500" aria-hidden />
    ) : (
      <File className="h-8 w-8 text-gray-500" aria-hidden />
    );

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 bg-gray-50">
      {icon}
      {ext ? <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{ext}</span> : null}
    </div>
  );
}

export default function PortalFilePreviewCard({ file, disabled, onRemove }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith('image/');

  useEffect(() => {
    if (!isImage) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className="group w-[152px] overflow-hidden rounded border border-gray-200 bg-white">
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        {isImage && previewUrl ? (
          <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
        ) : (
          <FileTypePreview file={file} />
        )}

        {!disabled ? (
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded bg-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600/30"
            aria-label={`Remove ${file.name}`}
          >
            <Trash2 className="h-3.5 w-3.5 text-gray-900" aria-hidden />
          </button>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gray-200/90" aria-hidden />
      </div>

      <div className="px-2 py-1.5">
        <p className="truncate text-xs leading-snug text-gray-800" title={file.name}>
          {truncateFilenameMiddle(file.name)}
        </p>
      </div>
    </div>
  );
}
