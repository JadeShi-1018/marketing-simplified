'use client';

import CodeBlock, {
  backtickInputRegex,
  tildeInputRegex,
} from '@tiptap/extension-code-block';
import { Extension, InputRule, mergeAttributes } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import { ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import type { NodeType } from '@tiptap/pm/model';
import type { ExtendedRegExpMatchArray, InputRuleFinder } from '@tiptap/core';
import type { CommentUserSummary } from '@/types/comment';
import MentionPicker, { type MentionPickerRef } from '@/components/comments/MentionPicker';
import {
  dispatchChatCodeBlockFocus,
} from './chatCodeBlockFocus';
import { normalizeChatCodeLanguage } from './chatCodeLanguages';
import ChatCodeBlockNodeView from './nodes/ChatCodeBlockNodeView';

// ---------------------------------------------------------------------------
// CSS class bundles
// ---------------------------------------------------------------------------

// Shared CSS for the CodeMirror-based chat code block node view.
const CHAT_CODE_BLOCK_CLASS = [
  '[&_.chat-code-block]:my-1.5 [&_.chat-code-block]:max-w-full [&_.chat-code-block]:overflow-hidden [&_.chat-code-block]:rounded-md [&_.chat-code-block]:border [&_.chat-code-block]:border-gray-200 [&_.chat-code-block]:bg-gray-50 [&_.chat-code-block]:text-gray-900 [&_.chat-code-block]:shadow-inner [&_.chat-code-block]:shadow-gray-100/70',
  '[&_.chat-code-block-header]:flex [&_.chat-code-block-header]:min-h-8 [&_.chat-code-block-header]:flex-wrap [&_.chat-code-block-header]:items-center [&_.chat-code-block-header]:gap-1 [&_.chat-code-block-header]:border-b [&_.chat-code-block-header]:border-gray-200 [&_.chat-code-block-header]:bg-white/80 [&_.chat-code-block-header]:px-2 [&_.chat-code-block-header]:py-0.5',
  '[&_.chat-code-block-content]:m-0 [&_.chat-code-block-content]:max-w-full [&_.chat-code-block-content]:overflow-x-auto [&_.chat-code-block-content]:bg-transparent [&_.chat-code-block-content]:p-0 [&_.chat-code-block-content]:text-left',
  '[&_.chat-code-block-codemirror]:min-w-full',
].join(' ');

/**
 * Applied to the ProseMirror content area inside the chat composer (editable).
 */
export const CHAT_EDITOR_CONTENT_CLASS = [
  'text-sm leading-5 text-gray-900',
  '[&>*]:my-0 [&>*+*]:mt-1',
  '[&_p]:my-0',
  '[&_strong]:font-semibold [&_em]:italic [&_s]:line-through [&_u]:underline',
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-gray-900',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-l-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500',
  '[&_ul]:my-0 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:my-0 [&_ol]:ml-5 [&_ol]:list-decimal',
  '[&_li]:my-0',
  '[&_ul[data-type="taskList"]]:ml-0 [&_ul[data-type="taskList"]]:list-none',
  '[&_li[data-type="taskItem"]]:flex [&_li[data-type="taskItem"]]:items-start [&_li[data-type="taskItem"]>label]:mr-2 [&_li[data-type="taskItem"]>div]:min-w-0 [&_li[data-type="taskItem"]>div]:flex-1',
  '[&_li[data-type="taskItem"]_input]:mt-0.5',
  '[&_a]:text-sky-700 [&_a]:underline [&_a]:underline-offset-2',
  // Placeholder
  '[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-gray-400 [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
  CHAT_CODE_BLOCK_CLASS,
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
  '[&_blockquote]:border-l-2 [&_blockquote]:border-l-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500',
  '[&_ul]:my-0 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:my-0 [&_ol]:ml-5 [&_ol]:list-decimal',
  '[&_li]:my-0',
  '[&_ul[data-type="taskList"]]:ml-0 [&_ul[data-type="taskList"]]:list-none',
  '[&_li[data-type="taskItem"]]:flex [&_li[data-type="taskItem"]]:items-start [&_li[data-type="taskItem"]>label]:mr-2 [&_li[data-type="taskItem"]>div]:min-w-0 [&_li[data-type="taskItem"]>div]:flex-1',
  '[&_li[data-type="taskItem"]_input]:mt-0.5',
  '[&_a]:text-sky-700 [&_a]:underline [&_a]:underline-offset-2',
  CHAT_CODE_BLOCK_CLASS,
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
        let currentEditor: Editor | null = null;

        const updatePosition = (props: { clientRect?: (() => DOMRect | null) | null }) => {
          if (!popup || !props.clientRect) return;
          const rect = props.clientRect();
          if (!rect) return;
          popup.style.left = `${rect.left}px`;
          // Use actual rendered height when available; fall back to max-h-64 (256px) + padding.
          const popupHeight = popup.offsetHeight || 264;
          const spaceBelow = window.innerHeight - rect.bottom;
          if (spaceBelow < popupHeight + 8) {
            // Not enough room below — open upward instead.
            popup.style.top = `${rect.top - popupHeight - 8}px`;
          } else {
            popup.style.top = `${rect.bottom + 8}px`;
          }
        };

        // Dispatches Escape to the editor's DOM so the suggestion plugin
        // exits through the same code path as a real Escape key press.
        const dispatchEscapeToEditor = () => {
          if (!currentEditor) return;
          currentEditor.view.dom.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Escape',
              code: 'Escape',
              keyCode: 27,
              which: 27,
              bubbles: true,
              cancelable: true,
            }),
          );
        };

        const handleDocumentMousedown = (event: MouseEvent) => {
          if (!popup) return;
          const target = event.target as Node | null;
          if (target && popup.contains(target)) return;
          dispatchEscapeToEditor();
        };

        return {
          onStart: (props: unknown) => {
            currentEditor = (props as { editor: Editor }).editor;
            component = new ReactRenderer(MentionPicker, {
              props: props as Record<string, unknown>,
              editor: currentEditor,
            });
            popup = document.createElement('div');
            popup.className = 'fixed z-[9999]';
            popup.appendChild(component.element);
            document.body.appendChild(popup);
            updatePosition(props as { clientRect?: (() => DOMRect | null) | null });
            // Defer attaching so the same click that opened the popup
            // (when the user typed `@` via paste/IME) isn't caught here.
            setTimeout(() => {
              document.addEventListener('mousedown', handleDocumentMousedown);
            }, 0);
          },
          onUpdate: (props: unknown) => {
            currentEditor = (props as { editor: Editor }).editor;
            component?.updateProps(props as Record<string, unknown>);
            updatePosition(props as { clientRect?: (() => DOMRect | null) | null });
          },
          onKeyDown: (props: { event: KeyboardEvent }) => {
            if (props.event.key === 'Escape') return true;
            return component?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            document.removeEventListener('mousedown', handleDocumentMousedown);
            component?.destroy();
            popup?.remove();
            component = null;
            popup = null;
            currentEditor = null;
          },
        };
      },
    },
  });
}

