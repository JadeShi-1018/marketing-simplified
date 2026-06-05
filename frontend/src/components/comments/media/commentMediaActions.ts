'use client';

export function openCommentMediaUrl(url: string | null | undefined) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function downloadCommentMediaUrl(
  url: string | null | undefined,
  filename: string,
) {
  if (!url) return;

  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'download';
    link.rel = 'noopener noreferrer';
    // Cross-origin URLs may ignore download; target lets the browser fall back to opening.
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    openCommentMediaUrl(url);
  }
}
