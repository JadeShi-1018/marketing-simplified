'use client';

import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  ChevronDown,
  Check,
  Code,
  CodeXml,
  FileUp,
  Highlighter,
  Info,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo2,
} from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import EmojiPicker from './EmojiPicker';
import { COMMENT_UPLOAD_ACCEPT } from './commentUtils';
import {
  COMMENT_CODE_BLOCK_ACTIVE_EVENT,
  dispatchCommentCodeBlockFocus,
  focusElementPreventScroll,
  withPreservedScroll,
  type CommentCodeBlockActiveDetail,
} from './editor/commentCodeBlockFocus';
import CommentLinkPopover from './link/CommentLinkPopover';
import { insertCommentLink } from './link/commentLinkUtils';

type CommentToolbarProps = {
  editor: Editor | null;
  disabled?: boolean;
  uploadingMedia?: boolean;
  onFilesSelected: (files: File[]) => void;
};

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  onMouseDown?: (event: MouseEvent<HTMLButtonElement>) => void;
};

type TextStyleOption = {
  label: string;
  className: string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
};

type ListType = 'bullet' | 'ordered' | 'task';

type ToolbarState = {
  headingLevel: 1 | 2 | 3 | 4 | 5 | 6 | null;
  listType: ListType | null;
  marks: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    code: boolean;
    subscript: boolean;
    superscript: boolean;
    link: boolean;
  };
  textColor: string | null;
  backgroundColor: string | null;
  blockquote: boolean;
  codeBlock: boolean;
  inCommentPanel: boolean;
  canClearFormatting: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

type PaletteColor = {
  name: string;
  value: string;
};

const toolbarButtonClassName =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-300 disabled:pointer-events-none disabled:opacity-40 data-[active=true]:bg-green-50 data-[active=true]:text-green-700 data-[active=true]:hover:bg-green-100';

const dropdownItemClassName =
  'flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-xs text-gray-700 outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[active=true]:bg-green-50 data-[active=true]:text-green-700 data-[active=true]:hover:bg-green-50';

const textStyleOptions: TextStyleOption[] = [
  { label: 'Normal text', className: 'text-xs font-medium' },
  { label: 'Heading 1', level: 1, className: 'text-lg font-semibold leading-5' },
  { label: 'Heading 2', level: 2, className: 'text-base font-semibold leading-5' },
  { label: 'Heading 3', level: 3, className: 'text-sm font-semibold leading-5' },
  { label: 'Heading 4', level: 4, className: 'text-xs font-semibold leading-5' },
  { label: 'Heading 5', level: 5, className: 'text-xs font-semibold leading-5' },
  {
    label: 'Heading 6',
    level: 6,
    className: 'text-[11px] font-semibold uppercase leading-5 text-gray-600',
  },
];

const textPalette: PaletteColor[] = [
  { name: 'Dark gray', value: '#172B4D' },
  { name: 'Dark blue', value: '#0C66E4' },
  { name: 'Dark teal', value: '#206A83' },
  { name: 'Dark green', value: '#216E4E' },
  { name: 'Dark orange', value: '#A54800' },
  { name: 'Dark red', value: '#AE2E24' },
  { name: 'Dark purple', value: '#5E4DB2' },
  { name: 'Gray', value: '#626F86' },
  { name: 'Blue', value: '#1D7AFC' },
  { name: 'Teal', value: '#2898BD' },
  { name: 'Green', value: '#22A06B' },
  { name: 'Yellow', value: '#FCA700' },
  { name: 'Red', value: '#C9372C' },
  { name: 'Purple', value: '#AF59E1' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Light blue', value: '#CCE0FF' },
  { name: 'Light teal', value: '#C6EDFB' },
  { name: 'Light green', value: '#BAF3DB' },
  { name: 'Light yellow', value: '#F8E6A0' },
  { name: 'Light red', value: '#FFD5D2' },
  { name: 'Light purple', value: '#EED7FC' },
];

const backgroundPalette: PaletteColor[] = [
  { name: 'Light gray', value: '#F1F2F4' },
  { name: 'Light blue', value: '#E9F2FE' },
  { name: 'Light teal', value: '#E7F9FF' },
  { name: 'Light green', value: '#DCFFF1' },
  { name: 'Light yellow', value: '#FEF7C8' },
  { name: 'Light red', value: '#FFECEB' },
  { name: 'Light purple', value: '#F8EEFE' },
  { name: 'Gray', value: '#DCDFE4' },
  { name: 'Blue', value: '#CCE0FF' },
  { name: 'Teal', value: '#C6EDFB' },
  { name: 'Green', value: '#BAF3DB' },
  { name: 'Yellow', value: '#F8E6A0' },
  { name: 'Red', value: '#FFD5D2' },
  { name: 'Purple', value: '#EED7FC' },
];

const defaultToolbarState: ToolbarState = {
  headingLevel: null,
  listType: null,
  marks: {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    code: false,
    subscript: false,
    superscript: false,
    link: false,
  },
  textColor: null,
  backgroundColor: null,
  blockquote: false,
  codeBlock: false,
  inCommentPanel: false,
  canClearFormatting: false,
  canUndo: false,
  canRedo: false,
};

function ToolbarTooltip({
  label,
  hidden,
  children,
}: {
  label: string;
  hidden?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-950 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100',
          hidden && 'hidden',
        )}
      >
        {label}
      </span>
    </span>
  );
}

