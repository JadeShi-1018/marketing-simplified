export const formatTaskDateShort = (iso?: string | null): string => {
  if (!iso) return '\u2014';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '\u2014';
  }
};
