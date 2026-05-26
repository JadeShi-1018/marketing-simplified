'use client';

import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import ConfirmDialog from '@/components/tasks/detail/ConfirmDialog';
import { Button } from '@/components/ui/button';
import type {
  CommentAttachment,
  CommentMediaAttrs,
  CommentTarget,
  TiptapJSONContent,
} from '@/types/comment';
import CommentToolbar from './CommentToolbar';
import {
  createCommentInlineChipInsertionContent,
  EMPTY_COMMENT_DOC,
  extractCommentAttachmentIds,
  extractMentionUserIds,
  getCommentMediaKind,
  hasUploadingCommentMedia,
  isCommentInlineChipNodeType,
  isEmptyDoc,
  isSupportedCommentUploadFile,
  parseCommentApiError,
} from './commentUtils';
import {
  COMMENT_EDITOR_CONTENT_CLASS,
  createCommentEditorExtensions,
} from './editor/commentEditorExtensions';
import CommentLinkInteractionLayer from './link/CommentLinkInteractionLayer';

const SUBMIT_BUTTON_CLASS =
  'inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium leading-none transition disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto bg-gradient-to-r from-[#3CCED7] to-[#A6E661] text-white shadow-sm hover:opacity-95';
const CLEAR_BUTTON_CLASS =
  'inline-flex min-h-8 items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium leading-none text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50';
const EDITOR_BODY_SCROLL_CLASS =
  'relative max-h-[min(568px,calc(100vh-300px))] overflow-y-auto';
const EDITOR_CLICK_WRAPPER_CLASS = 'flex min-h-full flex-col';
const EDITOR_CONTENT_AREA_CLASS = 'box-border flex flex-1 flex-col px-8 py-6';
const EDITOR_CONTENT_HOST_CLASS = 'flex flex-1 flex-col';
const SHORTCUT_KEY_CLASS =
  'inline-flex min-h-5 min-w-5 items-center justify-center rounded border border-gray-200 bg-gray-50 px-1 text-[11px] font-medium leading-none text-gray-500';