function ToolbarButton({
  label,
  active = false,
  disabled,
  children,
  className,
  onClick,
  onMouseDown,
}: ToolbarButtonProps) {
  return (
    <ToolbarTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        data-active={active}
        disabled={disabled}
        className={cn(toolbarButtonClassName, className)}
        onMouseDown={onMouseDown}
        onClick={onClick}
      >
        {children}
      </button>
    </ToolbarTooltip>
  );
}

function ToolbarSeparator() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-gray-200" aria-hidden="true" />;
}

function ToolbarPopover({
  label,
  active,
  disabled,
  trigger,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  trigger: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ToolbarTooltip label={label} hidden={open}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            data-active={active}
            disabled={disabled}
            className={toolbarButtonClassName}
          >
            {trigger}
          </button>
        </PopoverTrigger>
      </ToolbarTooltip>
      <PopoverContent className="w-56 border-gray-200 p-3" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function ToolbarDropdown({
  label,
  active,
  disabled,
  open,
  onOpenChange,
  trigger,
  children,
  contentClassName,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <ToolbarTooltip label={label} hidden={open}>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            aria-label={label}
            data-active={active}
            disabled={disabled}
            className={toolbarButtonClassName}
          >
            {trigger}
          </button>
        </DropdownMenuTrigger>
      </ToolbarTooltip>
      <DropdownMenuContent
        className={cn('border-gray-200 p-1', contentClassName)}
        align="start"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export {
  ToolbarButton,
  ToolbarDropdown,
  ToolbarPopover,
  ToolbarSeparator,
  ToolbarTooltip,
};

function getActiveHeadingLevel(editor: Editor) {
  return ([1, 2, 3, 4, 5, 6] as const).find((level) =>
    editor.isActive('heading', { level }),
  );
}

function getCurrentListType(editor: Editor): ListType | null {
  if (editor.isActive('taskList') || editor.isActive('taskItem')) return 'task';
  if (editor.isActive('orderedList')) return 'ordered';
  if (editor.isActive('bulletList')) return 'bullet';
  return null;
}

function getCurrentTextColor(editor: Editor) {
  const color = editor.getAttributes('textStyle').color;
  return typeof color === 'string' ? color : null;
}

function getCurrentBackgroundColor(editor: Editor) {
  const color = editor.getAttributes('highlight').color;
  return typeof color === 'string' ? color : null;
}

function isSelectionInsideCommentPanel(editor: Editor) {
  const { $from, $to } = editor.state.selection;
  const isInside = ($pos: typeof $from) => {
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name === 'commentPanel') return true;
    }
    return false;
  };

  return isInside($from) && isInside($to);
}

function getToolbarState(editor: Editor): ToolbarState {
  const textColor = getCurrentTextColor(editor);
  const backgroundColor = getCurrentBackgroundColor(editor);
  const marks = {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    code: editor.isActive('code'),
    subscript: editor.isActive('subscript'),
    superscript: editor.isActive('superscript'),
    link: editor.isActive('link'),
  };

  return {
    headingLevel: getActiveHeadingLevel(editor) ?? null,
    listType: getCurrentListType(editor),
    marks,
    textColor,
    backgroundColor,
    blockquote: editor.isActive('blockquote'),
    codeBlock: editor.isActive('codeBlock'),
    inCommentPanel: isSelectionInsideCommentPanel(editor),
    canClearFormatting: Boolean(
      marks.bold ||
        marks.italic ||
        marks.underline ||
        marks.strike ||
        marks.code ||
        marks.subscript ||
        marks.superscript ||
        marks.link ||
        textColor ||
        backgroundColor,
    ),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
  };
}

function useCommentToolbarState(editor: Editor | null) {
  return (
    useEditorState({
      editor,
      selector: ({ editor: currentEditor }) =>
        currentEditor ? getToolbarState(currentEditor) : defaultToolbarState,
    }) ?? defaultToolbarState
  );
}

function applyList(editor: Editor, type: ListType) {
  const currentType = getCurrentListType(editor);

  if (currentType === type) {
    if (type === 'bullet') editor.chain().focus().toggleBulletList().run();
    if (type === 'ordered') editor.chain().focus().toggleOrderedList().run();
    if (type === 'task') editor.chain().focus().toggleTaskList().run();
    return;
  }

  const chain = editor.chain().focus();
  if (currentType === 'bullet') chain.toggleBulletList();
  if (currentType === 'ordered') chain.toggleOrderedList();
  if (currentType === 'task') chain.toggleTaskList();
  if (type === 'bullet') chain.toggleBulletList();
  if (type === 'ordered') chain.toggleOrderedList();
  if (type === 'task') chain.toggleTaskList();
  chain.run();
}

function insertInfoPanel(editor: Editor) {
  if (isSelectionInsideCommentPanel(editor)) return;

  const insertFrom = editor.state.selection.from;
  const inserted = editor
    .chain()
    .focus()
    .insertContent([
      {
        type: 'commentPanel',
        attrs: { type: 'info' },
        content: [{ type: 'paragraph' }],
      },
      { type: 'paragraph' },
    ])
    .run();

  if (!inserted) return;

  let panelPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'commentPanel' && pos >= Math.max(0, insertFrom - 1)) {
      panelPos = pos;
      return false;
    }
    return true;
  });
  if (panelPos === null) return;

  editor.view.dispatch(
    editor.state.tr
      .setSelection(TextSelection.create(editor.state.doc, panelPos + 2))
      .scrollIntoView(),
  );
}

