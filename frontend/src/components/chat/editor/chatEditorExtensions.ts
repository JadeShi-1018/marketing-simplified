'use client';

import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import { ReactRenderer } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import type { CommentUserSummary } from '@/types/comment';
import MentionPicker, { type MentionPickerRef } from '@/components/comments/MentionPicker';

// ---------------------------------------------------------------------------
// CSS class bundles
// ---------------------------------------------------------------------------

/**
 * Applied to the ProseMirror content area inside the chat composer (editable).
 */
export const CHAT_EDITOR_CONTENT_CLASS = [
  'text-sm leading-5 text-gray-900',
  '[&>*]:my-0 [&>*+*]:mt-1',
  '[&_p]:my-0',
  '[&_strong]:font-semibold [&_em]:italic [&_s]:line-through [&_u]:underline',
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-gray-900',
  '[&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-gray-950 [&_pre]:px-3 [&_pre]:py-2 [&_pre]:text-gray-50',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-50',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-l-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500',
  '[&_ul]:my-0 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:my-0 [&_ol]:ml-5 [&_ol]:list-decimal',
  '[&_li]:my-0',
  '[&_ul[data-type="taskList"]]:ml-0 [&_ul[data-type="taskList"]]:list-none',
  '[&_li[data-type="taskItem"]]:flex [&_li[data-type="taskItem"]]:items-start [&_li[data-type="taskItem"]>label]:mr-2 [&_li[data-type="taskItem"]>div]:min-w-0 [&_li[data-type="taskItem"]>div]:flex-1',
  '[&_li[data-type="taskItem"]_input]:mt-0.5',
  '[&_a]:text-sky-700 [&_a]:underline [&_a]:underline-offset-2',
  // Placeholder
  '[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-gray-400 [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
  'w-full break-words whitespace-pre-wrap outline-none',
].join(' ');

/**
 * Applied to rendered (read-only) rich message content in MessageItem.
 */
export const CHAT_RICH_TEXT_CLASS = [
  'text-sm leading-5 text-gray-900',
  '[&_p]:my-0 [&_p+p]:mt-1',
  '[&_strong]:font-semibold [&_em]:italic [&_s]:line-through [&_u]:underline',
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-gray-900',
  '[&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-gray-950 [&_pre]:px-3 [&_pre]:py-2 [&_pre]:text-gray-50',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-50',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-l-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500',
  '[&_ul]:my-0 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:my-0 [&_ol]:ml-5 [&_ol]:list-decimal',
  '[&_li]:my-0',
  '[&_ul[data-type="taskList"]]:ml-0 [&_ul[data-type="taskList"]]:list-none',
  '[&_li[data-type="taskItem"]]:flex [&_li[data-type="taskItem"]]:items-start [&_li[data-type="taskItem"]>label]:mr-2 [&_li[data-type="taskItem"]>div]:min-w-0 [&_li[data-type="taskItem"]>div]:flex-1',
  '[&_li[data-type="taskItem"]_input]:mt-0.5',
  '[&_a]:text-sky-700 [&_a]:underline [&_a]:underline-offset-2',
].join(' ');

// ---------------------------------------------------------------------------
// Mention chip styling — shared between editor and viewer
// ---------------------------------------------------------------------------

