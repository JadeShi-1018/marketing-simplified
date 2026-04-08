"use client";

import React, { useEffect, useState } from "react";
import { Calendar, CheckSquare, Users, Clock, AlertCircle } from "lucide-react";
import type { NotificationItem } from "@/types/notifications";
import { TaskAPI } from "@/lib/api/taskApi";
import { MeetingsAPI } from "@/lib/api/meetingsApi";

interface DrawerObjectCardProps {
  notification: NotificationItem;
}

interface TaskData {
  id: number;
  summary: string;
  status: string;
  priority: string;
  owner?: { id: number; username: string; email: string };
  assignee?: { id: number; username: string; email: string };
  due_date?: string;
}

interface MeetingData {
  id: number;
  title: string;
  scheduled_time?: string | null;
  status?: string;
  participants?: Array<{ id: number; username: string }>;
}

// Status color mapping
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "bg-gray-100", text: "text-gray-700" },
  SUBMITTED: { bg: "bg-blue-100", text: "text-blue-700" },
  IN_PROGRESS: { bg: "bg-yellow-100", text: "text-yellow-700" },
  REVIEW: { bg: "bg-purple-100", text: "text-purple-700" },
  APPROVED: { bg: "bg-green-100", text: "text-green-700" },
  COMPLETED: { bg: "bg-green-100", text: "text-green-700" },
  REJECTED: { bg: "bg-red-100", text: "text-red-700" },
  CANCELLED: { bg: "bg-gray-100", text: "text-gray-500" },
  scheduled: { bg: "bg-blue-100", text: "text-blue-700" },
  completed: { bg: "bg-green-100", text: "text-green-700" },
  cancelled: { bg: "bg-red-100", text: "text-red-700" },
};

// Priority color mapping
const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: "bg-red-100", text: "text-red-700" },
  MEDIUM: { bg: "bg-orange-100", text: "text-orange-700" },
  LOW: { bg: "bg-green-100", text: "text-green-700" },
};

// Parse projectId and meetingId from action_url
function parseActionUrl(actionUrl: string): { projectId?: number; meetingId?: number } {
  // Expected format: /projects/{projectId}/meetings or /projects/{projectId}/meetings/{meetingId}
  const projectMatch = actionUrl.match(/\/projects\/(\d+)/);
  const meetingMatch = actionUrl.match(/\/meetings\/(\d+)/);

  return {
    projectId: projectMatch ? parseInt(projectMatch[1], 10) : undefined,
    meetingId: meetingMatch ? parseInt(meetingMatch[1], 10) : undefined,
  };
}

// Loading skeleton component
function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
      <div className="h-5 bg-gray-200 rounded w-3/4 mb-3"></div>
      <div className="flex gap-2 mb-3">
        <div className="h-6 bg-gray-200 rounded w-20"></div>
        <div className="h-6 bg-gray-200 rounded w-20"></div>
      </div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
    </div>
  );
}

