'use client';

import {
  Extension,
  InputRule,
  mergeAttributes,
  Node,
  type InputRuleFinder,
  type ExtendedRegExpMatchArray,
} from '@tiptap/core';
import Color from '@tiptap/extension-color';
import CodeBlock, {
  backtickInputRegex,
  tildeInputRegex,
} from '@tiptap/extension-code-block';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import type { NodeType } from '@tiptap/pm/model';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { CommentAPI } from '@/lib/api/commentApi';
import type { CommentTarget, CommentUserSummary } from '@/types/comment';
import { isCommentInlineChipNodeType, isPristineEmptyDoc } from '../commentUtils';
import MentionPicker, { type MentionPickerRef } from '../MentionPicker';
import { dispatchCommentCodeBlockFocus } from './commentCodeBlockFocus';
import { normalizeCommentCodeLanguage } from './commentCodeLanguages';
import CommentCodeBlockNodeView from './nodes/CommentCodeBlockNodeView';
import CommentMediaNodeView from './nodes/CommentMediaNodeView';
import CommentPanelNodeView from './nodes/CommentPanelNodeView';
import CommentSmartLinkNodeView from './nodes/CommentSmartLinkNodeView';
import { normalizeCommentPanelType } from './commentPanel';

type ExtensionOptions = {
  target: CommentTarget;
  placeholder?: string;
  onDeleteAttachment?: (attachmentId: string) => void;
};

type CommentMediaOptions = {
  onDeleteAttachment?: (attachmentId: string) => void;
};

export const COMMENT_RICH_TEXT_CLASS = [
  'text-sm leading-6 text-gray-800',
  '[&_p]:my-1.5',
  '[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:leading-7 [&_h1]:text-gray-950',
  '[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:leading-7 [&_h2]:text-gray-950',
  '[&_h3]:mb-1.5 [&_h3]:mt-2.5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-6 [&_h3]:text-gray-950',
  '[&_h4]:mb-1.5 [&_h4]:mt-2.5 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:leading-6 [&_h4]:text-gray-950',
  '[&_h5]:mb-1 [&_h5]:mt-2 [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:leading-5 [&_h5]:text-gray-900',
  '[&_h6]:mb-1 [&_h6]:mt-2 [&_h6]:text-xs [&_h6]:font-semibold [&_h6]:uppercase [&_h6]:leading-5 [&_h6]:text-gray-600',
  '[&_strong]:font-semibold [&_em]:italic [&_s]:line-through [&_u]:underline [&_u]:underline-offset-2',
  '[&_sub]:text-[0.75em] [&_sup]:text-[0.75em]',
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-gray-900',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-l-[#DFE1E6] [&_blockquote]:pl-4 [&_blockquote]:text-[#42526E]',
  '[&_ul]:my-1.5 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:my-1.5 [&_ol]:ml-5 [&_ol]:list-decimal',
  '[&_li]:my-0.5 [&_li>p]:my-0',
  '[&_.comment-task-list]:ml-0 [&_.comment-task-list]:list-none [&_.comment-task-list]:pl-0',
  '[&_.comment-task-item]:my-1 [&_.comment-task-item]:flex [&_.comment-task-item]:list-none [&_.comment-task-item]:items-start [&_.comment-task-item]:gap-2',
  '[&_.comment-task-item>label]:mt-[3px] [&_.comment-task-item>label]:inline-flex [&_.comment-task-item>label]:shrink-0 [&_.comment-task-item>label]:items-center',
  '[&_.comment-task-item>label>input]:m-0 [&_.comment-task-item>label>input]:h-4 [&_.comment-task-item>label>input]:w-4 [&_.comment-task-item>label>input]:rounded [&_.comment-task-item>label>input]:border-gray-300 [&_.comment-task-item>label>input]:accent-green-600',
  '[&_.comment-task-item>div]:min-w-0 [&_.comment-task-item>div]:flex-1',
  '[&_.comment-task-item>div>p]:m-0 [&_.comment-task-item>div>p]:leading-6',
  '[&_a]:text-sky-700 [&_a]:underline [&_a]:underline-offset-2',
  '[&_.comment-link-selected]:rounded-sm [&_.comment-link-selected]:bg-green-50 [&_.comment-link-selected]:text-green-700 [&_.comment-link-selected]:no-underline [&_.comment-link-selected]:ring-2 [&_.comment-link-selected]:ring-green-500 [&_.comment-link-selected]:ring-offset-1',
  '[&_img]:my-2 [&_img]:max-h-72 [&_img]:max-w-full [&_img]:rounded-md [&_img]:border [&_img]:border-gray-200 [&_img]:object-contain',
  '[&_.comment-inline-chip]:my-0.5 [&_.comment-inline-chip]:inline-flex [&_.comment-inline-chip]:max-w-full [&_.comment-inline-chip]:cursor-text [&_.comment-inline-chip]:align-middle',
  '[&_.comment-inline-chip-selected]:rounded [&_.comment-inline-chip-selected]:ring-1 [&_.comment-inline-chip-selected]:ring-green-500',
].join(' ');

