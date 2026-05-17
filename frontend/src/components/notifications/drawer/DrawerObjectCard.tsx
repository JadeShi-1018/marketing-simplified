"use client";

import React, { useEffect, useState } from "react";
import {
  Calendar,
  CheckSquare,
  Users,
  Clock,
  AlertCircle,
  Briefcase,
  Scale,
} from "lucide-react";
import type { NotificationItem } from "@/types/notifications";
import { TaskAPI } from "@/lib/api/taskApi";
import { MeetingsAPI } from "@/lib/api/meetingsApi";
import { ProjectAPI } from "@/lib/api/projectApi";
import { DecisionAPI } from "@/lib/api/decisionApi";

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
  participants?: Array<{ id: number; username: string; avatar?: string | null }>;
}

interface ProjectCardData {
  id: number;
  name: string;
  created_at?: string;
  is_active?: boolean;
  status?: string;
  owner?: { id: number; username?: string; name?: string; email?: string } | null;
  member_count?: number;
  members?: Array<{ id: number; username?: string; name?: string }>;
}

interface DecisionCardData {
  id: number;
  projectSeq?: number | null;
  title?: string | null;
  riskLevel?: string | null;
  createdAt?: string;
}

// ── Colour helpers ────────────────────────────────────────────────────────────

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
  active: { bg: "bg-green-100", text: "text-green-700" },
  inactive: { bg: "bg-gray-100", text: "text-gray-500" },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: "bg-red-100", text: "text-red-700" },
  MEDIUM: { bg: "bg-orange-100", text: "text-orange-700" },
  LOW: { bg: "bg-green-100", text: "text-green-700" },
};

const RISK_COLORS: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: "bg-red-100", text: "text-red-700" },
  MEDIUM: { bg: "bg-orange-100", text: "text-orange-700" },
  LOW: { bg: "bg-green-100", text: "text-green-700" },
};