// ---------------------------------------------------------------------------
// ChatCodeBlock — CodeMirror-backed rich code block for the chat composer.
// ---------------------------------------------------------------------------

function normalizeStoredChatCodeLanguage(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return normalizeChatCodeLanguage(value);
}

function focusChatCodeBlockAfterInsert(editor: Editor, insertedAtPos: number) {
  // CodeMirror mounts asynchronously, so give it two frames before sending the focus event.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      dispatchChatCodeBlockFocus({ pos: insertedAtPos, placement: 'start' });
    });
  });
}

function chatCodeBlockInputRule({
  find,
  type,
  getAttributes,
}: {
  find: InputRuleFinder;
  type: NodeType;
  getAttributes: (match: ExtendedRegExpMatchArray) => Record<string, unknown>;
}) {
  return new InputRule({
    find,
    handler: ({ state, range, match }) => {
      const $start = state.doc.resolve(range.from);
      const codeBlockPos = $start.before($start.depth);
      const attributes = getAttributes(match);

      if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), type)) {
        return null;
      }

      state.tr.delete(range.from, range.to).setBlockType(range.from, range.from, type, attributes);
      focusChatCodeBlockAfterInsert((state as any).editor ?? { state }, codeBlockPos);
    },
  });
}

/** Keeps the standard `codeBlock` node name; adds language/lineNumbers/wrapLines attrs + CodeMirror node view. */
const ChatCodeBlock = CodeBlock.extend({
  addAttributes() {
    const parentAttributes = (this.parent?.() ?? {}) as Record<string, Record<string, unknown>>;

    return {
      ...parentAttributes,
      language: {
        ...(parentAttributes.language ?? {}),
        default: null,
        parseHTML: (element: HTMLElement) => {
          const prefix = this.options.languageClassPrefix as string | undefined;
          if (!prefix) return null;
          const classNames = [...(element.firstElementChild?.classList ?? [])];
          const language = classNames
            .find((cn) => cn.startsWith(prefix))
            ?.replace(prefix, '');
          return normalizeStoredChatCodeLanguage(language);
        },
        rendered: false,
      },
      showLineNumbers: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-show-line-numbers') === 'true',
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.showLineNumbers ? { 'data-show-line-numbers': 'true' } : {},
      },
      wrapLines: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-wrap-lines') === 'true',
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.wrapLines ? { 'data-wrap-lines': 'true' } : {},
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const language = normalizeStoredChatCodeLanguage(node.attrs.language);
    const languageClassPrefix = (this.options.languageClassPrefix as string | undefined) ?? 'language-';
    const dataAttributes = {
      ...(node.attrs.showLineNumbers ? { 'data-show-line-numbers': 'true' } : {}),
      ...(node.attrs.wrapLines ? { 'data-wrap-lines': 'true' } : {}),
    };

    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes as Record<string, unknown>, HTMLAttributes, dataAttributes, {
        class: 'chat-code-block',
      }),
      [
        'code',
        {
          class: language && languageClassPrefix ? `${languageClassPrefix}${language}` : null,
        },
        0,
      ],
    ];
  },

  addInputRules() {
    return [
      chatCodeBlockInputRule({
        find: backtickInputRegex,
        type: this.type,
        getAttributes: (match) => ({
          language: normalizeStoredChatCodeLanguage(match[1]),
          showLineNumbers: false,
          wrapLines: false,
        }),
      }),
      chatCodeBlockInputRule({
        find: tildeInputRegex,
        type: this.type,
        getAttributes: (match) => ({
          language: normalizeStoredChatCodeLanguage(match[1]),
          showLineNumbers: false,
          wrapLines: false,
        }),
      }),
    ];
  },

  // Keyboard shortcut handled by the toolbar button instead.
  addKeyboardShortcuts() {
    return {};
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChatCodeBlockNodeView, {
      stopEvent: ({ event }) => {
        const target = event.target;
        return (
          target instanceof Element &&
          Boolean(
            target.closest(
              '.chat-code-block-codemirror, .chat-code-block-header, [data-chat-code-block-menu="true"]',
            ),
          )
        );
      },
    });
  },
});

