import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import type { Extension } from '@codemirror/state';
import { normalizeCommentCodeLanguage } from './commentCodeLanguages';

export function getCommentCodeMirrorLanguageExtension(value: unknown): Extension[] {
  switch (normalizeCommentCodeLanguage(value)) {
    case 'javascript':
      return [javascript()];
    case 'typescript':
      return [javascript({ typescript: true })];
    case 'jsx':
      return [javascript({ jsx: true })];
    case 'tsx':
      return [javascript({ jsx: true, typescript: true })];
    case 'html':
      return [html()];
    case 'css':
    case 'scss':
      return [css()];
    case 'json':
      return [json()];
    case 'bash':
    case 'shell':
      return [StreamLanguage.define(shell)];
    case 'python':
      return [python()];
    case 'sql':
      return [sql()];
    case 'yaml':
      return [yaml()];
    case 'markdown':
      return [markdown()];
    default:
      // Plain text and unknown languages intentionally use CodeMirror's base editor only.
      return [];
  }
}