// Deterministic color for avatar initials based on index
const AVATAR_PALETTE = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-red-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-pink-500",
];
function avatarColor(index: number) {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

function formatDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

// ── Shared stacked-avatars component ─────────────────────────────────────────

interface AvatarPerson {
  id: number;
  username?: string;
  name?: string;
  avatar?: string | null;
}

function StackedAvatars({
  people,
  max = 3,
  totalCount,
}: {
  people: AvatarPerson[];
  max?: number;
  totalCount?: number;
}) {
  const shown = people.slice(0, max);
  const overflow = (totalCount ?? people.length) - shown.length;

  return (
    <div className="flex -space-x-1.5">
      {shown.map((p, i) => {
        const label = p.name || p.username || "?";
        const initial = label.charAt(0).toUpperCase();
        return (
          <div
            key={p.id}
            title={label}
            className={`w-6 h-6 rounded-full ring-2 ring-white overflow-hidden flex items-center justify-center text-xs font-semibold text-white ${avatarColor(i)}`}
          >
            {p.avatar ? (
              <img src={p.avatar} alt={label} className="w-full h-full object-cover" />
            ) : (
              initial
            )}
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="w-6 h-6 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs font-medium ring-2 ring-white">
          +{overflow}
        </div>
      )}
    </div>
  );
}

// ── Owner chip (avatar + name) ────────────────────────────────────────────────

function OwnerChip({
  name,
  avatar,
  colorIndex = 0,
}: {
  name: string;
  avatar?: string | null;
  colorIndex?: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        title={name}
        className={`w-6 h-6 rounded-full ring-2 ring-white overflow-hidden flex items-center justify-center text-xs font-semibold text-white ${avatarColor(colorIndex)}`}
      >
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </div>
      <span className="text-sm text-gray-700">{name}</span>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
      <div className="h-5 bg-gray-200 rounded w-3/4 mb-3"></div>
      <div className="flex gap-2 mb-3">
        <div className="h-6 bg-gray-200 rounded w-20"></div>
      </div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
    </div>
  );
}

// ── Card components ───────────────────────────────────────────────────────────

function TaskCard({ task }: { task: TaskData }) {
  const statusStyle = STATUS_COLORS[task.status] || STATUS_COLORS.DRAFT;
  const priorityStyle = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <CheckSquare className="w-3.5 h-3.5" />
        <span>TASK-{task.id}</span>
      </div>
      <h4 className="text-base font-medium text-gray-900 mb-3">{task.summary}</h4>
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

function MeetingCard({ meeting }: { meeting: MeetingData }) {
  const statusStyle = STATUS_COLORS[meeting.status || "scheduled"] || STATUS_COLORS.scheduled;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <Calendar className="w-3.5 h-3.5" />
        <span>MEET-{meeting.id}</span>
      </div>
      <h4 className="text-base font-medium text-gray-900 mb-3">{meeting.title}</h4>
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
            <StackedAvatars
              people={meeting.participants.map((p) => ({
                id: p.id,
                username: p.username,
                avatar: p.avatar,
              }))}
            />
            <span>{meeting.participants.length} assigned</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, notification }: { project: ProjectCardData; notification: NotificationItem }) {
  // is_active / status only available when API succeeded; omit badge in fallback
  const hasFullData = project.is_active !== undefined || project.status !== undefined;
  const statusLabel = project.is_active ? "active" : project.status || "inactive";
  const statusStyle = STATUS_COLORS[statusLabel] || { bg: "bg-gray-100", text: "text-gray-700" };

  // Owner: prefer project owner from API; fallback to the notification actor (inviter)
  const ownerName =
    project.owner?.name ||
    project.owner?.username ||
    project.owner?.email ||
    notification.actor_name ||
    null;
  const ownerAvatar = project.owner ? null : (notification.actor_avatar ?? null);

  // Date: prefer project creation date from API; fallback to notification (invite) date
  const createdDate =
    formatDate(project.created_at) ?? formatDate(notification.created_at);

  const members = project.members ?? [];
  const totalMembers = project.member_count ?? members.length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <Briefcase className="w-3.5 h-3.5" />
        <span>PROJ-{project.id}</span>
      </div>
      <h4 className="text-base font-medium text-gray-900 mb-3">{project.name}</h4>
      {hasFullData && (
        <div className="flex flex-wrap gap-2 mb-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
            {statusLabel}
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
        {createdDate && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-gray-400" />
            <span>{createdDate}</span>
          </div>
        )}
        {ownerName && (
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-gray-400" />
            <OwnerChip name={ownerName} avatar={ownerAvatar} colorIndex={0} />
          </div>
        )}
        {members.length > 0 && (
          <div className="flex items-center gap-1.5">
            <StackedAvatars
              people={members.map((m) => ({
                id: m.id,
                username: m.username,
                name: m.name,
              }))}
              totalCount={totalMembers}
            />
            <span>{totalMembers} member{totalMembers !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionCard({
  decision,
  notification,
}: {
  decision: DecisionCardData;
  notification: NotificationItem;
}) {
  const seq = decision.projectSeq ?? decision.id;
  const riskLevel = decision.riskLevel?.toUpperCase();
  const riskStyle = riskLevel ? (RISK_COLORS[riskLevel] || RISK_COLORS.MEDIUM) : null;
  const createdDate = formatDate(decision.createdAt);

  const ownerName = notification.actor_name || null;
  const ownerAvatar = notification.actor_avatar || null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <Scale className="w-3.5 h-3.5" />
        <span>DEC-{seq}</span>
      </div>
      <h4 className="text-base font-medium text-gray-900 mb-3">
        {decision.title || "Untitled Decision"}
      </h4>
      {riskStyle && riskLevel && (
        <div className="flex flex-wrap gap-2 mb-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${riskStyle.bg} ${riskStyle.text}`}>
            {riskLevel.toLowerCase()} risk
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
        {createdDate && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-gray-400" />
            <span>{createdDate}</span>
          </div>
        )}
        {ownerName && (
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-gray-400" />
            <OwnerChip name={ownerName} avatar={ownerAvatar} colorIndex={0} />
          </div>
        )}
      </div>
    </div>
  );
}

function GenericCard({ notification }: { notification: NotificationItem }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>{notification.related_object_type.toUpperCase()}</span>
      </div>
      <h4 className="text-base font-medium text-gray-900 mb-2">{notification.title}</h4>
      {notification.body && (
        <p className="text-sm text-gray-600">{notification.body}</p>
      )}
    </div>
  );
}

// ── Parse helpers ─────────────────────────────────────────────────────────────

function parseActionUrl(actionUrl: string): { projectId?: number; meetingId?: number } {
  const projectMatch = actionUrl.match(/\/projects\/(\d+)/);
  const meetingMatch = actionUrl.match(/\/meetings\/(\d+)/);
  return {
    projectId: projectMatch ? parseInt(projectMatch[1], 10) : undefined,
    meetingId: meetingMatch ? parseInt(meetingMatch[1], 10) : undefined,
  };
}

function extractProjectId(notification: NotificationItem): number | undefined {
  const fromUrl = parseActionUrl(notification.action_url || "").projectId;
  if (fromUrl) return fromUrl;
  const fromMeta = notification.metadata?.project_id as number | undefined;
  if (fromMeta) return fromMeta;
  return undefined;
}

// ── Section title map ─────────────────────────────────────────────────────────

const SECTION_TITLES: Record<string, string> = {
  task: "Task Details",
  meeting: "Meeting Details",
  project: "Project Details",
  decision: "Decision Details",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function DrawerObjectCard({ notification }: DrawerObjectCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskData, setTaskData] = useState<TaskData | null>(null);
  const [meetingData, setMeetingData] = useState<MeetingData | null>(null);
  const [projectData, setProjectData] = useState<ProjectCardData | null>(null);
  const [decisionData, setDecisionData] = useState<DecisionCardData | null>(null);

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
          const projectId = extractProjectId(notification);
          if (projectId) {
            const { meetingId } = parseActionUrl(notification.action_url || "");
            const id = meetingId || parseInt(objectId, 10);
            const data = await MeetingsAPI.getMeeting(projectId, id);
            setMeetingData({
              id: data.id,
              title: data.title,
              scheduled_time: data.scheduled_time,
              status: data.status,
              participants: data.participants?.map((p) => ({
                id: p.user_id,
                username: p.username ?? `User ${p.user_id}`,
                avatar: p.avatar ?? null,
              })),
            });
          }

        } else if (objectType === "project") {
          const pid = parseInt(objectId, 10);
          try {
            // User may not be a member yet (invite not accepted) → 403 is expected
            const [proj, members] = await Promise.all([
              ProjectAPI.getProject(pid),
              ProjectAPI.getProjectMembers(pid).catch(() => []),
            ]);
            setProjectData({
              id: proj.id,
              name: proj.name,
              created_at: proj.created_at,
              is_active: proj.is_active,
              status: proj.status,
              owner: proj.owner,
              member_count: proj.member_count ?? members.length,
              members: members.slice(0, 4).map((m) => ({
                id: m.user.id,
                username: m.user.username,
                name: m.user.name,
              })),
            });
          } catch {
            // Fallback: render basic card from notification metadata
            const metaName = notification.metadata?.project_name as string | undefined;
            setProjectData({
              id: pid,
              name: metaName || `Project ${pid}`,
              members: [],
            });
          }

        } else if (objectType === "decision") {
          const projectId = extractProjectId(notification);
          const data = await DecisionAPI.getDecision(parseInt(objectId, 10), projectId);
          setDecisionData({
            id: data.id,
            projectSeq: data.projectSeq,
            title: data.title,
            riskLevel: data.riskLevel,
            createdAt: data.createdAt,
          });
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

  if (!objectType && !objectId) return null;

  const sectionTitle = SECTION_TITLES[objectType] ?? "Related Item";

  return (
    <div className="px-5 py-4 border-t border-gray-100">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {sectionTitle}
      </div>

      {loading && <LoadingSkeleton />}

      {error && (
        <div className="text-sm text-gray-500 italic">{error}</div>
      )}

      {!loading && !error && taskData && <TaskCard task={taskData} />}
      {!loading && !error && meetingData && <MeetingCard meeting={meetingData} />}
      {!loading && !error && projectData && (
        <ProjectCard project={projectData} notification={notification} />
      )}
      {!loading && !error && decisionData && (
        <DecisionCard decision={decisionData} notification={notification} />
      )}
      {!loading && !error && !taskData && !meetingData && !projectData && !decisionData && objectType && (
        <GenericCard notification={notification} />
      )}
    </div>
  );
}
