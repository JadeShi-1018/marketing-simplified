'use client';

import {
  AlignLeft,
  Calendar,
  CheckSquare,
  ChevronDown,
  Clock,
  FileText,
  Folder,
  Hash,
  Layers,
  Link,
  Paperclip,
  Tags,
  Type,
  Users,
} from 'lucide-react';
import type { FieldType } from '@/types/ticketForm';

const ICON_CLASS = 'h-5 w-5 shrink-0';

export default function FieldTypeIcon({
  fieldType,
  className = 'text-gray-500',
  }: { 
    fieldType: FieldType
    className?: string;
  }) {
  switch (fieldType) {
    case 'system_summary':
      return <FileText className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'system_description':
      return <AlignLeft className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'system_project':
      return <Folder className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'system_work_type':
      return <Layers className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'short_text':
      return <Type className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'paragraph':
      return <AlignLeft className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'timestamp':
      return <Clock className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'dropdown':
      return <ChevronDown className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'date':
      return <Calendar className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'number':
      return <Hash className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'labels':
      return <Tags className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'checkbox':
      return <CheckSquare className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'people':
      return <Users className={`${ICON_CLASS} ${className}`}  aria-hidden />;
    case 'url':
      return <Link className={`${ICON_CLASS} ${className}`} aria-hidden />;
    case 'file':
      return <Paperclip className={`${ICON_CLASS} ${className}`}  aria-hidden />;
    default:
      return <Type className={`${ICON_CLASS} ${className}`}  aria-hidden />;
  }
}
