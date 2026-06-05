"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { NotificationItem } from "@/types/notifications";

interface NotificationDrawerContextValue {
  isOpen: boolean;
  notification: NotificationItem | null;
  openDrawer: (notification: NotificationItem) => void;
  closeDrawer: () => void;
}

const NotificationDrawerContext = createContext<NotificationDrawerContextValue | null>(null);

// Default no-op context for when used outside provider
const defaultContextValue: NotificationDrawerContextValue = {
  isOpen: false,
  notification: null,
  openDrawer: () => {
    console.warn("useNotificationDrawer: openDrawer called outside NotificationDrawerProvider");
  },
  closeDrawer: () => {},
};

export function useNotificationDrawer(): NotificationDrawerContextValue {
  const context = useContext(NotificationDrawerContext);
  // Return safe defaults if used outside provider (e.g., during SSR or in non-Layout pages)
  return context ?? defaultContextValue;
}

interface NotificationDrawerProviderProps {
  children: ReactNode;
}

export function NotificationDrawerProvider({ children }: NotificationDrawerProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notification, setNotification] = useState<NotificationItem | null>(null);

  const openDrawer = useCallback((n: NotificationItem) => {
    setNotification(n);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    // Delay clearing notification to allow close animation
    setTimeout(() => setNotification(null), 300);
  }, []);

  return (
    <NotificationDrawerContext.Provider
      value={{ isOpen, notification, openDrawer, closeDrawer }}
    >
      {children}
    </NotificationDrawerContext.Provider>
  );
}
