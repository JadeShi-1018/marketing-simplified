'use client';

import type { Editor } from '@tiptap/react';
import { fetchLinkPreview, isPreviewableUrl } from '@/lib/api/linkPreviewApi';
import type { CommentSmartLinkAttrs } from '@/types/comment';
import {
  createCommentInlineChipInsertionContent,
  shouldInsertLeadingInlineChipSpace,
  shouldInsertTrailingInlineChipSpace,
} from '../commentUtils';

const LINK_REL = 'noopener noreferrer nofollow';
const LINK_TARGET = '_blank';

export function normalizeCommentLinkUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isCommentLinkTextUrlLike(text: string) {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)) {
    return Boolean(normalizeCommentLinkUrl(trimmed));
  }
  return /^[^\s@]+\.[^\s@]+/.test(trimmed) && Boolean(normalizeCommentLinkUrl(trimmed));
}

export function getCommentLinkHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function getCommentLinkFavicon(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
  } catch {
    return null;
  }
}

export function openCommentLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function resolveCommentSmartLink(
  url: string,
): Promise<CommentSmartLinkAttrs | null> {
  if (!isPreviewableUrl(url)) return null;

  const preview = await fetchLinkPreview(url);
  if (!preview) return null;

  const hostname = getCommentLinkHostname(url);
  const title = preview.title || preview.site_name || hostname || url;
  if (!preview.title && !preview.description && !preview.image && !preview.site_name) {
    return null;
  }

  return {
    url,
    title,
    description: preview.description,
    siteName: preview.site_name || hostname,
    favicon: getCommentLinkFavicon(url),
    image: preview.image,
    status: 'resolved',
  };
}

export async function insertCommentLink(editor: Editor, rawUrl: string) {
  const url = normalizeCommentLinkUrl(rawUrl);
  if (!url) return false;

  const { empty } = editor.state.selection;
  // Existing selected text stays as a normal link mark; only empty inserts become smart chips.
  const preview = empty ? await resolveCommentSmartLink(url) : null;

  if (empty && preview) {
    editor
      .chain()
      .focus()
      .insertContent(
        createCommentInlineChipInsertionContent(
          [{
            type: 'smartLink',
            attrs: preview,
          }],
          {
            leadingSpace: shouldInsertLeadingInlineChipSpace(editor),
            trailingSpace: shouldInsertTrailingInlineChipSpace(editor),
          },
        ),
      )
      .run();
    return true;
  }

  if (empty) {
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'text',
        text: url,
        marks: [
          {
            type: 'link',
            attrs: {
              href: url,
              target: LINK_TARGET,
              rel: LINK_REL,
            },
          },
        ],
      })
      .run();
    return true;
  }

  editor
    .chain()
    .focus()
    .extendMarkRange('link')
    .setLink({
      href: url,
      target: LINK_TARGET,
      rel: LINK_REL,
    })
    .run();
  return true;
}
