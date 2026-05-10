'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Bot } from 'lucide-react';
import { AgentLayoutProvider } from './AgentLayoutContext';
import { AgentChatPage } from './chat/AgentChatPage';
import { useAgentSidePanelStore } from '@/lib/agentSidePanelStore';
import { ApprovalToggle } from './chat/ApprovalToggle';
import { AgentAPI } from '@/lib/api/agentApi';

const MIN_WIDTH = 280;
const MAX_WIDTH = 420;

export default function AgentSidePanel() {
  const { isOpen, close } = useAgentSidePanelStore();
  const [width, setWidth] = useState(MAX_WIDTH);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(MAX_WIDTH);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setWidth(newWidth);
    };
    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Initialize approval state when opening the panel (covers first open + refresh).
  useEffect(() => {
    if (!isOpen) return;
    const prefRaw = localStorage.getItem('agent-approval-required-default');
    if (prefRaw === 'true' || prefRaw === 'false') {
      setApprovalRequired(prefRaw === 'true');
    }
    const stored = sessionStorage.getItem('agent-session-id');
    if (!stored) {
      setSessionId(null);
      return;
    }
    setSessionId(stored);
    AgentAPI.getSession(stored)
      .then((s) => setApprovalRequired(Boolean(s.approval_required)))
      .catch(() => {
        // keep last known value
      });
  }, [isOpen]);

  // Sync from AgentChatPage broadcasts.
  useEffect(() => {
    const onSessionId = (e: Event) => {
      const detail = (e as CustomEvent).detail as { sessionId?: string | null } | undefined;
      if (!detail) return;
      setSessionId(detail.sessionId ?? null);
    };
    const onSessionState = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { sessionId?: string; approvalRequired?: boolean }
        | undefined;
      if (!detail?.sessionId) return;
      setSessionId(String(detail.sessionId));
      if (typeof detail.approvalRequired === 'boolean') {
        setApprovalRequired(detail.approvalRequired);
      }
    };
    window.addEventListener('agent:session-id', onSessionId);
    window.addEventListener('agent:session-state', onSessionState);
    return () => {
      window.removeEventListener('agent:session-id', onSessionId);
      window.removeEventListener('agent:session-state', onSessionState);
    };
  }, []);

  return (
    <aside
      className={`h-screen border-l border-gray-200 bg-white shrink-0 overflow-hidden flex ${
        isOpen ? '' : 'w-0 pointer-events-none'
      }`}
      style={isOpen ? { width } : undefined}
      aria-hidden={!isOpen}
    >
      {/* Drag handle */}
      {isOpen && (
        <div
          onMouseDown={onMouseDown}
          className="w-1 h-full cursor-ew-resize hover:bg-[#3CCED7]/40 active:bg-[#3CCED7]/60 shrink-0 transition-colors"
        />
      )}

      <div className="flex-1 h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#3CCED7]" />
            <span className="text-sm font-semibold text-gray-900">AI Agent</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#3CCED7]/15 text-[#3CCED7]">
              AI
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500 font-medium">Approval</span>
              <ApprovalToggle
                sessionId={sessionId}
                value={approvalRequired}
                onChange={(next) => {
                  setApprovalRequired(next);
                  localStorage.setItem('agent-approval-required-default', String(next));
                  if (sessionId) {
                    window.dispatchEvent(
                      new CustomEvent('agent:approval-changed', { detail: { sessionId, value: next } })
                    );
                    window.dispatchEvent(
                      new CustomEvent('agent:session-state', {
                        detail: { sessionId, approvalRequired: next },
                      })
                    );
                  }
                }}
              />
            </div>
            <button
              onClick={close}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Close AI Agent panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Chat content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <AgentLayoutProvider initialView="overview">
            <AgentChatPage embeddedInFloating />
          </AgentLayoutProvider>
        </div>
      </div>
    </aside>
  );
}