const COMMENT_EDITOR_RICH_TEXT_CLASS = [
  'text-sm leading-6 text-gray-800',
  // Editable spacing is root-driven so the first ProseMirror block sits on the cursor line.
  '[&>*]:my-0 [&>*+*]:mt-1.5',
  '[&_p]:my-0',
  '[&_h1]:my-0 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:leading-7 [&_h1]:text-gray-950',
  '[&_h2]:my-0 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:leading-7 [&_h2]:text-gray-950',
  '[&_h3]:my-0 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-6 [&_h3]:text-gray-950',
  '[&_h4]:my-0 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:leading-6 [&_h4]:text-gray-950',
  '[&_h5]:my-0 [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:leading-5 [&_h5]:text-gray-900',
  '[&_h6]:my-0 [&_h6]:text-xs [&_h6]:font-semibold [&_h6]:uppercase [&_h6]:leading-5 [&_h6]:text-gray-600',
  '[&_strong]:font-semibold [&_em]:italic [&_s]:line-through [&_u]:underline [&_u]:underline-offset-2',
  '[&_sub]:text-[0.75em] [&_sup]:text-[0.75em]',
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-gray-900',
  '[&_blockquote]:my-0 [&_blockquote]:border-l-2 [&_blockquote]:border-l-[#DFE1E6] [&_blockquote]:pl-4 [&_blockquote]:text-[#42526E]',
  '[&_ul]:my-0 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:my-0 [&_ol]:ml-5 [&_ol]:list-decimal',
  '[&_li]:my-0.5 [&_li>p]:my-0',
  '[&_.comment-task-list]:my-0 [&_.comment-task-list]:ml-0 [&_.comment-task-list]:list-none [&_.comment-task-list]:pl-0',
  '[&_.comment-task-item]:my-1 [&_.comment-task-item]:flex [&_.comment-task-item]:list-none [&_.comment-task-item]:items-start [&_.comment-task-item]:gap-2',
  '[&_.comment-task-item>label]:mt-[3px] [&_.comment-task-item>label]:inline-flex [&_.comment-task-item>label]:shrink-0 [&_.comment-task-item>label]:items-center',
  '[&_.comment-task-item>label>input]:m-0 [&_.comment-task-item>label>input]:h-4 [&_.comment-task-item>label>input]:w-4 [&_.comment-task-item>label>input]:rounded [&_.comment-task-item>label>input]:border-gray-300 [&_.comment-task-item>label>input]:accent-green-600',
  '[&_.comment-task-item>div]:min-w-0 [&_.comment-task-item>div]:flex-1',
  '[&_.comment-task-item>div>p]:m-0 [&_.comment-task-item>div>p]:leading-6',
  '[&_a]:text-sky-700 [&_a]:underline [&_a]:underline-offset-2',
  '[&_.comment-link-selected]:rounded-sm [&_.comment-link-selected]:bg-green-50 [&_.comment-link-selected]:text-green-700 [&_.comment-link-selected]:no-underline [&_.comment-link-selected]:ring-2 [&_.comment-link-selected]:ring-green-500 [&_.comment-link-selected]:ring-offset-1',
  '[&_img]:my-0 [&_img]:max-h-72 [&_img]:max-w-full [&_img]:rounded-md [&_img]:border [&_img]:border-gray-200 [&_img]:object-contain',
  '[&_.comment-inline-chip]:my-0.5 [&_.comment-inline-chip]:inline-flex [&_.comment-inline-chip]:max-w-full [&_.comment-inline-chip]:cursor-text [&_.comment-inline-chip]:align-middle',
  '[&_.comment-inline-chip-selected]:rounded [&_.comment-inline-chip-selected]:ring-1 [&_.comment-inline-chip-selected]:ring-green-500',
].join(' ');

