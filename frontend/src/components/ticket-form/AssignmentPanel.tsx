'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ExperienceGroupAPI } from '@/lib/api/experienceGroupApi';
import { TicketFormAPI } from '@/lib/api/ticketFormApi';
import type { ExperienceGroupListItem } from '@/types/experienceGroup';
import type { SupportProjectStub } from '@/types/ticketForm';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const OUTLINE_BUTTON_CLASS =
  'rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';

const CHECKBOX_CLASS =
  'h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500';

interface Props {
  formId: number;
  projectId: number;
  formName: string;
  isDefault: boolean;
  onDefaultChanged?: () => void;
  onAssignmentsSaved?: () => void;
}

export default function AssignmentPanel({
  formId,
  projectId,
  formName,
  isDefault,
  onDefaultChanged,
  onAssignmentsSaved,
}: Props) {
  const [groups, setGroups] = useState<ExperienceGroupListItem[]>([]);
  const [supportProjects, setSupportProjects] = useState<SupportProjectStub[]>([]);
  const [selectedEgIds, setSelectedEgIds] = useState<Set<number>>(new Set());
  const [selectedSpIds, setSelectedSpIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savingAssign, setSavingAssign] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [egRes, assignRes, spList] = await Promise.all([
          ExperienceGroupAPI.list({ project: projectId }),
          TicketFormAPI.listAssignments(formId),
          TicketFormAPI.listSupportProjects(projectId),
        ]);
        if (cancelled) return;
        const egList = Array.isArray(egRes.data) ? egRes.data : egRes.data.results ?? [];
        setGroups(egList);
        setSupportProjects(spList.filter((p) => !p.is_archived));
        const egIds = assignRes.data
          .filter((a) => a.experience_group)
          .map((a) => a.experience_group as number);
        const spIds = assignRes.data
          .filter((a) => a.support_project)
          .map((a) => a.support_project as number);
        setSelectedEgIds(new Set(egIds));
        setSelectedSpIds(new Set(spIds));
      } catch {
        toast.error('Failed to load assignments.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [formId, projectId]);

  const toggleEg = (id: number) => {
    setSelectedEgIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSp = (id: number) => {
    setSelectedSpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSetDefault = async () => {
    setSavingDefault(true);
    try {
      await TicketFormAPI.setDefault(formId);
      toast.success('Set as default form.');
      onDefaultChanged?.();
    } catch {
      toast.error('Could not set default.');
    } finally {
      setSavingDefault(false);
    }
  };

  const handleSaveAssignments = async () => {
    setSavingAssign(true);
    try {
      await TicketFormAPI.replaceAssignments(formId, {
        experience_group_ids: Array.from(selectedEgIds),
        support_project_ids: Array.from(selectedSpIds),
      });
      toast.success('Assignments saved.');
      onAssignmentsSaved?.();
    } catch {
      toast.error('Could not save assignments.');
    } finally {
      setSavingAssign(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const settingsHref = `/admin/csm/settings/support-projects?project=${projectId}`;

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Default form</h2>
        <p className="mt-1 text-sm text-gray-500">
          {formName} is used when no experience group or support project override applies.
        </p>
        <div className="mt-4 flex items-center gap-3">
          {isDefault ? (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
              Current default
            </span>
          ) : (
            <button
              type="button"
              disabled={savingDefault}
              onClick={handleSetDefault}
              className={OUTLINE_BUTTON_CLASS}
            >
              {savingDefault ? 'Saving...' : 'Set as default'}
            </button>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Experience Group assignments</h2>
        <p className="mt-1 text-sm text-gray-500">
          Selected experience groups use this form instead of the project default.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {groups.length === 0 && (
            <p className="text-sm italic text-gray-400">No experience groups in this project.</p>
          )}
          {groups.map((g) => (
            <label
              key={g.id}
              className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-700"
            >
              <input
                type="checkbox"
                className={CHECKBOX_CLASS}
                checked={selectedEgIds.has(g.id)}
                onChange={() => toggleEg(g.id)}
              />
              {g.name}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Support project assignments</h2>
        <p className="mt-1 text-sm text-gray-500">
          Selected support projects use this form instead of the project default.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {supportProjects.length === 0 ? (
            <p className="text-sm italic text-gray-400">
              No support projects configured.{' '}
              <Link
                href={settingsHref}
                className="text-sm text-indigo-600 hover:underline not-italic"
              >
                Configure support projects in Settings
              </Link>
            </p>
          ) : (
            supportProjects.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  className={CHECKBOX_CLASS}
                  checked={selectedSpIds.has(p.id)}
                  onChange={() => toggleSp(p.id)}
                />
                {p.name}
              </label>
            ))
          )}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={savingAssign}
          onClick={handleSaveAssignments}
          className={OUTLINE_BUTTON_CLASS}
        >
          {savingAssign ? 'Saving...' : 'Save assignments'}
        </button>
      </div>
    </div>
  );
}
