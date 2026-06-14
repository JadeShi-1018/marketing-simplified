'use client';

import { useRef, useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { MAX_FILE_SIZE_MB } from '../constants';
import { isFileTooLarge } from '../FileAttachmentField';
import PortalFilePreviewCard from './PortalFilePreviewCard';

interface Props {
  inputId: string;
  files: File[];
  disabled?: boolean;
  maxTotalFiles: number;
  maxFileSizeMb?: number;
  onChange: (files: File[]) => void;
  onSizeError?: (message: string | null) => void;
}

function fileTooLargeMessage(maxSizeMb: number): string {
  return `Each file must be ${maxSizeMb} MB or smaller.`;
}

export default function PortalFileAttachment({
  inputId,
  files,
  disabled,
  maxTotalFiles,
  maxFileSizeMb = MAX_FILE_SIZE_MB,
  onChange,
  onSizeError,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reportSizeError = (message: string | null) => {
    onSizeError?.(message);
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0 || disabled) return;

    const next = [...files];
    let rejected = false;

    for (const file of Array.from(incoming)) {
      if (next.length >= maxTotalFiles) break;
      if (isFileTooLarge(file, maxFileSizeMb)) {
        rejected = true;
        continue;
      }
      next.push(file);
    }

    if (rejected) {
      reportSizeError(fileTooLargeMessage(maxFileSizeMb));
    } else {
      reportSizeError(null);
    }

    if (next.length !== files.length) {
      onChange(next);
    }
  };

  const removeFile = (index: number) => {
    reportSizeError(null);
    onChange(files.filter((_, i) => i !== index));
  };

  const canAddMore = files.length < maxTotalFiles;

  return (
    <div className="flex flex-col gap-3">
      <div
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && canAddMore) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        className={`flex min-h-[52px] items-center justify-center gap-2 rounded border border-dashed bg-white px-4 py-3 transition-colors ${
          isDragging ? 'border-green-600 bg-green-50/40' : 'border-gray-300'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <CloudUpload className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
        <span className="text-sm text-gray-600">
          {isDragging ? 'Drop files here' : 'Drop files to attach or'}
        </span>
        <button
          type="button"
          disabled={disabled || !canAddMore}
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Browse
        </button>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          multiple
          disabled={disabled || !canAddMore}
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`}>
              <PortalFilePreviewCard
                file={file}
                disabled={disabled}
                onRemove={() => removeFile(index)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