const COMMENT_CODE_BLOCK_CLASS = [
  '[&_.comment-code-block]:my-2 [&_.comment-code-block]:max-w-full [&_.comment-code-block]:overflow-hidden [&_.comment-code-block]:rounded-md [&_.comment-code-block]:border [&_.comment-code-block]:border-gray-200 [&_.comment-code-block]:bg-gray-50 [&_.comment-code-block]:text-gray-900 [&_.comment-code-block]:shadow-inner [&_.comment-code-block]:shadow-gray-100/70',
  '[&_.comment-code-block-header]:flex [&_.comment-code-block-header]:min-h-9 [&_.comment-code-block-header]:flex-wrap [&_.comment-code-block-header]:items-center [&_.comment-code-block-header]:gap-1 [&_.comment-code-block-header]:border-b [&_.comment-code-block-header]:border-gray-200 [&_.comment-code-block-header]:bg-white/80 [&_.comment-code-block-header]:px-2 [&_.comment-code-block-header]:py-1',
  '[&_.comment-code-block-content]:m-0 [&_.comment-code-block-content]:max-w-full [&_.comment-code-block-content]:overflow-x-auto [&_.comment-code-block-content]:bg-transparent [&_.comment-code-block-content]:p-0 [&_.comment-code-block-content]:text-left',
  '[&_.comment-code-block-codemirror]:min-w-full',
].join(' ');

export const COMMENT_EDITOR_CONTENT_CLASS = [
  COMMENT_EDITOR_RICH_TEXT_CLASS,
  COMMENT_CODE_BLOCK_CLASS,
  'm-0 w-full break-words whitespace-pre-wrap p-0 text-sm leading-6 text-gray-900 outline-none',
  '[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-gray-400 [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
].join(' ');

export const COMMENT_RENDERER_CONTENT_CLASS = [
  COMMENT_RICH_TEXT_CLASS,
  COMMENT_CODE_BLOCK_CLASS,
].join(' ');

const HeadingExitOnEnter = Extension.create({
  name: 'commentHeadingExitOnEnter',
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty) return false;

        const { $from } = selection;
        if ($from.parent.type.name !== 'heading') return false;
        if ($from.parentOffset !== $from.parent.content.size) return false;

        return editor
          .chain()
          .command(({ state, tr, dispatch }) => {
            const paragraph = state.schema.nodes.paragraph?.create();
            if (!paragraph) return false;

            const insertPos = $from.after($from.depth);
            if (dispatch) {
              tr.insert(insertPos, paragraph);
              tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
              dispatch(tr.scrollIntoView());
            }
            return true;
          })
          .run();
      },
    };
  },
});

const CodeBlockBoundaryBackspace = Extension.create({
  name: 'commentCodeBlockBoundaryBackspace',
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

        // At the paragraph/code-block boundary, Backspace moves into the previous code editor instead of deleting it.
        dispatchCommentCodeBlockFocus({ pos: previousCodeBlockPos, placement: 'end' });
        return true;
      },
    };
  },
});

const CommentMedia = Node.create<CommentMediaOptions>({
  name: 'commentMedia',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      onDeleteAttachment: undefined,
    };
  },

  addAttributes() {
    return {
      attachmentId: { default: '' },
      uploadId: { default: null },
      src: { default: null },
      filename: { default: '' },
      contentType: { default: 'application/octet-stream' },
      size: { default: 0 },
      kind: { default: 'file' },
      status: { default: 'uploaded' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="commentMedia"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'commentMedia',
        'data-attachment-id': HTMLAttributes.attachmentId,
        'data-kind': HTMLAttributes.kind,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CommentMediaNodeView);
  },
});

