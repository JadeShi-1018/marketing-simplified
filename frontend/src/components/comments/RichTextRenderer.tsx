'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useMemo } from 'react';
import type { TiptapJSONContent } from '@/types/comment';
import {
  COMMENT_RENDERER_CONTENT_CLASS,
  createCommentViewerExtensions,
} from './editor/commentEditorExtensions';
import CommentLinkInteractionLayer from './link/CommentLinkInteractionLayer';

export default function RichTextRenderer({ body }: { body: TiptapJSONContent }) {
  const extensions = useMemo(
    () => createCommentViewerExtensions(),
    [],
  );

  const editor = useEditor({
    extensions,
    content: body,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: COMMENT_RENDERER_CONTENT_CLASS,
      },
    },
  });

  useEffect(() => {
    editor?.commands.setContent(body);
  }, [editor, body]);

  return (
    <>
      <EditorContent editor={editor} />
      <CommentLinkInteractionLayer editor={editor} />
    </>
  );
}
