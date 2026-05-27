'use client';

import {
  NodeViewWrapper,
  useEditorState,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection, type Transaction } from '@tiptap/pm/state';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import {
  Check,
  ChevronDown,
  Copy,
  ListOrdered,
  Trash2,
  WrapText,
} from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  COMMENT_CODE_LANGUAGE_OPTIONS,
  getCommentCodeLanguageLabel,
  normalizeCommentCodeLanguage,
} from '../commentCodeLanguages';
import {
  COMMENT_CODE_BLOCK_FOCUS_EVENT,
  dispatchCommentCodeBlockFocus,
  dispatchCommentCodeBlockActive,
  focusElementPreventScroll,
  withPreservedScroll,
  type CommentCodeBlockFocusDetail,
} from '../commentCodeBlockFocus';
import { getCommentCodeMirrorLanguageExtension } from '../commentCodeMirrorLanguages';

type CommentCodeBlockAttrs = {
  language?: string | null;
  showLineNumbers?: boolean;
  wrapLines?: boolean;
};

function getAttrs(props: ReactNodeViewProps): Required<CommentCodeBlockAttrs> {
  const attrs = props.node.attrs as CommentCodeBlockAttrs;
  return {
    language: attrs.language ?? null,
    showLineNumbers: Boolean(attrs.showLineNumbers),
    wrapLines: Boolean(attrs.wrapLines),
  };
}

const CODE_MIRROR_THEME = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: '#111827',
    fontSize: '0.82rem',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineHeight: '1.25rem',
  },
  '.cm-content': {
    caretColor: '#111827',
    minHeight: '1.25rem',
    padding: '0.5rem 0.75rem',
  },
  '.cm-line': {
    padding: '0',
  },
  '.cm-gutters': {
    backgroundColor: 'rgba(243, 244, 246, 0.7)',
    borderRight: '1px solid #e5e7eb',
    color: '#9ca3af',
    fontSize: '0.78rem',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '2rem',
    padding: '0 0.5rem',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(186, 230, 253, 0.7)',
  },
});

const CODE_MIRROR_CONTENT_ATTRIBUTES = EditorView.contentAttributes.of({
  autocapitalize: 'off',
  autocorrect: 'off',
  spellcheck: 'false',
  'data-enable-grammarly': 'false',
  'data-gramm': 'false',
  'data-gramm_editor': 'false',
});

function getLineNumberExtensions(showLineNumbers: boolean): Extension[] {
  return showLineNumbers ? [lineNumbers()] : [];
}

function getWrapExtensions(wrapLines: boolean): Extension[] {
  return wrapLines ? [EditorView.lineWrapping] : [];
}

function getEditableExtensions(editable: boolean): Extension[] {
  return [EditorState.readOnly.of(!editable), EditorView.editable.of(editable)];
}

function clampSelectionPosition(position: number, docLength: number) {
  return Math.max(0, Math.min(position, docLength));
}

function replaceCodeBlockText(props: ReactNodeViewProps, nextText: string) {
  const pos = props.getPos();
  if (typeof pos !== 'number') return false;

  const { state, view } = props.editor;
  const currentNode = state.doc.nodeAt(pos);
  if (!currentNode || currentNode.type.name !== props.node.type.name) return false;
  if (currentNode.textContent === nextText) return true;

  const from = pos + 1;
  const to = from + currentNode.content.size;
  // Update only the node text so language/wrapping attrs and the NodeView instance survive.
  view.dispatch(state.tr.insertText(nextText, from, to));
  return true;
}

function getTopLevelNodeBefore(doc: ProseMirrorNode, pos: number) {
  if (pos <= 0) return null;

  const $pos = doc.resolve(Math.min(pos, doc.content.size));
  const index = $pos.index(0);
  if (index <= 0) return null;

  const node = doc.child(index - 1);
  return { node, pos: pos - node.nodeSize };
}

