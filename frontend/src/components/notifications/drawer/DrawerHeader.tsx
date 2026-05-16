"use client";

import React from "react";
import {
  X,
  Calendar,
  CheckSquare,
  Scale,
  MessageSquare,
  ThumbsUp,
  Bell,
  Briefcase,
  Settings,
  Zap,
  Link2,
} from "lucide-react";
import type { NotificationItem } from "@/types/notifications";
import { formatRelativeTime } from "@/lib/formatRelativeTime";

interface DrawerHeaderProps {
  notification: NotificationItem;
  onClose: () => void;
}

// Category configuration for styling and icons
const CATEGORY_CONFIG: Record<
  string,
  { icon: React.ElementType; bgColor: string; textColor: string; label: string }
> = {
  MEETINGS: {
    icon: Calendar,
    bgColor: "bg-orange-50",
    textColor: "text-orange-700",
    label: "Meeting Update",
  },
  TASKS: {
    icon: CheckSquare,
    bgColor: "bg-orange-50",
    textColor: "text-orange-700",
    label: "Task Update",
  },
  DECISIONS: {
    icon: Scale,
    bgColor: "bg-orange-50",
    textColor: "text-orange-700",
    label: "Decision",
  },
  COLLABORATION: {
    icon: MessageSquare,
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
    label: "Collaboration",
  },
  APPROVAL: {
    icon: ThumbsUp,
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    label: "Approval Required",
  },
  SYSTEM: {
    icon: Bell,
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
    label: "System",
  },
  AUTOMATION: {
    icon: Zap,
    bgColor: "bg-purple-50",
    textColor: "text-purple-700",
    label: "Automation",
  },
  INTEGRATIONS: {
    icon: Link2,
    bgColor: "bg-gray-50",
    textColor: "text-gray-700",
    label: "Integration",
  },
};

// Default config for unknown categories
const DEFAULT_CATEGORY_CONFIG = {
  icon: Bell,
  bgColor: "bg-gray-50",
  textColor: "text-gray-700",
  label: "Notification",
};

export default function DrawerHeader({
  notification,
  onClose,
}: DrawerHeaderProps) {
  const categoryKey = notification.category?.toUpperCase() || "";
  const config = CATEGORY_CONFIG[categoryKey] || DEFAULT_CATEGORY_CONFIG;
  const Icon = config.icon;

  return (
    <div className="px-5 py-4 border-b border-gray-200 shrink-0">
      {/* Top row: Category badge and actions */}
      <div className="flex items-start justify-between gap-3">
        {/* Category Badge */}
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${config.bgColor} ${config.textColor}`}
        >
          <Icon className="w-4 h-4" />
          <span>{config.label}</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Timestamp */}
      <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-500">
        <span>{formatRelativeTime(notification.created_at)}</span>
      </div>
    </div>
  );
}
