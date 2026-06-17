'use client';

import { useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import FormFieldError from './FormFieldError';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from './constants';

interface Props {
  inputId: string;
  label?: React.ReactNode;
  help?: React.ReactNode;
  files: File[];
  error?: string;
  disabled?: boolean;
  maxTotalFiles: number;
  onChange: (files: File[]) => void;
  /** When true, label/help/error are rendered by a parent card (preview mode). */
  embedded?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileAttachmentField({
  inputId,
  label,
  help,
  files,
  error,
  disabled,
  maxTotalFiles,
  onChange,
  embedded = false,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0 || disabled) return;
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (next.length >= maxTotalFiles) break;
      next.push(file);
    }
    onChange(next);
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const dropZone = (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
          isDragging
            ? 'border-[#86E9A8] bg-[#86E9A8]/10'
            : 'border-gray-300 bg-gray-50 hover:border-[#86E9A8] hover:bg-[#86E9A8]/10'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <Paperclip className="h-5 w-5 text-gray-400" />
        <p className="text-sm text-gray-600">
          {isDragging ? 'Drop files here' : 'Drag and drop files, or click to browse'}
        </p>
        <p className="text-xs text-gray-500">
          Up to {maxTotalFiles} files per submission, {MAX_FILE_SIZE_MB} MB each
        </p>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          multiple
          disabled={disabled || files.length >= maxTotalFiles}
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
  );

  const fileList = files.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-lg border border-gray-200 p-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-sm text-gray-700"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-gray-500">{formatFileSize(file.size)}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
  );

  if (embedded) {
    return (
      <div className="flex flex-col gap-3">
        {dropZone}
        {fileList}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {dropZone}
      {fileList}
      {help}
      <FormFieldError message={error} />
    </div>
  );
}

export function isFileTooLarge(file: File, maxSizeMb: number = MAX_FILE_SIZE_MB): boolean {
  return file.size > maxSizeMb * 1024 * 1024;
}