function setSelectionInParagraphNear(tr: Transaction, pos: number) {
  const doc = tr.doc;
  const paragraphType = doc.type.schema.nodes.paragraph;
  const targetPos = Math.max(0, Math.min(pos, doc.content.size));
  const targetNode = doc.nodeAt(targetPos);

  // After deleting a CodeMirror-backed block, keep the cursor in an editable paragraph.
  if (targetNode?.type.name === 'paragraph') {
    return tr.setSelection(TextSelection.create(doc, targetPos + 1));
  }

  const before = getTopLevelNodeBefore(doc, targetPos);
  if (before?.node.type.name === 'paragraph') {
    const selectionPos = before.pos + 1 + before.node.content.size;
    return tr.setSelection(TextSelection.create(doc, selectionPos));
  }

  if (paragraphType) {
    const paragraph = paragraphType.create();
    const insertPos = targetPos;
    tr = tr.insert(insertPos, paragraph);
    return tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  }

  return tr.setSelection(TextSelection.near(doc.resolve(targetPos), -1));
}

function deleteCodeBlockNode(props: ReactNodeViewProps) {
  const pos = props.getPos();
  if (typeof pos !== 'number') return false;

  const { state, view } = props.editor;
  const node = state.doc.nodeAt(pos);
  if (!node || node.type.name !== props.node.type.name) return false;

  const paragraph = state.schema.nodes.paragraph?.create();
  const isOnlyTopLevelNode = state.doc.childCount === 1;

  let tr =
    paragraph && isOnlyTopLevelNode
      ? state.tr.replaceWith(pos, pos + node.nodeSize, paragraph)
      : state.tr.delete(pos, pos + node.nodeSize);
  withPreservedScroll(view.dom, () => {
    view.dispatch(setSelectionInParagraphNear(tr, pos));
  });
  focusElementPreventScroll(view.dom);
  return true;
}

function moveFromCodeBlockBoundary(
  props: ReactNodeViewProps,
  direction: 'up' | 'down',
) {
  const pos = props.getPos();
  if (typeof pos !== 'number') return false;

  const { state, view } = props.editor;
  const currentNode = state.doc.nodeAt(pos);
  if (!currentNode || currentNode.type.name !== props.node.type.name) return false;

  const $pos = state.doc.resolve(pos);
  const index = $pos.index();
  const parent = $pos.parent;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= parent.childCount) return false;

  const targetNode = parent.child(targetIndex);
  const targetPos =
    direction === 'up' ? pos - targetNode.nodeSize : pos + currentNode.nodeSize;

  if (targetNode.type.name === 'codeBlock') {
    dispatchCommentCodeBlockFocus({
      pos: targetPos,
      placement: direction === 'up' ? 'end' : 'start',
    });
    return true;
  }

  // CodeMirror owns arrow keys inside snippets; at the outer edge, hand navigation back to Tiptap.
  const selectionPos = targetNode.isTextblock
    ? direction === 'up'
      ? targetPos + 1 + targetNode.content.size
      : targetPos + 1
    : direction === 'up'
      ? targetPos + targetNode.nodeSize - 1
      : targetPos + 1;
  const selection = targetNode.isTextblock
    ? TextSelection.create(state.doc, selectionPos)
    : TextSelection.near(state.doc.resolve(selectionPos), direction === 'up' ? -1 : 1);

  withPreservedScroll(view.dom, () => {
    view.dispatch(state.tr.setSelection(selection).scrollIntoView());
  });
  focusElementPreventScroll(view.dom);
  return true;
}