function createUploadId() {
  return `upload-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function nodeEndsWithWhitespace(node: { isText?: boolean; text?: string | null } | null) {
  return Boolean(node?.isText && /\s$/.test(node.text ?? ''));
}

function nodeStartsWithWhitespace(node: { isText?: boolean; text?: string | null } | null) {
  return Boolean(node?.isText && /^\s/.test(node.text ?? ''));
}

function shouldInsertLeadingInlineChipSpace(editor: Editor) {
  const nodeBefore = editor.state.selection.$from.nodeBefore;
  if (!nodeBefore) return false;
  if (nodeBefore.isText) return !nodeEndsWithWhitespace(nodeBefore);
  return isCommentInlineChipNodeType(nodeBefore.type.name);
}

function shouldInsertTrailingInlineChipSpace(editor: Editor) {
  const nodeAfter = editor.state.selection.$to.nodeAfter;
  if (!nodeAfter) return true;
  if (nodeAfter.isText) return !nodeStartsWithWhitespace(nodeAfter);
  return isCommentInlineChipNodeType(nodeAfter.type.name);
}

type PendingCommentMediaUpload = {
  file: File;
  uploadId: string;
  node: TiptapJSONContent;
};

type CommentComposerProps = {
  target: CommentTarget;
  mode?: 'create' | 'edit';
  initialBody?: TiptapJSONContent;
  submitting?: boolean;
  onSubmit: (payload: {
    body: TiptapJSONContent;
    mentions: number[];
    attachmentIds: string[];
  }) => Promise<void>;
  onUploadAttachment: (
    file: File,
    options?: { is_inline?: boolean },
  ) => Promise<CommentAttachment>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
  onCancel?: () => void;
};

export default function CommentComposer({
  target,
  mode = 'create',
  initialBody = EMPTY_COMMENT_DOC,
  submitting,
  onSubmit,
  onUploadAttachment,
  onDeleteAttachment,
  onCancel,
}: CommentComposerProps) {
  const [uploadingCount, setUploadingCount] = useState(0);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [sendShortcutModifier, setSendShortcutModifier] = useState<'command' | 'ctrl'>('ctrl');
  const submitRef = useRef<() => void>(() => {});
  const deleteAttachmentRef = useRef(onDeleteAttachment);
  // Prevent abandon-draft cleanup from racing with a submit that is binding staged files.
  const submitInFlightRef = useRef(false);
  const stagedAttachmentIdsRef = useRef<Set<string>>(new Set());
  const placeholder = mode === 'edit' ? 'Edit comment...' : 'Add a comment...';

  useEffect(() => {
    deleteAttachmentRef.current = onDeleteAttachment;
  }, [onDeleteAttachment]);

  const deleteStagedAttachment = useCallback((attachmentId: string) => {
    if (!stagedAttachmentIdsRef.current.has(attachmentId)) return;
    stagedAttachmentIdsRef.current.delete(attachmentId);
    // This is best-effort UI cleanup; the backend TTL command is the safety net
    // for refreshes, closed tabs, and failed cleanup requests.
    void deleteAttachmentRef.current(attachmentId).catch(() => {});
  }, []);

  const cleanupAllStagedAttachments = useCallback(() => {
    Array.from(stagedAttachmentIdsRef.current).forEach(deleteStagedAttachment);
  }, [deleteStagedAttachment]);

  useEffect(() => {
    const stagedAttachmentIds = stagedAttachmentIdsRef.current;
    return () => {
      // Drawer/page unmount is the common "user abandoned the draft" path.
      if (submitInFlightRef.current) return;
      Array.from(stagedAttachmentIds).forEach(deleteStagedAttachment);
    };
  }, [deleteStagedAttachment]);

  const extensions = useMemo(
    () =>
      createCommentEditorExtensions({
        target,
        placeholder,
        onDeleteAttachment: deleteStagedAttachment,
      }),
    [deleteStagedAttachment, placeholder, target],
  );

  const editor = useEditor({
    extensions,
    content: initialBody,
    editable: !submitting,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: COMMENT_EDITOR_CONTENT_CLASS,
      },
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
          return false;
        }
        if (event.shiftKey || event.altKey) return false;

        event.preventDefault();
        submitRef.current();
        return true;
      },
    },
  });

  useEffect(() => {
    editor?.setEditable(!submitting);
  }, [editor, submitting]);

  useEffect(() => {
    const platform = window.navigator.platform;
    setSendShortcutModifier(/Mac|iPhone|iPad|iPod/i.test(platform) ? 'command' : 'ctrl');
  }, []);

  const replaceMediaPlaceholder = (uploadId: string, attrs: Partial<CommentMediaAttrs>) => {
    if (!editor) return false;
    const { state, view } = editor;
    let replaced = false;

    state.doc.descendants((node, pos) => {
      if (replaced || node.type.name !== 'commentMedia' || node.attrs.uploadId !== uploadId) {
        return;
      }
      view.dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          ...attrs,
        }),
      );
      replaced = true;
    });
    return replaced;
  };

  const removeMediaPlaceholder = (uploadId: string) => {
    if (!editor) return;
    const { state, view } = editor;
    let removed = false;

    state.doc.descendants((node, pos) => {
      if (removed || node.type.name !== 'commentMedia' || node.attrs.uploadId !== uploadId) {
        return;
      }
      view.dispatch(state.tr.delete(pos, pos + node.nodeSize));
      removed = true;
    });
  };

  const moveCursorAfterMedia = (uploadId: string) => {
    if (!editor) return;
    const { state, view } = editor;
    let selectionPos: number | null = null;

    state.doc.descendants((node, pos) => {
      if (node.type.name === 'commentMedia' && node.attrs.uploadId === uploadId) {
        selectionPos = pos + node.nodeSize;
        const nodeAfter = state.doc.resolve(selectionPos).nodeAfter;
        const leadingWhitespaceLength = nodeAfter?.isText
          ? (nodeAfter.text?.match(/^\s+/)?.[0].length ?? 0)
          : 0;
        if (leadingWhitespaceLength > 0) {
          selectionPos += leadingWhitespaceLength;
        }
        return false;
      }
    });

    if (selectionPos === null) return;
    const tr = state.tr.setSelection(
      TextSelection.near(state.doc.resolve(selectionPos), 1),
    );
    view.dispatch(tr.scrollIntoView());
  };

  const uploadInlineFiles = async (files: File[]) => {
    if (!editor || files.length === 0) return;

    const supportedFiles = files.filter(isSupportedCommentUploadFile);
    const rejectedCount = files.length - supportedFiles.length;

    if (rejectedCount > 0) {
      toast.error(
        rejectedCount === 1
          ? 'Unsupported file type skipped'
          : `${rejectedCount} unsupported file types skipped`,
      );
    }

    if (supportedFiles.length === 0) return;

    const pendingUploads: PendingCommentMediaUpload[] = supportedFiles.map((file) => {
      const uploadId = createUploadId();
      const kind = getCommentMediaKind(file.type || 'application/octet-stream');

      return {
        file,
        uploadId,
        node: {
          type: 'commentMedia',
          attrs: {
            attachmentId: '',
            uploadId,
            src: null,
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
            kind,
            status: 'uploading',
          },
        },
      };
    });

    editor
      .chain()
      .focus()
      .insertContent(
        createCommentInlineChipInsertionContent(
          pendingUploads.map((upload) => upload.node),
          {
            leadingSpace: shouldInsertLeadingInlineChipSpace(editor),
            trailingSpace: shouldInsertTrailingInlineChipSpace(editor),
          },
        ),
      )
      .run();

    moveCursorAfterMedia(pendingUploads[pendingUploads.length - 1].uploadId);

    pendingUploads.forEach(({ file, uploadId }) => {
      setUploadingCount((count) => count + 1);
      void onUploadAttachment(file, { is_inline: true })
        .then((attachment) => {
          stagedAttachmentIdsRef.current.add(attachment.id);
          const replaced = replaceMediaPlaceholder(uploadId, {
            attachmentId: attachment.id,
            uploadId: null,
            src: attachment.file_url,
            filename: attachment.filename,
            contentType: attachment.content_type,
            size: attachment.size,
            kind: getCommentMediaKind(attachment.content_type),
            status: 'uploaded',
          });
          if (!replaced) {
            // The user may have deleted the uploading chip before the request finished.
            deleteStagedAttachment(attachment.id);
          }
        })
        .catch((error) => {
          removeMediaPlaceholder(uploadId);
          toast.error(parseCommentApiError(error, 'Upload failed'));
        })
        .finally(() => {
          setUploadingCount((count) => Math.max(0, count - 1));
        });
    });
  };

  const getSubmitAttachmentIds = (body: TiptapJSONContent) => {
    const ids = new Set<string>();
    extractCommentAttachmentIds(body).forEach((id) => ids.add(id));
    return Array.from(ids);
  };

  const cleanupUnreferencedStagedAttachments = (body: TiptapJSONContent) => {
    // Keyboard edits can remove media nodes without going through the chip menu.
    const referencedIds = new Set(extractCommentAttachmentIds(body));
    Array.from(stagedAttachmentIdsRef.current)
      .filter((attachmentId) => !referencedIds.has(attachmentId))
      .forEach(deleteStagedAttachment);
  };

  const submit = async () => {
    if (!editor) return;
    const body = editor.getJSON() as TiptapJSONContent;

    if (uploadingCount > 0 || hasUploadingCommentMedia(body)) {
      toast.error('Please wait for uploads to finish');
      return;
    }

    if (isEmptyDoc(body)) return;

    submitInFlightRef.current = true;
    try {
      cleanupUnreferencedStagedAttachments(body);
      await onSubmit({
        body,
        mentions: extractMentionUserIds(body),
        attachmentIds: getSubmitAttachmentIds(body),
      });
      stagedAttachmentIdsRef.current.clear();
      if (mode === 'create') {
        editor.commands.setContent(EMPTY_COMMENT_DOC);
      }
    } catch {
      // Callers own user-facing error handling so edit mode can stay open.
    } finally {
      submitInFlightRef.current = false;
    }
  };

  const clearAll = () => {
    cleanupAllStagedAttachments();
    editor?.commands.setContent(EMPTY_COMMENT_DOC);
    setConfirmingClear(false);
  };

  const cancel = () => {
    cleanupAllStagedAttachments();
    onCancel?.();
  };

  const disabled = Boolean(submitting);
  const submitDisabled = Boolean(disabled || uploadingCount > 0);
  submitRef.current = () => {
    if (submitDisabled) return;
    void submit();
  };

  return (
    <div className="flex flex-col overflow-visible rounded-md border border-gray-200 bg-white shadow-sm">
      <CommentToolbar
        editor={editor}
        disabled={disabled}
        uploadingMedia={uploadingCount > 0}
        onFilesSelected={uploadInlineFiles}
      />
      <div className={EDITOR_BODY_SCROLL_CLASS}>
        <div className={EDITOR_CLICK_WRAPPER_CLASS}>
          <div className={EDITOR_CONTENT_AREA_CLASS}>
            <EditorContent editor={editor} className={EDITOR_CONTENT_HOST_CLASS} />
            <CommentLinkInteractionLayer editor={editor} />
          </div>
        </div>
      </div>
      <div className="border-t border-gray-100 px-3 py-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant={null}
            size={null}
            className={CLEAR_BUTTON_CLASS}
            disabled={disabled}
            onClick={() => setConfirmingClear(true)}
          >
            Clear all
          </Button>
          <div className="flex items-center justify-end gap-2">
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={cancel}
              >
                Cancel
              </Button>
            )}
            {mode === 'create' && (
              <span className="hidden items-center gap-1 text-xs text-gray-400 sm:inline-flex">
                Press
                <kbd
                  className={SHORTCUT_KEY_CLASS}
                  aria-label={sendShortcutModifier === 'command' ? 'Command' : 'Control'}
                >
                  {sendShortcutModifier === 'command' ? '⌘' : 'Ctrl'}
                </kbd>
                <span className="text-gray-300">+</span>
                <kbd className={SHORTCUT_KEY_CLASS}>Enter</kbd>
                to send
              </span>
            )}
            <Button
              type="button"
              variant={null}
              size={null}
              className={SUBMIT_BUTTON_CLASS}
              disabled={submitDisabled}
              onClick={() => void submit()}
            >
              {submitting
                ? 'Saving...'
                : uploadingCount > 0
                  ? 'Uploading...'
                  : mode === 'edit'
                    ? 'Save'
                    : 'Comment'}
            </Button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmingClear}
        onOpenChange={setConfirmingClear}
        title="Clear all comment content?"
        description="This will remove everything from the comment editor."
        confirmLabel="Clear"
        cancelLabel="Cancel"
        destructive
        busy={disabled}
        onConfirm={clearAll}
      />
    </div>
  );
}