function findCodeBlockPosNearSelection(editor: Editor, anchorPos: number) {
  const { doc, selection } = editor.state;
  const { $from } = selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'codeBlock') {
      return $from.before(depth);
    }
  }

  if ($from.nodeBefore?.type.name === 'codeBlock') {
    return selection.from - $from.nodeBefore.nodeSize;
  }

  if ($from.nodeAfter?.type.name === 'codeBlock') {
    return selection.from;
  }

  let nearestPos: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true;

    const distance = Math.abs(pos - anchorPos);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPos = pos;
    }
    return true;
  });
  return nearestPos;
}

function focusCommentCodeBlock(editor: Editor, pos: number) {
  const requestFocus = () => {
    dispatchCommentCodeBlockFocus({ pos, placement: 'start' });
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      const codeMirrorContent = dom.querySelector<HTMLElement>('.comment-code-block-codemirror .cm-content');
      if (codeMirrorContent) focusElementPreventScroll(codeMirrorContent);
    }
  };

  // Focus after the inserted NodeView has rendered.
  window.requestAnimationFrame(() => {
    requestFocus();
    window.requestAnimationFrame(requestFocus);
  });
}

function getSelectedTextForCodeBlock(editor: Editor) {
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, '\n');
}

function findCodeBlockPosFromSelection(editor: Editor) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'codeBlock') {
      return $from.before(depth);
    }
  }
  return null;
}

function getCodeBlockNodeAt(editor: Editor, pos: number | null) {
  if (typeof pos !== 'number') return null;
  const node = editor.state.doc.nodeAt(pos);
  return node?.type.name === 'codeBlock' ? node : null;
}

