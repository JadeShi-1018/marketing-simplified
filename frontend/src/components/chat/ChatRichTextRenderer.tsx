'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useMemo } from 'react';
import type { TiptapJSONContent } from '@/types/comment';
import { createChatViewerExtensions, CHAT_RICH_TEXT_CLASS } from './editor/chatEditorExtensions';

interface ChatRichTextRendererProps {
  body: TiptapJSONContent;
  className?: string;
}

/**
 * Read-only renderer for chat messages that have a `rich_body` (Tiptap JSON).
 * Uses the minimal chat extension set (no headings, panels, code blocks, etc.).
 */
export default function ChatRichTextRenderer({ body, className }: ChatRichTextRendererProps) {
  const extensions = useMemo(() => createChatViewerExtensions(), []);

  const editor = useEditor({
    extensions,
    content: body,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: [CHAT_RICH_TEXT_CLASS, className ?? ''].filter(Boolean).join(' '),
      },
    },
  });

  useEffect(() => {
    editor?.commands.setContent(body);
  }, [editor, body]);

  return <EditorContent editor={editor} />;
}
