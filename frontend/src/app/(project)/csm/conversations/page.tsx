'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ConversationDetail } from '@/types/csmConversation';
import { Queue } from '@/types/csm';
import { useCsmConversationStore } from '@/lib/csmConversationStore';
import { useCsmConversationSocket } from '@/hooks/useCsmConversationSocket';
import CsmConversationAPI from '@/lib/api/csmConversationApi';
import CsmAPI from '@/lib/api/csmApi';
import { ConversationList } from '@/components/csm/conversations/ConversationList';
import { ConversationThread } from '@/components/csm/conversations/ConversationThread';
import { ConversationComposer } from '@/components/csm/conversations/ConversationComposer';
import { CustomerProfilePanel } from '@/components/csm/conversations/CustomerProfilePanel';
import { MyTicketsPanel } from '@/components/csm/conversations/MyTicketsPanel';
import { ConversationActions } from '@/components/csm/conversations/ConversationActions';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

function ConversationsPageContent() {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [leftTab, setLeftTab] = useState<'conversations' | 'mytickets'>('conversations');
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0);

  // Queue selector state
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<number | null>(null);

  const conversations = useCsmConversationStore((s) => s.conversations);
  const setConversations = useCsmConversationStore((s) => s.setConversations);
  const activeId = useCsmConversationStore((s) => s.activeConversationId);
  const setMessages = useCsmConversationStore((s) => s.setMessages);
  const messagesByConversation = useCsmConversationStore((s) => s.messagesByConversation);
  const typingByConversation = useCsmConversationStore((s) => s.typingByConversation);

  const { sendTyping } = useCsmConversationSocket(activeId);

  // Load available queues once
  useEffect(() => {
    CsmAPI.getQueues().then((data) => {
      const list = Array.isArray(data) ? data : [];
      setQueues(list);
    }).catch(() => {});
  }, []);

  // Load conversation list — re-fetches when selectedQueue changes
  const loadConversations = useCallback(() => {
    setLoading(true);
    CsmConversationAPI.list({ queue: selectedQueue })
      .then((data) => setConversations(data))
      .finally(() => setLoading(false));
  }, [selectedQueue, setConversations]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load conversation detail when active changes
  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      return;
    }
    CsmConversationAPI.get(activeId).then((data) => {
      setDetail(data);
      setMessages(activeId, data.messages);
    });
  }, [activeId, setMessages]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const messages = activeId ? (messagesByConversation[activeId] ?? []) : [];
  const typingUsers = activeId ? (typingByConversation[activeId] ?? []) : [];

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* LEFT: Tab panel */}
      <div className="hidden h-full w-80 shrink-0 border-r border-gray-200 md:flex md:flex-col">
        {/* Tab header */}
        <div className="flex border-b border-gray-100 shrink-0">
          <button
            onClick={() => setLeftTab('conversations')}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              leftTab === 'conversations'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Conversations
          </button>
          <button
            onClick={() => setLeftTab('mytickets')}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              leftTab === 'mytickets'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            My Tickets
          </button>
        </div>

        {/* Queue selector — only shown on Conversations tab */}
        {leftTab === 'conversations' && (
          <div className="px-3 py-2 border-b border-gray-100 shrink-0">
            <select
              value={selectedQueue ?? ''}
              onChange={(e) => setSelectedQueue(e.target.value ? Number(e.target.value) : null)}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white outline-none focus:ring-1 focus:ring-blue-400 text-gray-700"
            >
              <option value="">All Queues</option>
              {queues.map((q) => (
                <option key={q.id} value={q.id}>{q.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {leftTab === 'conversations' ? (
            <ConversationList
              conversations={conversations}
              loading={loading}
              onClaimed={() => setTicketRefreshKey((k) => k + 1)}
            />
          ) : (
            <MyTicketsPanel refreshKey={ticketRefreshKey} />
          )}
        </div>
      </div>

      {/* MIDDLE: Conversation thread + composer */}
      <div className="flex flex-1 min-w-0 flex-col">
        {!activeConversation ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            Select a conversation to begin
          </div>
        ) : (
          <>
            <ConversationActions
              conversation={activeConversation}
              onPriorityChanged={(newPriority) => {
                setTicketRefreshKey((k) => k + 1);
                setDetail((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    linked_tickets: prev.linked_tickets.map((t) =>
                      t.id === activeConversation.ticket?.id
                        ? { ...t, priority: newPriority }
                        : t
                    ),
                  };
                });
              }}
            />
            <ConversationThread messages={messages} typingUserIds={typingUsers} />
            {activeConversation.ticket ? (
              <ConversationComposer
                conversationId={activeId!}
                organisationId={activeConversation.queue_organisation_id}
                onTyping={sendTyping}
              />
            ) : (
              <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400 text-center bg-gray-50">
                Claim this conversation to reply
              </div>
            )}
          </>
        )}
      </div>

      {/* RIGHT: Customer profile panel */}
      <div className="hidden h-full w-72 shrink-0 border-l border-gray-200 md:flex md:flex-col">
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <h2 className="font-semibold text-gray-900 text-sm">Customer Profile</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {detail ? (
            <CustomerProfilePanel
              profile={detail.customer_profile}
              linkedTickets={detail.linked_tickets}
              conversationId={detail.id}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
              {activeId ? 'Loading…' : 'No conversation selected'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  return (
    <ProtectedRoute>
      <DashboardLayout hideRightPanel>
        <ConversationsPageContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
