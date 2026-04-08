"use client";

import React, { useEffect, useCallback } from "react";
import { useNotificationDrawer } from "./NotificationDrawerProvider";
import { notificationsApi } from "@/lib/api/notificationsApi";
import DrawerHeader from "./drawer/DrawerHeader";
import DrawerActivitySummary from "./drawer/DrawerActivitySummary";
import DrawerObjectCard from "./drawer/DrawerObjectCard";
import DrawerWhatChanged from "./drawer/DrawerWhatChanged";
import DrawerActionBar from "./drawer/DrawerActionBar";

export default function NotificationDrawer() {
  const { isOpen, notification, closeDrawer } = useNotificationDrawer();

  // Handle escape key to close drawer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        closeDrawer();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeDrawer]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Mark notification as read when drawer opens
  const markAsRead = useCallback(async () => {
    if (!notification || notification.is_read) return;
    try {
      await notificationsApi.markRead({ ids: [notification.id] });
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  }, [notification]);

  // Auto mark as read when drawer opens with an unread notification
  useEffect(() => {
    if (isOpen && notification && !notification.is_read) {
      markAsRead();
    }
  }, [isOpen, notification, markAsRead]);

  if (!isOpen || !notification) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col rounded-l-xl animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-drawer-title"
      >
        {/* Header */}
        <DrawerHeader
          notification={notification}
          onClose={closeDrawer}
          onMarkAsRead={markAsRead}
        />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Activity Summary (description) */}
          <DrawerActivitySummary notification={notification} />

          {/* Embedded Object Card (Details) */}
          <DrawerObjectCard notification={notification} />

          {/* What Changed section (below Details) */}
          <DrawerWhatChanged notification={notification} />
        </div>

        {/* Action Bar (sticky at bottom) */}
        <DrawerActionBar
          notification={notification}
          onActionComplete={closeDrawer}
        />
      </div>

      {/* Animation styles */}
      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