const SmartLink = Node.create({
  name: 'smartLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      url: { default: '' },
      title: { default: '' },
      description: { default: null },
      siteName: { default: null },
      favicon: { default: null },
      image: { default: null },
      status: { default: 'fallback' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="smartLink"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'smartLink',
        'data-url': HTMLAttributes.url,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CommentSmartLinkNodeView);
  },
});

const CommentInlineChipSelection = Extension.create({
  name: 'commentInlineChipSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { from, to, empty } = state.selection;
            if (empty) return null;

            // Multi-node selections need explicit styling for atomic media/smart-link chips.
            const decorations: Decoration[] = [];
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (!isCommentInlineChipNodeType(node.type.name)) return;
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: 'comment-inline-chip-selected',
                }),
              );
            });

            return decorations.length > 0
              ? DecorationSet.create(state.doc, decorations)
              : null;
          },
        },
      }),
    ];
  },
});

const CommentPanel = Node.create({
  name: 'commentPanel',
  group: 'block',
  content: 'block+',
  // Panels act as standalone blocks so normal joins/lifts do not leak through the wrapper.
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (element) =>
          normalizeCommentPanelType(element.getAttribute('data-panel-type')),
        renderHTML: (attributes) => ({
          'data-panel-type': normalizeCommentPanelType(attributes.type),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="commentPanel"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'commentPanel',
        class: 'comment-panel',
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CommentPanelNodeView);
  },
});

function normalizeStoredCodeLanguage(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return normalizeCommentCodeLanguage(value);
}

function focusInputRuleCodeBlock(pos: number) {
  // CodeMirror may mount a frame after the input rule runs, so focus gets a second chance.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      dispatchCommentCodeBlockFocus({ pos, placement: 'start' });
    });
  });
}

function commentCodeBlockInputRule({
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

      // Fenced input rules bypass the toolbar path, so the new NodeView must claim CodeMirror focus.
      focusInputRuleCodeBlock(codeBlockPos);
    },
  });
}

// Keep the standard codeBlock node name while adding comment snippet UI attrs.
const CommentCodeBlock = CodeBlock.extend({
  addAttributes() {
    const parentAttributes = (this.parent?.() ?? {}) as Record<
      string,
      Record<string, unknown>
    >;

    return {
      ...parentAttributes,
      language: {
        ...(parentAttributes.language ?? {}),
        default: null,
        parseHTML: (element: HTMLElement) => {
          const languageClassPrefix = this.options.languageClassPrefix;
          if (!languageClassPrefix) return null;

          const classNames = [...(element.firstElementChild?.classList ?? [])];
          const language = classNames
            .find((className) => className.startsWith(languageClassPrefix))
            ?.replace(languageClassPrefix, '');

          return normalizeStoredCodeLanguage(language);
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
    const language = normalizeStoredCodeLanguage(node.attrs.language);
    const languageClassPrefix = this.options.languageClassPrefix ?? 'language-';
    const dataAttributes = {
      ...(node.attrs.showLineNumbers ? { 'data-show-line-numbers': 'true' } : {}),
      ...(node.attrs.wrapLines ? { 'data-wrap-lines': 'true' } : {}),
    };

    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, dataAttributes, {
        class: 'comment-code-block',
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
      commentCodeBlockInputRule({
        find: backtickInputRegex,
        type: this.type,
        getAttributes: (match) => ({
          language: normalizeStoredCodeLanguage(match[1]),
          showLineNumbers: false,
          wrapLines: false,
        }),
      }),
      commentCodeBlockInputRule({
        find: tildeInputRegex,
        type: this.type,
        getAttributes: (match) => ({
          language: normalizeStoredCodeLanguage(match[1]),
          showLineNumbers: false,
          wrapLines: false,
        }),
      }),
    ];
  },

  // Disable Tiptap's default Mod-Alt-c toggle; snippets are inserted from the toolbar
  // or fenced input rules and removed through explicit code block actions.
  addKeyboardShortcuts() {
    return {};
  },

  addNodeView() {
    return ReactNodeViewRenderer(CommentCodeBlockNodeView, {
      stopEvent: ({ event }) => {
        const target = event.target;

        // Header and portal menu controls are isolated too so Tiptap does not steal focus or selection.
        return (
          target instanceof Element &&
          Boolean(
            target.closest(
              '.comment-code-block-codemirror, .comment-code-block-header, [data-comment-code-block-menu="true"]',
            ),
          )
        );
      },
    });
  },
});

function createCommentBaseExtensions(
  options: { onDeleteAttachment?: (attachmentId: string) => void } = {},
) {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      codeBlock: false,
      horizontalRule: false,
    }),
    CommentCodeBlock.configure({
      defaultLanguage: null,
    }),
    CodeBlockBoundaryBackspace,
    HeadingExitOnEnter,
    CommentInlineChipSelection,
    CommentMedia.configure({
      onDeleteAttachment: options.onDeleteAttachment,
    }),
    CommentPanel,
    SmartLink,
    TextStyle,
    Color.configure({
      types: ['textStyle'],
    }),
    Highlight.configure({
      multicolor: true,
    }),
    Underline,
    Subscript,
    Superscript,
    TaskList.configure({
      HTMLAttributes: {
        class: 'comment-task-list not-prose',
      },
    }),
    TaskItem.configure({
      nested: true,
      HTMLAttributes: {
        class: 'comment-task-item not-prose',
      },
    }),
    Link.configure({
      autolink: true,
      // CommentLinkInteractionLayer owns link activation so native navigation cannot bypass the menu.
      openOnClick: false,
      defaultProtocol: 'https',
      HTMLAttributes: {
        class: 'text-sky-700 underline underline-offset-2',
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      },
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: {
        class: 'my-2 max-h-72 rounded-md border border-gray-200 object-contain',
      },
    }),
  ];
}

