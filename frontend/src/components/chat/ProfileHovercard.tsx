'use client';

import { useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { User } from '@/types/chat';

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
];

function getAvatarColor(userId: number) {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length];
}

function BigAvatar({ user }: { user: User }) {
  const initials = (user.username || user.email || '?')[0].toUpperCase();
  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={initials}
        className="h-14 w-14 rounded-full object-cover"
      />
    );
  }
  return (
    <div className={`flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white ${getAvatarColor(user.id)}`}>
      {initials}
    </div>
  );
}

// ── Hovercard card content ────────────────────────────────────────────────────

interface HovercardProps {
  user: User;
  role?: string;
  onClose: () => void;
  /** Trigger element rect to position the card */
  triggerRect: DOMRect;
  onStartDM?: () => void;
}

function HovercardContent({ user, role, triggerRect, onClose, onStartDM }: HovercardProps) {
  const isOnline = user.is_online ?? false;

  // Position below-right of trigger
  const style: React.CSSProperties = {
    position: 'fixed',
    top: triggerRect.bottom + 6,
    left: Math.min(triggerRect.left, window.innerWidth - 248),
    zIndex: 9999,
    width: 240,
  };

  return createPortal(
    <div
      style={style}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-xl"
      onMouseEnter={onClose.bind(null)} // keep alive while hovering card itself — handled externally
    >
      {/* Avatar + presence */}
      <div className="mb-3 flex items-start gap-3">
        <div className="relative shrink-0">
          <BigAvatar user={user} />
          {/* Presence dot */}
          <span
            className={[
              'absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white',
              isOnline ? 'bg-emerald-500' : 'bg-gray-300',
            ].join(' ')}
            title={isOnline ? 'Online' : 'Offline'}
          />
        </div>
        <div className="min-w-0 pt-1">
          <p className="truncate font-semibold text-gray-900">
            {user.username || user.email}
          </p>
          {user.email && user.username && (
            <p className="truncate text-xs text-gray-500">{user.email}</p>
          )}
          {role && (
            <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
              {role}
            </span>
          )}
          <p className={`mt-1 text-[11px] font-medium ${isOnline ? 'text-emerald-600' : 'text-gray-400'}`}>
            {isOnline ? 'Active now' : 'Offline'}
          </p>
        </div>
      </div>

      {/* Actions */}
      {onStartDM && (
        <button
          type="button"
          onClick={() => { onStartDM(); }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <MessageCircle className="h-4 w-4" />
          Message
        </button>
      )}
    </div>,
    document.body
  );
}

// ── Wrapper ───────────────────────────────────────────────────────────────────

export interface ProfileHovercardProps {
  user: User;
  role?: string;
  onStartDM?: () => void;
  children: React.ReactNode;
}

export default function ProfileHovercard({ user, role, onStartDM, children }: ProfileHovercardProps) {
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCard = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    enterTimerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        setRect(triggerRef.current.getBoundingClientRect());
        setVisible(true);
      }
    }, 400);
  };

  const hideCard = () => {
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    leaveTimerRef.current = setTimeout(() => setVisible(false), 200);
  };

  return (
    <span
      ref={triggerRef}
      className="cursor-pointer"
      onMouseEnter={showCard}
      onMouseLeave={hideCard}
    >
      {children}
      {visible && rect && (
        <HovercardContent
          user={user}
          role={role}
          triggerRect={rect}
          onClose={hideCard}
          onStartDM={onStartDM}
        />
      )}
    </span>
  );
}