/**
 * When the cursor is at the start of a paragraph immediately after a non-empty
 * code block, Backspace moves into the code editor rather than merging/deleting.
 */
const ChatCodeBlockBoundaryBackspace = Extension.create({
  name: 'chatCodeBlockBoundaryBackspace',
  priority: 1100,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty) return false;

        const { $from } = selection;
        if ($from.parent.type.name !== 'paragraph') return false;
        if ($from.parentOffset !== 0 || $from.depth === 0) return false;

        const parentDepth = $from.depth - 1;
        const index = $from.index(parentDepth);
        if (index === 0) return false;

        const previousNode = $from.node(parentDepth).child(index - 1);
        if (previousNode.type.name !== 'codeBlock' || !previousNode.textContent) return false;

        const paragraphPos = $from.before($from.depth);
        const previousCodeBlockPos = paragraphPos - previousNode.nodeSize;

        dispatchChatCodeBlockFocus({ pos: previousCodeBlockPos, placement: 'end' });
        return true;
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Public helper — used by the toolbar "Code block" button
// ---------------------------------------------------------------------------

/**
 * Inserts a new code block at the current cursor position (or focuses the
 * existing one if the cursor is already inside a code block), then dispatches
 * a focus event so CodeMirror receives keyboard input immediately.
 */
export function insertChatCodeBlockAndFocus(editor: Editor) {
  const { state } = editor;

  // If already inside a code block, just focus the existing CodeMirror view.
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.name === 'codeBlock') {
      const pos = $from.before(depth);
      dispatchChatCodeBlockFocus({ pos, placement: 'start' });
      return;
    }
  }

  // Insert via chain so the command stack (undo history) stays intact.
  editor.chain().focus().setCodeBlock().run();

  // After the transaction commits, locate the new code block and focus it.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const { $from: newFrom } = editor.state.selection;
      for (let depth = newFrom.depth; depth >= 0; depth--) {
        if (newFrom.node(depth).type.name === 'codeBlock') {
          const pos = newFrom.before(depth);
          dispatchChatCodeBlockFocus({ pos, placement: 'start' });
          return;
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Shared base extensions
// ---------------------------------------------------------------------------

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
      // Replaced by ChatCodeBlock with CodeMirror node view below.
      codeBlock: false,
    }),
    ChatCodeBlock.configure({ defaultLanguage: null }),
    ChatCodeBlockBoundaryBackspace,
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
  getMentionableUsers,
}: {
  placeholder?: string;
  /** @deprecated pass getMentionableUsers instead to avoid editor recreation on participant changes */
  participants?: CommentUserSummary[];
  /** Preferred: stable getter so extensions don't need to be recreated when participants change. */
  getMentionableUsers?: (query: string) => CommentUserSummary[];
}) {
  const itemsFn: (query: string) => CommentUserSummary[] = getMentionableUsers ?? ((query) => {
    if (!query) return participants;
    const q = query.toLowerCase();
    return participants.filter(
      (p) =>
        (p.username && p.username.toLowerCase().includes(q)) ||
        (p.email && p.email.toLowerCase().includes(q)),
    );
  });

  return [
    ...createChatBaseExtensions(),
    Placeholder.configure({
      // Only show the placeholder on the pristine single-empty-paragraph state.
      // When the user inserts a code block (or any other block), doc.textContent
      // is still empty but the document is no longer pristine, so we suppress
      // the placeholder — otherwise it bleeds over the code block header.
      placeholder: ({ editor }) => {
        const json = editor.getJSON();
        const content = json.content;
        if (!Array.isArray(content) || content.length !== 1) return '';
        const first = content[0];
        if (first.type !== 'paragraph') return '';
        if (Array.isArray(first.content) && first.content.length > 0) return '';
        return placeholder;
      },
    }),
    createChatEditorMentionExtension(itemsFn),
  ];
}
