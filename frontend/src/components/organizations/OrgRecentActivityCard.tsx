'use client';

import { Clock, UserPlus, UserMinus, LogOut, Zap, AlertTriangle, CreditCard, RefreshCw, Users } from 'lucide-react';
import type { OrgActivityEvent, OrgActivityCategory } from '@/lib/api/organizationApi';

interface OrgRecentActivityCardProps {
  activities: OrgActivityEvent[];
}

// ── Icon + colour per category ────────────────────────────────────────────────

const CATEGORY_STYLES: Record<OrgActivityCategory | 'other', { icon: typeof Clock; bg: string; text: string }> = {
  member: { icon: Users,         bg: 'bg-[#3CCED7]/10', text: 'text-[#3CCED7]' },
  plan:   { icon: CreditCard,    bg: 'bg-purple-50',    text: 'text-purple-500' },
  token:  { icon: Zap,           bg: 'bg-amber-50',     text: 'text-amber-500' },
  other:  { icon: Clock,         bg: 'bg-gray-100',     text: 'text-gray-400'  },
};

const EVENT_ICON: Record<string, typeof Clock> = {
  member_joined:          UserPlus,
  member_removed:         UserMinus,
  member_left:            LogOut,
  plan_subscribed:        CreditCard,
  plan_changed:           RefreshCw,
  plan_cancel_scheduled:  AlertTriangle,
  plan_reactivated:       RefreshCw,
  seats_changed:          Users,
  plan_cancelled:         AlertTriangle,
  token_quota_warning:    Zap,
  token_quota_exceeded:   Zap,
  token_overage_started:  Zap,
};

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
}

export default function OrgRecentActivityCard({ activities }: OrgRecentActivityCardProps) {
  if (activities.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center text-center">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Clock className="w-5 h-5 text-gray-300" />
        </div>
        <p className="text-sm text-gray-500">No recent activity.</p>
        <p className="text-xs text-gray-400 mt-1">
          Member joins, plan changes, and token events will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {activities.map((ev) => {
        const category = (ev.category ?? 'other') as OrgActivityCategory;
        const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.other;
        const Icon = EVENT_ICON[ev.event_type] ?? style.icon;

        return (
          <div
            key={ev.id}
            className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0"
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${style.bg}`}>
              <Icon className={`w-3.5 h-3.5 ${style.text}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-gray-700 leading-snug">{ev.message}</p>
            </div>
            <span className="text-[10px] text-gray-400 shrink-0 pt-0.5 whitespace-nowrap">
              {formatTime(ev.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
