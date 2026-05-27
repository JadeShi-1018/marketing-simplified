'use client';

import { TextSelection } from '@tiptap/pm/state';
import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from '@tiptap/react';
import {
  ChevronDown,
  Trash2,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { CommentPanelType } from '@/types/comment';
import {
  COMMENT_PANEL_TYPES,
  getCommentPanelConfig,
} from '../commentPanel';

function getPanelPosition(props: ReactNodeViewProps) {
  return typeof props.getPos === 'function' ? props.getPos() : null;
}

function deletePanel(props: ReactNodeViewProps) {
  const position = getPanelPosition(props);
  if (typeof position !== 'number') return;

  const { state, view } = props.editor;
  const paragraph = state.schema.nodes.paragraph.create();

  if (state.doc.childCount === 1) {
    // Keep a valid cursor target when deleting the only top-level node.
    const tr = state.tr.replaceWith(position, position + props.node.nodeSize, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, position + 1));
    view.dispatch(tr.scrollIntoView());
    return;
  }

  const tr = state.tr.delete(position, position + props.node.nodeSize);
  const selectionPosition = Math.min(position, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPosition), 1));
  view.dispatch(tr.scrollIntoView());
}

function PanelIcon({
  type,
  className,
  style,
}: {
  type: CommentPanelType;
  className?: string;
  style?: CSSProperties;
}) {
  if (type === 'note') {
    return (
      <svg
        viewBox="0 0 18 18"
        aria-hidden="true"
        className={cn('h-[18px] w-[18px]', className)}
        style={style}
      >
        <path
          fill="currentColor"
          d="M4 2h7.8L15 5.2V16H4V2Z"
        />
        <path fill="#fff" d="M11.5 2.4V5.5h3.1L11.5 2.4Z" opacity="0.9" />
        <path
          stroke="#fff"
          strokeLinecap="round"
          strokeWidth="1.35"
          d="M6.5 8h5M6.5 10.5h5M6.5 13h3.5"
        />
      </svg>
    );
  }

  if (type === 'warning') {
    return (
      <svg
        viewBox="0 0 18 18"
        aria-hidden="true"
        className={cn('h-[18px] w-[18px]', className)}
        style={style}
      >
        <path fill="currentColor" d="M9 1.6 17 16H1L9 1.6Z" />
        <path
          fill="#fff"
          d="M8.15 6h1.7v5.2h-1.7V6Zm0 6.4h1.7v1.7h-1.7v-1.7Z"
        />
      </svg>
    );
  }

  if (type === 'success') {
    return (
      <svg
        viewBox="0 0 18 18"
        aria-hidden="true"
        className={cn('h-[18px] w-[18px]', className)}
        style={style}
      >
        <circle cx="9" cy="9" r="8" fill="currentColor" />
        <path
          fill="none"
          stroke="#fff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="m5.3 9.2 2.4 2.4 5-5"
        />
      </svg>
    );
  }

  if (type === 'error') {
    return (
      <svg
        viewBox="0 0 18 18"
        aria-hidden="true"
        className={cn('h-[18px] w-[18px]', className)}
        style={style}
      >
        <circle cx="9" cy="9" r="8" fill="currentColor" />
        <path
          stroke="#fff"
          strokeLinecap="round"
          strokeWidth="2"
          d="m6 6 6 6m0-6-6 6"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 18 18"
      aria-hidden="true"
      className={cn('h-[18px] w-[18px]', className)}
      style={style}
    >
      <circle cx="9" cy="9" r="8" fill="currentColor" />
      <path fill="#fff" d="M8.15 7.4h1.7V13h-1.7V7.4Zm0-2.7h1.7v1.6h-1.7V4.7Z" />
    </svg>
  );
}

function PanelMenuAction({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium transition hover:bg-gray-100',
        danger ? 'text-rose-600 hover:bg-rose-50' : 'text-gray-700',
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default function CommentPanelNodeView(props: ReactNodeViewProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const type = getCommentPanelConfig(props.node.attrs.type).type;
  const config = getCommentPanelConfig(type);
  const editable = props.editor.isEditable;

  useEffect(() => {
    const updateActive = () => {
      const position = getPanelPosition(props);
      if (!editable || typeof position !== 'number') {
        setActive(false);
        return;
      }

      const { from, to } = props.editor.state.selection;
      // Show panel controls only when the cursor is inside the panel content, not on the wrapper node.
      setActive(from > position && to < position + props.node.nodeSize);
    };

    updateActive();
    props.editor.on('selectionUpdate', updateActive);
    props.editor.on('transaction', updateActive);
    return () => {
      props.editor.off('selectionUpdate', updateActive);
      props.editor.off('transaction', updateActive);
    };
  }, [editable, props]);

  return (
    <NodeViewWrapper
      as="div"
      data-type="commentPanel"
      data-panel-type={type}
      className="comment-panel relative my-2 flex items-start gap-3 rounded-[4px] px-3 py-2 text-sm leading-5 text-[#172B4D]"
      style={{ backgroundColor: config.background }}
    >
      <div
        className="comment-panel-icon flex h-5 w-5 shrink-0 items-center justify-center"
        style={{ color: config.accent }}
        contentEditable={false}
      >
        <PanelIcon type={type} className="h-5 w-5" />
      </div>
      <NodeViewContent className="comment-panel-content min-w-0 flex-1 leading-5 [&_p]:my-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />

      {active ? (
        <div
          ref={menuRef}
          className="absolute left-0 top-full z-50 mt-1 inline-flex items-center gap-1 rounded border border-gray-200 bg-white p-1 text-xs shadow-lg"
          contentEditable={false}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
                onMouseDown={(event) => event.preventDefault()}
              >
                <PanelIcon type={type} className="h-4 w-4" style={{ color: config.accent }} />
                <span>{config.label}</span>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40 border-gray-200 p-1">
              {COMMENT_PANEL_TYPES.map((panelType) => {
                const option = getCommentPanelConfig(panelType);
                const selected = panelType === type;
                return (
                  <DropdownMenuItem
                    key={panelType}
                    data-active={selected}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-gray-700 outline-none transition hover:bg-gray-100 focus:bg-gray-100 data-[active=true]:bg-green-50 data-[active=true]:font-medium data-[active=true]:text-gray-900 data-[active=true]:hover:bg-green-50 data-[active=true]:focus:bg-green-50"
                    onSelect={() => props.updateAttributes({ type: panelType })}
                  >
                    <PanelIcon
                      type={panelType}
                      className="h-4 w-4"
                      style={{ color: option.accent }}
                    />
                    <span>{option.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <PanelMenuAction
            danger
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Delete"
            onClick={() => deletePanel(props)}
          />
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}
