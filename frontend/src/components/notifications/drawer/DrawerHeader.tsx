"use client";

import React from "react";
import { X } from "lucide-react";
import type { NotificationItem } from "@/types/notifications";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import {
  MODULE_VISUALS,
  TYPE_VISUALS,
  deriveModule,
  deriveTypeKey,
} from "@/lib/notificationVisuals";

interface DrawerHeaderProps {
  notification: NotificationItem;
  onClose: () => void;
}

export default function DrawerHeader({
  notification,
  onClose,
}: DrawerHeaderProps) {
  const moduleKey = deriveModule(notification);
  const typeKey = deriveTypeKey(notification);
  const moduleCfg = MODULE_VISUALS[moduleKey];
  const typeCfg = TYPE_VISUALS[typeKey];
  const ModuleIcon = moduleCfg.icon;
  const TypeIcon = typeCfg.icon;

  return (
    <div className="px-5 py-4 border-b border-gray-200 shrink-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
          {/* Module — same colour family as notification panel left bar */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${moduleCfg.tagBg} ${moduleCfg.tagText}`}
          >
            <ModuleIcon className="w-4 h-4 shrink-0" aria-hidden />
            <span>{moduleCfg.label}</span>
          </div>
          {/* Type — separate palette */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${typeCfg.tagBg} ${typeCfg.tagText}`}
          >
            <TypeIcon className="w-4 h-4 shrink-0" aria-hidden />
            <span>{typeCfg.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
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

      <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-500">
        <span>{formatRelativeTime(notification.created_at)}</span>
      </div>
    </div>
  );
}