function createCommentMentionExtension(
  suggestion?: NonNullable<Parameters<typeof Mention.configure>[0]>['suggestion'],
) {
  const options = {
    HTMLAttributes: {
      class:
        'rounded bg-sky-50 px-1 py-0.5 text-sky-700 ring-1 ring-inset ring-sky-100',
    },
    renderLabel({ node }: { node: { attrs: Record<string, unknown> } }) {
      const label = node.attrs.label ?? node.attrs.id;
      return `@${String(label)}`;
    },
  };

  return Mention.configure(suggestion ? { ...options, suggestion } : options);
}

export function createCommentViewerExtensions() {
  return [
    ...createCommentBaseExtensions(),
    createCommentMentionExtension(),
  ];
}

export function createCommentEditorExtensions({
  target,
  placeholder = 'Add a comment...',
  onDeleteAttachment,
}: ExtensionOptions) {
  return [
    ...createCommentBaseExtensions({ onDeleteAttachment }),
    Placeholder.configure({
      // Tiptap considers multiple blank paragraphs empty; comments only show
      // placeholder text for the pristine one-paragraph editor state.
      placeholder: ({ editor }) =>
        isPristineEmptyDoc(editor.getJSON()) ? placeholder : '',
    }),
    createCommentMentionExtension({
      char: '@',
      items: async ({ query }: { query: string }) => {
        return CommentAPI.searchMentionUsers({
          ...target,
          q: query,
        });
      },
      command: ({
        editor,
        range,
        props,
      }: {
        editor: Editor;
        range: { from: number; to: number };
        props: any;
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

        const updatePosition = (props: any) => {
          if (!popup || !props.clientRect) return;
          const rect = props.clientRect();
          if (!rect) return;
          popup.style.left = `${rect.left}px`;
          popup.style.top = `${rect.bottom + 8}px`;
        };

        return {
          onStart: (props: any) => {
            // Render outside the editor tree so mention results are not clipped by scroll containers.
            component = new ReactRenderer(MentionPicker, {
              props,
              editor: props.editor,
            });

            popup = document.createElement('div');
            popup.className = 'fixed z-[9999]';
            popup.appendChild(component.element);
            document.body.appendChild(popup);
            updatePosition(props);
          },
          onUpdate: (props: any) => {
            component?.updateProps(props);
            updatePosition(props);
          },
          onKeyDown: (props: any) => {
            if (props.event.key === 'Escape') {
              return true;
            }
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
    }),
  ];
}
