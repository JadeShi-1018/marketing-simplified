'use client';

import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
} from 'lucide-react';
import type { TiptapJSONContent } from '@/types/comment';

/** Shared rich-text styling for internal notes (no @tailwindcss/typography in this project). */
const NOTE_CONTENT_CLASS = [
  'text-sm leading-6 text-gray-700',
  '[&_p]:my-1',
  '[&_strong]:font-semibold',
  '[&_em]:italic',
  '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-semibold',
  '[&_h2]:mt-2 [&_h2]:text-sm [&_h2]:font-semibold',
  '[&_a]:text-[#0E7490] [&_a]:underline',
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]',
].join(' ');

const noteExtensions = [
  StarterKit,
  Underline,
  Placeholder.configure({ placeholder: 'Add an internal note…' }),
];

// ── Read-only renderer ────────────────────────────────────────────────────────

export function InternalNoteContent({ body }: { body: TiptapJSONContent }) {
  const editor = useEditor({
    extensions: noteExtensions,
    content: body,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: NOTE_CONTENT_CLASS } },
  });

  useEffect(() => {
    if (editor) editor.commands.setContent(body);
  }, [editor, body]);

  return <EditorContent editor={editor} />;
}

// ── Editable editor with a small toolbar ──────────────────────────────────────

interface EditorProps {
  initialContent?: TiptapJSONContent | null;
  saving?: boolean;
  onSave: (body: TiptapJSONContent) => void;
  onCancel: () => void;
}

export function InternalNoteEditor({ initialContent, saving, onSave, onCancel }: EditorProps) {
  // Track emptiness in React state: @tiptap/react v3's useEditor does NOT re-render
  // on every keystroke, so reading editor.isEmpty during render would be stale.
  const [isEmpty, setIsEmpty] = useState(() => !initialContent);

  const editor = useEditor({
    extensions: noteExtensions,
    content: initialContent ?? '',
    immediatelyRender: false,
    autofocus: 'end',
    onUpdate: ({ editor }) => setIsEmpty(editor.isEmpty),
    editorProps: {
      attributes: {
        class: `${NOTE_CONTENT_CLASS} min-h-[64px] rounded-md border border-gray-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#86E9A8]/40`,
      },
    },
  });

  if (!editor) return null;

  const btn = (active: boolean) =>
    `rounded p-1 ${active ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100'}`;

  return (
    <div>
      <div className="mb-1 flex items-center gap-0.5">
        <button type="button" aria-label="Bold" className={btn(editor.isActive('bold'))}
          onClick={() => editor.chain().focus().toggleBold().run()}>
          <BoldIcon className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" aria-label="Italic" className={btn(editor.isActive('italic'))}
          onClick={() => editor.chain().focus().toggleItalic().run()}>
          <ItalicIcon className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" aria-label="Underline" className={btn(editor.isActive('underline'))}
          onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <button type="button" aria-label="Bullet list" className={btn(editor.isActive('bulletList'))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <ListIcon className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" aria-label="Numbered list" className={btn(editor.isActive('orderedList'))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrderedIcon className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <EditorContent editor={editor} />

      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => !editor.isEmpty && onSave(editor.getJSON() as TiptapJSONContent)}
          disabled={saving || isEmpty}
          className="rounded-md bg-gradient-to-br from-[#3CCED7] to-[#A6E661] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