function insertCodeBlockAndFocus(editor: Editor) {
  const { state, view } = editor;
  const codeBlockType = state.schema.nodes.codeBlock;
  if (!codeBlockType) return;

  const selectedText = getSelectedTextForCodeBlock(editor);
  const textNode = selectedText ? state.schema.text(selectedText) : undefined;
  const codeBlock = codeBlockType.create(null, textNode);
  const insertFrom = state.selection.from;

  const inserted = withPreservedScroll(view.dom, () => {
    const tr = state.tr.replaceSelectionWith(codeBlock, false);
    view.dispatch(tr);
    return true;
  });
  if (!inserted) return;

  let insertedPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'codeBlock' && pos >= Math.max(0, insertFrom - 1)) {
      insertedPos = pos;
      return false;
    }
    return true;
  });
  if (insertedPos !== null) focusCommentCodeBlock(editor, insertedPos);
}

function insertOrFocusCodeBlock(editor: Editor, activeCodeBlockPos: number | null) {
  let activeCodeBlockPosWasStale = false;

  if (activeCodeBlockPos !== null) {
    if (getCodeBlockNodeAt(editor, activeCodeBlockPos)) {
      // CodeMirror-owned snippets use explicit header deletion, not toolbar toggling.
      dispatchCommentCodeBlockFocus({ pos: activeCodeBlockPos, placement: 'start' });
      return { activeCodeBlockPosWasStale };
    }
    activeCodeBlockPosWasStale = true;
  }

  const selectedCodeBlockPos = findCodeBlockPosFromSelection(editor);
  if (selectedCodeBlockPos !== null) {
    dispatchCommentCodeBlockFocus({ pos: selectedCodeBlockPos, placement: 'start' });
    return { activeCodeBlockPosWasStale };
  }

  // Selected rich text is intentionally flattened into one code snippet with textblock breaks.
  insertCodeBlockAndFocus(editor);
  return { activeCodeBlockPosWasStale };
}

function runHistoryCommand(editor: Editor, direction: 'undo' | 'redo') {
  const anchorPos = editor.state.selection.from;
  const hadNearbyCodeBlock = findCodeBlockPosNearSelection(editor, anchorPos) !== null;
  const ran = withPreservedScroll(editor.view.dom, () => {
    const chain = editor.chain().focus(undefined, { scrollIntoView: false });
    return direction === 'undo' ? chain.undo().run() : chain.redo().run();
  });
  if (!ran) return;

  const codeBlockPos = findCodeBlockPosNearSelection(editor, anchorPos);
  if (direction === 'redo' && !hadNearbyCodeBlock && codeBlockPos !== null) {
    // Redo may recreate the NodeView; ask the fresh code block to focus without browser scrolling.
    window.requestAnimationFrame(() => {
      dispatchCommentCodeBlockFocus({ pos: codeBlockPos, placement: 'start' });
    });
  }
}

function TextStyleIcon({ level }: { level?: 1 | 2 | 3 | 4 | 5 | 6 | null }) {
  if (!level) {
    return <span className="text-[13px] font-semibold leading-none">Tt</span>;
  }

  return (
    <span className="relative inline-flex h-4 min-w-4 items-center justify-center pr-1 text-[13px] font-semibold leading-none">
      H
      <span className="absolute bottom-0 right-0 translate-y-0.5 text-[8px] leading-none">
        {level}
      </span>
    </span>
  );
}