// Task card component
function TaskCard({ task }: { task: TaskData }) {
  const statusStyle = STATUS_COLORS[task.status] || STATUS_COLORS.DRAFT;
  const priorityStyle = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <CheckSquare className="w-3.5 h-3.5" />
        <span>TASK-{task.id}</span>
      </div>

      <h4 className="text-base font-medium text-gray-900 mb-3">
        {task.summary}
      </h4>

      <div className="flex flex-wrap gap-2 mb-3">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
          {task.status.replace(/_/g, " ")}
        </span>
        {task.priority && (
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityStyle.bg} ${priorityStyle.text}`}>
            {task.priority} Priority
          </span>
        )}
      </div>

      {(task.owner || task.assignee || task.due_date) && (
        <div className="flex items-center gap-4 text-sm text-gray-600">
          {(task.owner || task.assignee) && (
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-gray-400" />
              <span>{task.assignee?.username || task.owner?.username || "Unassigned"}</span>
            </div>
          )}
          {task.due_date && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>{new Date(task.due_date).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Meeting card component
function MeetingCard({ meeting }: { meeting: MeetingData }) {
  const statusStyle = STATUS_COLORS[meeting.status || "scheduled"] || STATUS_COLORS.scheduled;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <Calendar className="w-3.5 h-3.5" />
        <span>MEET-{meeting.id}</span>
      </div>

      <h4 className="text-base font-medium text-gray-900 mb-3">
        {meeting.title}
      </h4>

      {meeting.status && (
        <div className="flex flex-wrap gap-2 mb-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
            {meeting.status}
          </span>
        </div>
      )}

      <div className="flex items-center gap-4 text-sm text-gray-600">
        {meeting.scheduled_time && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-gray-400" />
            <span>{new Date(meeting.scheduled_time).toLocaleString()}</span>
          </div>
        )}
        {meeting.participants && meeting.participants.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-gray-400" />
            <div className="flex -space-x-1.5">
              {meeting.participants.slice(0, 3).map((p, i) => (
                <div
                  key={p.id}
                  className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-medium ring-2 ring-white"
                  title={p.username}
                >
                  {p.username.charAt(0).toUpperCase()}
                </div>
              ))}
              {meeting.participants.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs font-medium ring-2 ring-white">
                  +{meeting.participants.length - 3}
                </div>
              )}
            </div>
            <span>{meeting.participants.length} assigned</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Generic object card for unknown types
function GenericCard({ notification }: { notification: NotificationItem }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>{notification.related_object_type.toUpperCase()}</span>
      </div>

      <h4 className="text-base font-medium text-gray-900 mb-2">
        {notification.title}
      </h4>

      {notification.body && (
        <p className="text-sm text-gray-600">{notification.body}</p>
      )}
    </div>
  );
}

export default function DrawerObjectCard({ notification }: DrawerObjectCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskData, setTaskData] = useState<TaskData | null>(null);
  const [meetingData, setMeetingData] = useState<MeetingData | null>(null);

  const objectType = notification.related_object_type?.toLowerCase();
  const objectId = notification.related_object_id;

  useEffect(() => {
    async function fetchData() {
      if (!objectType || !objectId) return;

      setLoading(true);
      setError(null);

      try {
        if (objectType === "task") {
          const response = await TaskAPI.getTask(parseInt(objectId, 10));
          setTaskData(response.data);
        } else if (objectType === "meeting") {
          const { projectId, meetingId } = parseActionUrl(notification.action_url);
          if (projectId) {
            const id = meetingId || parseInt(objectId, 10);
            const data = await MeetingsAPI.getMeeting(projectId, id);
            // Map API response to MeetingData interface
            setMeetingData({
              id: data.id,
              title: data.title,
              scheduled_time: data.scheduled_time,
              status: data.status,
              participants: data.participants?.map((p) => ({
                id: p.user_id,
                username: `User ${p.user_id}`,
              })),
            });
          } else {
            // Fallback: extract from metadata if available
            const metaProjectId = notification.metadata?.project_id as number | undefined;
            if (metaProjectId) {
              const data = await MeetingsAPI.getMeeting(metaProjectId, parseInt(objectId, 10));
              setMeetingData({
                id: data.id,
                title: data.title,
                scheduled_time: data.scheduled_time,
                status: data.status,
                participants: data.participants?.map((p) => ({
                  id: p.user_id,
                  username: `User ${p.user_id}`,
                })),
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch related object:", err);
        setError("Unable to load details");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [objectType, objectId, notification.action_url, notification.metadata]);

  // Don't render if no related object
  if (!objectType && !objectId) {
    return null;
  }

  return (
    <div className="px-5 py-4 border-t border-gray-100">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {objectType === "meeting" ? "Meeting Details" : objectType === "task" ? "Task Details" : "Related Item"}
      </div>

      {loading && <LoadingSkeleton />}

      {error && (
        <div className="text-sm text-gray-500 italic">{error}</div>
      )}

      {!loading && !error && taskData && <TaskCard task={taskData} />}
      {!loading && !error && meetingData && <MeetingCard meeting={meetingData} />}
      {!loading && !error && !taskData && !meetingData && objectType && (
        <GenericCard notification={notification} />
      )}
    </div>
  );
}