const MENTION_HTML_ATTRS = {
  class: 'rounded bg-sky-50 px-1 py-0.5 text-sky-700 ring-1 ring-inset ring-sky-100',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds the mention extension for the read-only viewer (no suggestion popup).
 */
function createChatViewerMentionExtension() {
  return Mention.configure({
    HTMLAttributes: MENTION_HTML_ATTRS,
    renderLabel({ node }: { node: { attrs: Record<string, unknown> } }) {
      const label = node.attrs.label ?? node.attrs.id;
      return `@${String(label)}`;
    },
  });
}

/**
 * Builds the mention extension for the editor with an interactive suggestion popup.
 *
 * @param getMentionableUsers  Called on every keystroke after `@`; returns the
 *                             filtered list of users to show. The caller is
 *                             responsible for filtering by `query`.
 */
function createChatEditorMentionExtension(
  getMentionableUsers: (query: string) => CommentUserSummary[],
) {
  return Mention.configure({
    HTMLAttributes: MENTION_HTML_ATTRS,
    renderLabel({ node }: { node: { attrs: Record<string, unknown> } }) {
      const label = node.attrs.label ?? node.attrs.id;
      return `@${String(label)}`;
    },
    suggestion: {
      char: '@',
      items: ({ query }: { query: string }) => getMentionableUsers(query),
      command: ({
        editor,
        range,
        props,
      }: {
        editor: Editor;
        range: { from: number; to: number };
        props: unknown;
      }) => {
        const user = props as CommentUserSummary;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: 'mention',
              attrs: {
                id: user.id,
                label: user.username || user.email || `User ${user.id}`,
              },
            },
            { type: 'text', text: ' ' },
          ])
          .run();
      },
      render: () => {
        let component: ReactRenderer<MentionPickerRef> | null = null;
        let popup: HTMLDivElement | null = null;

        const updatePosition = (props: { clientRect?: (() => DOMRect | null) | null }) => {
          if (!popup || !props.clientRect) return;
          const rect = props.clientRect();
          if (!rect) return;
          popup.style.left = `${rect.left}px`;
          popup.style.top = `${rect.bottom + 8}px`;
        };

        return {
          onStart: (props: unknown) => {
            component = new ReactRenderer(MentionPicker, {
              props: props as Record<string, unknown>,
              editor: (props as { editor: Editor }).editor,
            });
            popup = document.createElement('div');
            popup.className = 'fixed z-[9999]';
            popup.appendChild(component.element);
            document.body.appendChild(popup);
            updatePosition(props as { clientRect?: (() => DOMRect | null) | null });
          },
          onUpdate: (props: unknown) => {
            component?.updateProps(props as Record<string, unknown>);
            updatePosition(props as { clientRect?: (() => DOMRect | null) | null });
          },
          onKeyDown: (props: { event: KeyboardEvent }) => {
            if (props.event.key === 'Escape') return true;
            return component?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            component?.destroy();
            popup?.remove();
            component = null;
            popup = null;
          },
        };
      },
    },
  });
}

/**
 * Shared base extensions for both the editor and the viewer.
 * Chat stays compact: common marks, quote/lists, task lists, code blocks, and links.
 * Document-style blocks such as panels, embedded media, colour, and headings stay out.
 */
function createChatBaseExtensions() {
  return [
    StarterKit.configure({
      // No headings in a chat composer
      heading: false,
      horizontalRule: false,
    }),
    Underline,
    TaskList.configure({
      HTMLAttributes: {
        class: 'chat-task-list',
      },
    }),
    TaskItem.configure({
      nested: true,
      HTMLAttributes: {
        class: 'chat-task-item',
      },
    }),
    Link.configure({
      autolink: true,
      openOnClick: false,
      defaultProtocol: 'https',
      HTMLAttributes: {
        class: 'text-sky-700 underline underline-offset-2',
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      },
    }),
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extension set for rendering rich message content (read-only).
 * Used in `MessageItem` when a message has a `rich_body`.
 */
export function createChatViewerExtensions() {
  return [...createChatBaseExtensions(), createChatViewerMentionExtension()];
}

/**
 * Extension set for the `ChatComposer` (editable).
 *
 * @param options.placeholder        Placeholder text shown in the empty editor.
 * @param options.participants        Full participant list for the current chat.
 *                                   Mention suggestions are filtered from this
 *                                   list locally — no extra API call needed.
 */
export function createChatEditorExtensions({
  placeholder = 'Type a message…',
  participants = [],
}: {
  placeholder?: string;
  participants?: CommentUserSummary[];
}) {
  return [
    ...createChatBaseExtensions(),
    Placeholder.configure({
      placeholder,
    }),
    createChatEditorMentionExtension((query) => {
      if (!query) return participants;
      const q = query.toLowerCase();
      return participants.filter(
        (p) =>
          (p.username && p.username.toLowerCase().includes(q)) ||
          (p.email && p.email.toLowerCase().includes(q)),
      );
    }),
  ];
}