function CodeBlockActionTooltip({
  label,
  hidden,
  children,
}: {
  label: string;
  hidden?: boolean;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: rect.top - 6,
        left: rect.left + rect.width / 2,
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  return (
    <span
      ref={triggerRef}
      className="inline-flex"
      onMouseEnter={() => {
        if (!hidden) setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => {
        if (!hidden) setOpen(true);
      }}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <span
              className="pointer-events-none fixed z-[10000] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-gray-950 px-2 py-1 text-[11px] font-medium text-white opacity-100 shadow-sm"
              style={{ top: position.top, left: position.left }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

function CodeBlockActionButton({
  label,
  active,
  disabled,
  tooltipHidden,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  tooltipHidden?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <CodeBlockActionTooltip label={label} hidden={tooltipHidden}>
      <button
        type="button"
        aria-label={label}
        data-active={active}
        disabled={disabled}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-300 disabled:pointer-events-none disabled:opacity-40 data-[active=true]:bg-green-50 data-[active=true]:text-green-700 data-[active=true]:hover:bg-green-100"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
      >
        {children}
      </button>
    </CodeBlockActionTooltip>
  );
}

function CopyFeedback({
  anchorRef,
  state,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  state: 'idle' | 'copied' | 'failed';
}) {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (state === 'idle') return;

    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: rect.top - 6,
        left: rect.left + rect.width / 2,
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [anchorRef, state]);

  if (state === 'idle' || typeof document === 'undefined') return null;

  return createPortal(
    <span
      className="pointer-events-none fixed z-[10000] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-gray-950 px-2 py-1 text-[11px] font-medium text-white shadow-sm"
      style={{ top: position.top, left: position.left }}
    >
      {state === 'copied' ? 'Copied' : 'Copy failed'}
    </span>,
    document.body,
  );
}

export default function CommentCodeBlockNodeView(props: ReactNodeViewProps) {
  const attrs = getAttrs(props);
  const nodeText = props.node.textContent;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const propsRef = useRef(props);
  const syncingRef = useRef(false);
  const lastSyncedTextRef = useRef(nodeText);
  const languageCompartmentRef = useRef(new Compartment());
  const lineNumberCompartmentRef = useRef(new Compartment());
  const wrapCompartmentRef = useRef(new Compartment());
  const editableCompartmentRef = useRef(new Compartment());
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  }) ?? props.editor.isEditable;
  const language = normalizeCommentCodeLanguage(attrs.language);
  const languageLabel = getCommentCodeLanguageLabel(language);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [languageOpen, setLanguageOpen] = useState(false);
  const copyButtonRef = useRef<HTMLSpanElement | null>(null);

  // CodeMirror handlers outlive React renders, so read fresh node/getPos/editor props from a ref.
  propsRef.current = props;

  const getCurrentCodeText = useCallback(() => {
    return viewRef.current?.state.doc.toString() ?? propsRef.current.node.textContent;
  }, []);

  const focusCodeMirrorSoon = useCallback(() => {
    window.requestAnimationFrame(() => {
      const view = viewRef.current;
      if (!view) return;

      // Prevent-scroll focus keeps header/menu interactions from jumping the editor viewport.
      focusElementPreventScroll(view.contentDOM);
    });
  }, []);

  const syncCodeMirrorTextToTiptap = useCallback((text = getCurrentCodeText()) => {
    if (syncingRef.current) return false;

    // CodeMirror is the editing-time source of truth; Tiptap stores the same text for persistence.
    syncingRef.current = true;
    try {
      const synced = replaceCodeBlockText(propsRef.current, text);
      if (synced) lastSyncedTextRef.current = text;
      return synced;
    } finally {
      syncingRef.current = false;
    }
  }, [getCurrentCodeText]);

  const updateCodeBlockAttrsPreservingCode = useCallback(
    (nextAttrs: Partial<CommentCodeBlockAttrs>) => {
      // Attribute changes must not overwrite unsynced CodeMirror text.
      const text = getCurrentCodeText();
      const currentProps = propsRef.current;
      const pos = currentProps.getPos();
      if (typeof pos !== 'number') return;

      const { state, view } = currentProps.editor;
      const node = state.doc.nodeAt(pos);
      if (!node || node.type.name !== currentProps.node.type.name) return;

      // Attr updates must carry the current CodeMirror text so stale Tiptap node text cannot hydrate back.
      const attrsToApply = { ...node.attrs, ...nextAttrs };
      let tr = state.tr.setNodeMarkup(pos, undefined, attrsToApply);
      if (node.textContent !== text) {
        tr = tr.insertText(text, pos + 1, pos + 1 + node.content.size);
      }

      syncingRef.current = true;
      try {
        view.dispatch(tr);
        lastSyncedTextRef.current = text;
      } finally {
        syncingRef.current = false;
      }
    },
    [getCurrentCodeText],
  );

  useEffect(() => {
    if (copyState === 'idle') return;
    const timeout = window.setTimeout(() => setCopyState('idle'), 1600);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(getCurrentCodeText());
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    // CodeMirror owns code editing; Tiptap keeps the enclosing node for persistence/history.
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: propsRef.current.node.textContent,
        extensions: [
          history(),
          drawSelection(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          closeBrackets(),
          EditorView.domEventHandlers({
            focus: () => {
              const pos = propsRef.current.getPos();
              dispatchCommentCodeBlockActive(
                typeof pos === 'number' ? { active: true, pos } : { active: true },
              );
            },
            blur: () => {
              dispatchCommentCodeBlockActive({ active: false });
            },
          }),
          keymap.of([
            {
              key: 'Backspace',
              run: (codeMirrorView) => {
                const selection = codeMirrorView.state.selection.main;
                const isEmptyAtStart =
                  codeMirrorView.state.doc.length === 0 &&
                  selection.empty &&
                  selection.from === 0;
                if (!isEmptyAtStart) return false;

                // Empty Backspace removes the wrapper node; non-empty code keeps normal CodeMirror deletion.
                return deleteCodeBlockNode(propsRef.current);
              },
            },
            {
              key: 'ArrowUp',
              run: (codeMirrorView) => {
                const selection = codeMirrorView.state.selection.main;
                if (!selection.empty) return false;

                const line = codeMirrorView.state.doc.lineAt(selection.head);
                if (line.number !== 1) return false;

                return moveFromCodeBlockBoundary(propsRef.current, 'up');
              },
            },
            {
              key: 'ArrowDown',
              run: (codeMirrorView) => {
                const selection = codeMirrorView.state.selection.main;
                if (!selection.empty) return false;

                const line = codeMirrorView.state.doc.lineAt(selection.head);
                if (line.number !== codeMirrorView.state.doc.lines) return false;

                return moveFromCodeBlockBoundary(propsRef.current, 'down');
              },
            },
            ...closeBracketsKeymap,
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          CODE_MIRROR_CONTENT_ATTRIBUTES,
          CODE_MIRROR_THEME,
          languageCompartmentRef.current.of(
            getCommentCodeMirrorLanguageExtension(propsRef.current.node.attrs.language),
          ),
          lineNumberCompartmentRef.current.of(
            getLineNumberExtensions(Boolean(propsRef.current.node.attrs.showLineNumbers)),
          ),
          wrapCompartmentRef.current.of(
            getWrapExtensions(Boolean(propsRef.current.node.attrs.wrapLines)),
          ),
          editableCompartmentRef.current.of(
            getEditableExtensions(propsRef.current.editor.isEditable),
          ),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || syncingRef.current) return;

            const nextText = update.state.doc.toString();
            // The sync guard prevents ProseMirror transactions from echoing back into CodeMirror.
            syncCodeMirrorTextToTiptap(nextText);
          }),
        ],
      }),
    });

    viewRef.current = view;

    return () => {
      dispatchCommentCodeBlockActive({ active: false });
      view.destroy();
      viewRef.current = null;
    };
  }, [syncCodeMirrorTextToTiptap]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const nextText = nodeText;
    const currentText = view.state.doc.toString();
    if (currentText === nextText) return;
    if (syncingRef.current || nextText === lastSyncedTextRef.current) return;

    const head = clampSelectionPosition(view.state.selection.main.head, nextText.length);
    const anchor = clampSelectionPosition(view.state.selection.main.anchor, nextText.length);

    // Only real external text changes, such as loading saved content for edit, hydrate CodeMirror.
    syncingRef.current = true;
    try {
      view.dispatch({
        changes: { from: 0, to: currentText.length, insert: nextText },
        selection: { anchor, head },
      });
      lastSyncedTextRef.current = nextText;
    } finally {
      syncingRef.current = false;
    }
  }, [nodeText]);

  useEffect(() => {
    const handleFocusRequest = (event: Event) => {
      // Toolbar and input rules focus snippets through this NodeView-owned event.
      const detail = (event as CustomEvent<CommentCodeBlockFocusDetail>).detail;
      const pos = propsRef.current.getPos();
      if (typeof detail?.pos === 'number' && detail.pos !== pos) return;

      const view = viewRef.current;
      if (view) {
        const selectionPos = detail?.placement === 'end' ? view.state.doc.length : 0;
        view.dispatch({ selection: { anchor: selectionPos } });
      }
      focusCodeMirrorSoon();
    };

    window.addEventListener(COMMENT_CODE_BLOCK_FOCUS_EVENT, handleFocusRequest);
    return () => window.removeEventListener(COMMENT_CODE_BLOCK_FOCUS_EVENT, handleFocusRequest);
  }, [focusCodeMirrorSoon]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: languageCompartmentRef.current.reconfigure(
        getCommentCodeMirrorLanguageExtension(language),
      ),
    });
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: lineNumberCompartmentRef.current.reconfigure(
        getLineNumberExtensions(attrs.showLineNumbers),
      ),
    });
  }, [attrs.showLineNumbers]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: wrapCompartmentRef.current.reconfigure(getWrapExtensions(attrs.wrapLines)),
    });
  }, [attrs.wrapLines]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: editableCompartmentRef.current.reconfigure(getEditableExtensions(editable)),
    });
  }, [editable]);

  return (
    <NodeViewWrapper
      as="div"
      data-type="codeBlock"
      data-language={attrs.language ?? undefined}
      data-show-line-numbers={attrs.showLineNumbers || undefined}
      data-wrap-lines={attrs.wrapLines || undefined}
      className="comment-code-block my-2 max-w-full overflow-hidden rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-900 shadow-inner shadow-gray-100/70"
    >
      <div
        className="comment-code-block-header flex min-h-9 flex-wrap items-center gap-1 border-b border-gray-200 bg-white/80 px-2 py-1"
        contentEditable={false}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {editable ? (
          <Popover open={languageOpen} onOpenChange={setLanguageOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 max-w-full items-center gap-1.5 rounded px-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <span className="truncate">{languageLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              data-comment-code-block-menu="true"
              className="max-h-72 w-44 overflow-y-auto border-gray-200 p-1"
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                focusCodeMirrorSoon();
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {COMMENT_CODE_LANGUAGE_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  data-active={language === option.value}
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-gray-700 outline-none transition hover:bg-gray-100 data-[active=true]:bg-green-50 data-[active=true]:font-medium data-[active=true]:text-gray-900 data-[active=true]:hover:bg-green-50"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={() => {
                    updateCodeBlockAttrsPreservingCode({ language: option.value });
                    setLanguageOpen(false);
                    focusCodeMirrorSoon();
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {language === option.value ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : null}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        ) : (
          <span className="inline-flex h-7 max-w-full items-center rounded px-2 text-xs font-semibold text-gray-700">
            <span className="truncate">{languageLabel}</span>
          </span>
        )}

        <div className="ml-auto inline-flex items-center gap-0.5">
          {editable ? (
            <>
              <CodeBlockActionButton
                label={attrs.showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
                active={attrs.showLineNumbers}
                onClick={() => {
                  updateCodeBlockAttrsPreservingCode({
                    showLineNumbers: !attrs.showLineNumbers,
                  });
                  focusCodeMirrorSoon();
                }}
              >
                <ListOrdered className="h-3.5 w-3.5" />
              </CodeBlockActionButton>
              <CodeBlockActionButton
                label={attrs.wrapLines ? 'Disable line wrapping' : 'Wrap long lines'}
                active={attrs.wrapLines}
                onClick={() => {
                  updateCodeBlockAttrsPreservingCode({ wrapLines: !attrs.wrapLines });
                  focusCodeMirrorSoon();
                }}
              >
                <WrapText className="h-3.5 w-3.5" />
              </CodeBlockActionButton>
            </>
          ) : null}
          <span ref={copyButtonRef} className="inline-flex">
            <CodeBlockActionButton
              label="Copy code"
              tooltipHidden={copyState !== 'idle'}
              onClick={() => void copyCode()}
            >
              <Copy className={cn('h-3.5 w-3.5', copyState === 'failed' && 'text-rose-600')} />
            </CodeBlockActionButton>
            <CopyFeedback anchorRef={copyButtonRef} state={copyState} />
          </span>
          {editable ? (
            <CodeBlockActionButton
              label="Delete code snippet"
              onClick={() => {
                deleteCodeBlockNode(propsRef.current);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </CodeBlockActionButton>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          'comment-code-block-content m-0 max-w-full overflow-x-auto bg-transparent p-0 text-left',
          attrs.wrapLines && 'overflow-x-hidden',
        )}
      >
        <div
          ref={containerRef}
          className={cn(
            'comment-code-block-codemirror min-w-0',
            !attrs.wrapLines && 'min-w-max',
          )}
          contentEditable={false}
        />
      </div>
    </NodeViewWrapper>
  );
}
