import type { CommentPanelType } from '@/types/comment';

export const COMMENT_PANEL_TYPES: CommentPanelType[] = [
  'info',
  'note',
  'success',
  'warning',
  'error',
];

export type CommentPanelConfig = {
  type: CommentPanelType;
  label: string;
  background: string;
  accent: string;
};

const PANEL_CONFIGS: Record<CommentPanelType, CommentPanelConfig> = {
  info: {
    type: 'info',
    label: 'Info',
    background: '#e9f2fe',
    accent: '#367ee8',
  },
  note: {
    type: 'note',
    label: 'Note',
    background: '#f9effe',
    accent: '#ae73e1',
  },
  success: {
    type: 'success',
    label: 'Success',
    background: '#dcfff1',
    accent: '#6b9a23',
  },
  warning: {
    type: 'warning',
    label: 'Warning',
    background: '#fef7c8',
    accent: '#e16d01',
  },
  error: {
    type: 'error',
    label: 'Error',
    background: '#ffecec',
    accent: '#cd4736',
  },
};

export function normalizeCommentPanelType(value: unknown): CommentPanelType {
  return COMMENT_PANEL_TYPES.includes(value as CommentPanelType)
    ? (value as CommentPanelType)
    : 'info';
}

export function getCommentPanelConfig(value: unknown): CommentPanelConfig {
  return PANEL_CONFIGS[normalizeCommentPanelType(value)];
}