function TextStyleDropdown({
  editor,
  toolbarState,
  disabled,
}: {
  editor: Editor;
  toolbarState: ToolbarState;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const activeHeadingLevel = toolbarState.headingLevel;

  return (
    <ToolbarDropdown
      label="Text styles"
      active={open || Boolean(activeHeadingLevel)}
      disabled={disabled}
      open={open}
      onOpenChange={setOpen}
      trigger={<TextStyleIcon level={activeHeadingLevel} />}
      contentClassName="w-48"
    >
      {textStyleOptions.map((option) => {
        const selected = option.level
          ? activeHeadingLevel === option.level
          : !activeHeadingLevel;

        return (
          <DropdownMenuItem
            key={option.label}
            data-active={selected}
            className={dropdownItemClassName}
            onSelect={() => {
              if (option.level) {
                editor.chain().focus().setHeading({ level: option.level }).run();
              } else {
                editor.chain().focus().setParagraph().run();
              }
            }}
          >
            <span className="flex w-6 shrink-0 justify-center text-gray-500">
              <TextStyleIcon level={option.level} />
            </span>
            <span className={option.className}>{option.label}</span>
          </DropdownMenuItem>
        );
      })}
    </ToolbarDropdown>
  );
}

function clearInlineFormatting(editor: Editor) {
  const chain = editor
    .chain()
    .focus()
    .unsetBold()
    .unsetItalic()
    .unsetUnderline()
    .unsetStrike()
    .unsetCode()
    .unsetSubscript()
    .unsetSuperscript();

  if (editor.isActive('link')) {
    chain.extendMarkRange('link');
  }

  chain
    .unsetLink()
    .unsetColor()
    .unsetHighlight()
    .removeEmptyTextStyle()
    .run();
}

function FormatTextDropdown({
  editor,
  toolbarState,
  disabled,
}: {
  editor: Editor;
  toolbarState: ToolbarState;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { marks } = toolbarState;

  const items = [
    {
      label: 'Bold',
      active: marks.bold,
      disabled: marks.code,
      icon: <Bold className="h-3.5 w-3.5" />,
      action: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      active: marks.italic,
      disabled: marks.code,
      icon: <Italic className="h-3.5 w-3.5" />,
      action: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Underline',
      active: marks.underline,
      disabled: marks.code,
      icon: <Underline className="h-3.5 w-3.5" />,
      action: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: 'Strikethrough',
      active: marks.strike,
      disabled: marks.code,
      icon: <Strikethrough className="h-3.5 w-3.5" />,
      action: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: 'Code',
      active: marks.code,
      disabled: false,
      icon: <Code className="h-3.5 w-3.5" />,
      action: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: 'Subscript',
      active: marks.subscript,
      disabled: marks.code,
      icon: <Subscript className="h-3.5 w-3.5" />,
      action: () => editor.chain().focus().toggleSubscript().run(),
    },
    {
      label: 'Superscript',
      active: marks.superscript,
      disabled: marks.code,
      icon: <Superscript className="h-3.5 w-3.5" />,
      action: () => editor.chain().focus().toggleSuperscript().run(),
    },
  ];

  return (
    <ToolbarDropdown
      label="Format text"
      active={open}
      disabled={disabled}
      open={open}
      onOpenChange={setOpen}
      trigger={<ChevronDown className="h-3.5 w-3.5" />}
      contentClassName="w-44"
    >
      {items.map((item) => (
        <DropdownMenuItem
          key={item.label}
          data-active={item.active}
          disabled={item.disabled}
          className={dropdownItemClassName}
          onSelect={item.action}
        >
          {item.icon}
          <span>{item.label}</span>
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator className="my-1 bg-gray-200" />
      <DropdownMenuItem
        disabled={!toolbarState.canClearFormatting}
        className={dropdownItemClassName}
        onSelect={() => clearInlineFormatting(editor)}
      >
        <RemoveFormatting className="h-3.5 w-3.5" />
        <span>Clear formatting</span>
      </DropdownMenuItem>
    </ToolbarDropdown>
  );
}

function ListsSplitButton({
  editor,
  toolbarState,
  disabled,
}: {
  editor: Editor;
  toolbarState: ToolbarState;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const currentType = toolbarState.listType;
  const mainType = currentType ?? 'bullet';
  const MainIcon = mainType === 'ordered' ? ListOrdered : mainType === 'task' ? ListChecks : List;

  const items: Array<{ type: ListType; label: string; icon: ReactNode }> = [
    { type: 'bullet', label: 'Bulleted list', icon: <List className="h-3.5 w-3.5" /> },
    { type: 'ordered', label: 'Numbered list', icon: <ListOrdered className="h-3.5 w-3.5" /> },
    { type: 'task', label: 'Task list', icon: <ListChecks className="h-3.5 w-3.5" /> },
  ];

  return (
    <span className="inline-flex shrink-0 overflow-visible rounded">
      <ToolbarButton
        label={
          mainType === 'ordered'
            ? 'Numbered list'
            : mainType === 'task'
              ? 'Task list'
              : 'Bulleted list'
        }
        active={Boolean(currentType)}
        disabled={disabled}
        className="rounded-r-none"
        onClick={() => applyList(editor, mainType)}
      >
        <MainIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarDropdown
        label="Lists"
        active={open}
        disabled={disabled}
        open={open}
        onOpenChange={setOpen}
        trigger={<ChevronDown className="h-3.5 w-3.5" />}
        contentClassName="w-44"
      >
        {items.map((item) => (
          <DropdownMenuItem
            key={item.type}
            data-active={currentType === item.type}
            className={dropdownItemClassName}
            onSelect={() => applyList(editor, item.type)}
          >
            {item.icon}
            <span>{item.label}</span>
          </DropdownMenuItem>
        ))}
      </ToolbarDropdown>
    </span>
  );
}

function isLightColor(hex: string) {
  const value = hex.replace('#', '');
  if (value.length !== 6) return false;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 160;
}

function PaletteSwatch({
  color,
  selected,
  onSelect,
}: {
  color: PaletteColor;
  selected: boolean;
  onSelect: () => void;
}) {
  const checkClassName = isLightColor(color.value) ? 'text-gray-900' : 'text-white';

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={color.name}
        className={cn(
          'relative grid h-5 w-5 place-items-center rounded border border-gray-200 transition hover:scale-105 hover:ring-1 hover:ring-gray-300',
          selected && 'ring-2 ring-green-600 ring-offset-1',
        )}
        style={{ backgroundColor: color.value }}
        onClick={onSelect}
      >
        {selected ? <Check className={cn('h-3.5 w-3.5 stroke-[3]', checkClassName)} /> : null}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-950 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        {color.name}
      </span>
    </span>
  );
}

function ColourPopover({
  title,
  palette,
  currentColor,
  kind,
  editor,
  disabled,
}: {
  title: string;
  palette: PaletteColor[];
  currentColor: string | null;
  kind: 'text' | 'background';
  editor: Editor;
  disabled?: boolean;
}) {
  const isText = kind === 'text';

  return (
    <ToolbarPopover
      label={title}
      active={false}
      disabled={disabled}
      trigger={
        isText ? (
          <span
            className="flex h-5 min-w-5 items-center justify-center rounded border border-gray-300 px-1 text-[12px] font-semibold leading-none"
            style={{ color: currentColor ?? '#172B4D' }}
          >
            A
          </span>
        ) : (
          <span
            className="relative flex h-5 min-w-5 items-center justify-center rounded border border-gray-300 px-1 text-gray-600"
          >
            <Highlighter className="h-3.5 w-3.5" />
            <span
              className="absolute bottom-0.5 left-1 right-1 h-0.5 rounded-full"
              style={{ backgroundColor: currentColor ?? 'transparent' }}
            />
          </span>
        )
      }
    >
      <div className={cn('space-y-3', disabled && 'pointer-events-none opacity-50')}>
        <div className="text-xs font-semibold text-gray-700">{title}</div>
        <div className="grid grid-cols-7 gap-1.5">
          {palette.map((color) => (
            <PaletteSwatch
              key={color.value}
              color={color}
              selected={currentColor?.toLowerCase() === color.value.toLowerCase()}
              onSelect={() => {
                if (isText) {
                  editor.chain().focus().setColor(color.value).run();
                } else {
                  editor.chain().focus().setHighlight({ color: color.value }).run();
                }
              }}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={!currentColor}
          className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:pointer-events-none disabled:text-gray-400"
          onClick={() => {
            if (isText) {
              editor.chain().focus().unsetColor().removeEmptyTextStyle().run();
            } else {
              editor.chain().focus().unsetHighlight().run();
            }
          }}
        >
          Remove Colour
        </button>
      </div>
    </ToolbarPopover>
  );
}

export default function CommentToolbar({
  editor,
  disabled,
  uploadingMedia,
  onFilesSelected,
}: CommentToolbarProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const toolbarState = useCommentToolbarState(editor);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [activeCodeBlockPos, setActiveCodeBlockPos] = useState<number | null>(null);
  const activeCodeBlockPosRef = useRef<number | null>(null);
  const codeSnippetMouseDownHandledRef = useRef(false);

  useEffect(() => {
    const handleCodeBlockActive = (event: Event) => {
      const detail = (event as CustomEvent<CommentCodeBlockActiveDetail>).detail;
      const nextPos = detail.active && typeof detail.pos === 'number' ? detail.pos : null;
      activeCodeBlockPosRef.current = nextPos;
      setActiveCodeBlockPos(nextPos);
    };

    window.addEventListener(COMMENT_CODE_BLOCK_ACTIVE_EVENT, handleCodeBlockActive);
    return () => window.removeEventListener(COMMENT_CODE_BLOCK_ACTIVE_EVENT, handleCodeBlockActive);
  }, []);

  if (!editor) return null;

  const handleCodeSnippetAction = () => {
    const result = insertOrFocusCodeBlock(editor, activeCodeBlockPosRef.current);
    if (result.activeCodeBlockPosWasStale) {
      activeCodeBlockPosRef.current = null;
      setActiveCodeBlockPos(null);
    }
  };

  const addLink = async (url: string) => {
    setLinkLoading(true);
    try {
      const inserted = await insertCommentLink(editor, url);
      if (inserted) setLinkOpen(false);
    } finally {
      setLinkLoading(false);
    }
  };

  const codeMirrorActive = getCodeBlockNodeAt(editor, activeCodeBlockPos) !== null;
  const richTextDisabled = disabled || codeMirrorActive;
  // CodeMirror owns its internal selection, so toolbar active state also tracks focused NodeView position.
  const codeSnippetActive = toolbarState.codeBlock || codeMirrorActive;

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border-b border-gray-200 bg-gray-50 px-2 py-1">
      <TextStyleDropdown editor={editor} toolbarState={toolbarState} disabled={richTextDisabled} />

      <ToolbarSeparator />

      <ToolbarButton
        label="Bold"
        active={toolbarState.marks.bold}
        disabled={richTextDisabled || !editor.can().chain().focus().toggleBold().run()}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <FormatTextDropdown editor={editor} toolbarState={toolbarState} disabled={richTextDisabled} />

      <ToolbarSeparator />

      <ListsSplitButton editor={editor} toolbarState={toolbarState} disabled={richTextDisabled} />
      <ToolbarButton
        label="Quote"
        active={toolbarState.blockquote}
        disabled={richTextDisabled || !editor.can().chain().focus().toggleBlockquote().run()}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarSeparator />

      <ColourPopover
        title="Text colour"
        palette={textPalette}
        currentColor={toolbarState.textColor}
        kind="text"
        editor={editor}
        disabled={richTextDisabled}
      />
      <ColourPopover
        title="Background colour"
        palette={backgroundPalette}
        currentColor={toolbarState.backgroundColor}
        kind="background"
        editor={editor}
        disabled={richTextDisabled}
      />

      <ToolbarSeparator />

      <Popover open={linkOpen} onOpenChange={setLinkOpen}>
        <ToolbarTooltip label="Link" hidden={linkOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Link"
              data-active={toolbarState.marks.link || linkOpen}
              disabled={disabled}
              className={toolbarButtonClassName}
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
        </ToolbarTooltip>
        <PopoverContent className="w-auto border-gray-200 p-3" align="start">
          <CommentLinkPopover
            loading={linkLoading}
            onSubmit={(url) => void addLink(url)}
            onCancel={() => setLinkOpen(false)}
          />
        </PopoverContent>
      </Popover>
      <ToolbarButton
        label="Add image, video, or file"
        disabled={disabled || uploadingMedia}
        onClick={() => imageInputRef.current?.click()}
      >
        <FileUp className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Code snippet ```"
        active={codeSnippetActive}
        disabled={disabled}
        onMouseDown={(event) => {
          // Toolbar mousedown can blur CodeMirror before click, so resolve the active snippet first.
          event.preventDefault();
          codeSnippetMouseDownHandledRef.current = true;
          handleCodeSnippetAction();
        }}
        onClick={() => {
          if (codeSnippetMouseDownHandledRef.current) {
            codeSnippetMouseDownHandledRef.current = false;
            return;
          }
          handleCodeSnippetAction();
        }}
      >
        <CodeXml className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Info panel"
        active={toolbarState.inCommentPanel}
        disabled={disabled || toolbarState.inCommentPanel}
        onClick={() => insertInfoPanel(editor)}
      >
        <Info className="h-3.5 w-3.5" />
      </ToolbarButton>
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept={COMMENT_UPLOAD_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) onFilesSelected(files);
        }}
      />
      <EmojiPicker
        disabled={richTextDisabled}
        triggerClassName={cn(toolbarButtonClassName, 'data-[active=false]:bg-transparent')}
        iconClassName="!h-3.5 !w-3.5"
        onSelect={(emoji) => editor.chain().focus().insertContent(emoji).run()}
      />

      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        <ToolbarButton
          label="Undo"
          disabled={disabled || !toolbarState.canUndo}
          onClick={() => runHistoryCommand(editor, 'undo')}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={disabled || !toolbarState.canRedo}
          onClick={() => runHistoryCommand(editor, 'redo')}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </span>
    </div>
  );
}
