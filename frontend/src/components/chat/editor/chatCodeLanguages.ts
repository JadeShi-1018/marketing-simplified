export type ChatCodeLanguageOption = {
  value: string;
  label: string;
};

export const CHAT_CODE_LANGUAGE_OPTIONS: ChatCodeLanguageOption[] = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'jsx', label: 'JSX' },
  { value: 'tsx', label: 'TSX' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'python', label: 'Python' },
  { value: 'sql', label: 'SQL' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
];

const CHAT_CODE_LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  yml: 'yaml',
  text: 'plaintext',
};

const CHAT_CODE_LANGUAGE_LABELS = new Map(
  CHAT_CODE_LANGUAGE_OPTIONS.map((option) => [option.value, option.label]),
);

export function normalizeChatCodeLanguage(value: unknown): string {
  if (typeof value !== 'string') return 'plaintext';

  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'plaintext';

  const aliased = CHAT_CODE_LANGUAGE_ALIASES[normalized] ?? normalized;
  return CHAT_CODE_LANGUAGE_LABELS.has(aliased) ? aliased : 'plaintext';
}

export function getChatCodeLanguageLabel(value: unknown): string {
  const normalized = normalizeChatCodeLanguage(value);
  return CHAT_CODE_LANGUAGE_LABELS.get(normalized) ?? normalized;
}
