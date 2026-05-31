'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { QuickStartBlueprint, QuickStartModuleKey, QuickStartSelectedModules } from '@/types/quickStart';
import { PreviewEditableTitle } from '../PreviewEditableTitle';
import { QUICK_START_MODULE_KEYS } from '../buildConfirmRequest';
import { getModuleDraftCount } from '../getModuleDraftCount';
import { isoToDateInput } from '../patchPreviewBlueprint';
import {
  patchBlueprintCalendarEvents,
  patchBlueprintDecisions,
  patchBlueprintMiroBoard,
  patchBlueprintSpreadsheets,
  patchBlueprintTasks,
} from '../patchPreviewBlueprint';
import type { QuickStartPreviewPayload, QuickStartWizardState } from '../types';

const MODULE_LABELS: Record<QuickStartModuleKey, string> = {
  tasks: 'Tasks',
  spreadsheet: 'Spreadsheet',
  calendar: 'Calendar',
  decisions: 'Decisions',
  miro: 'Miro boards',
};

type QuickStartPreviewStepProps = {
  state: QuickStartWizardState;
  preview: QuickStartPreviewPayload;
  onChange: (patch: Partial<QuickStartWizardState>) => void;
  onBlueprintChange: (blueprint: QuickStartBlueprint) => void;
  onRegenerate?: (selectedModules: QuickStartSelectedModules) => void;
};

function formatTaskMeta(type?: string, priority?: string): string | null {
  const parts = [type, priority].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatTaskDates(dueDate?: string, plannedStart?: string): string | null {
  const parts: string[] = [];
  if (dueDate) parts.push(`Due ${dueDate}`);
  if (plannedStart) parts.push(`Start ${plannedStart}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatCalendarRange(start: string, end: string): string {
  const startLabel = isoToDateInput(start) || start;
  const endLabel = isoToDateInput(end) || end;
  if (startLabel && endLabel && startLabel !== endLabel) {
    return `${startLabel} – ${endLabel}`;
  }
  return startLabel || endLabel;
}

export default function QuickStartPreviewStep({
  state,
  preview,
  onChange,
  onBlueprintChange,
  onRegenerate,
}: QuickStartPreviewStepProps) {
  const { outline, blueprint } = preview;

  const updateBlueprint = (next: QuickStartBlueprint) => {
    onBlueprintChange(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="quick-start-project-title" className="block text-sm font-medium text-gray-800 mb-2">
          Project title
        </label>
        <Input
          id="quick-start-project-title"
          value={state.projectTitle}
          onChange={(event) => onChange({ projectTitle: event.target.value })}
          maxLength={200}
        />
        {outline.project.description ? (
          <p className="mt-2 text-sm text-gray-600">{outline.project.description}</p>
        ) : null}
      </div>

      <div>
        <p className="text-sm font-medium text-gray-800 mb-3">Modules to create</p>
        <div className="space-y-3">
          {QUICK_START_MODULE_KEYS.map((key) => {
            const enabled = state.selectedModules[key];
            const count = getModuleDraftCount(key, blueprint, enabled);
            return (
              <label
                key={key}
                className="flex items-start gap-3 rounded-lg border border-gray-100 px-4 py-3 cursor-pointer hover:bg-gray-50"
              >
                <Checkbox
                  checked={enabled}
                  onCheckedChange={(checked) => {
                    const nextEnabled = checked === true;
                    const nextModules = {
                      ...state.selectedModules,
                      [key]: nextEnabled,
                    };
                    onChange({ selectedModules: nextModules });
                    if (
                      onRegenerate &&
                      nextEnabled &&
                      getModuleDraftCount(key, blueprint, true) === 0
                    ) {
                      onRegenerate(nextModules);
                    }
                  }}
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-gray-900">
                    {MODULE_LABELS[key]}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {count} item{count === 1 ? '' : 's'} in draft
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {state.selectedModules.tasks && blueprint.tasks.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Tasks preview</h3>
          <ul className="space-y-2">
            {blueprint.tasks.map((task, index) => {
              const meta = formatTaskMeta(task.type, task.priority);
              const dates = formatTaskDates(task.due_date, task.planned_start_date);
              return (
                <li
                  key={`task-${index}`}
                  className="rounded-lg border border-gray-100 px-3 py-2 space-y-1"
                >
                  <PreviewEditableTitle
                    value={task.summary}
                    onChange={(summary) =>
                      updateBlueprint(patchBlueprintTasks(blueprint, index, { summary }))
                    }
                    ariaLabel={`Task ${index + 1} title`}
                  />
                  {meta || dates ? (
                    <p className="text-xs text-gray-500">
                      {[meta, dates].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {state.selectedModules.spreadsheet && blueprint.spreadsheets.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Spreadsheet preview</h3>
          <ul className="space-y-2">
            {blueprint.spreadsheets.map((sheet, index) => {
              const outlineSheet = outline.spreadsheets[index];
              const firstSheet = sheet.sheets[0];
              return (
                <li
                  key={`spreadsheet-${index}`}
                  className="rounded-lg border border-gray-100 px-3 py-2"
                >
                  <PreviewEditableTitle
                    value={sheet.name}
                    onChange={(name) =>
                      updateBlueprint(patchBlueprintSpreadsheets(blueprint, index, { name }))
                    }
                    ariaLabel={`Spreadsheet ${index + 1} name`}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {outlineSheet?.sheet_name ?? firstSheet?.name ?? 'Sheet'} ·{' '}
                    {(outlineSheet?.column_names ?? firstSheet?.columns.map((c) => c.name) ?? []).join(
                      ', '
                    )}{' '}
                    · {outlineSheet?.row_count ?? firstSheet?.rows.length ?? 0} rows
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {state.selectedModules.calendar && blueprint.calendar_events.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Calendar preview</h3>
          <ul className="space-y-2">
            {blueprint.calendar_events.map((event, index) => (
              <li
                key={`calendar-${index}`}
                className="text-sm rounded-lg border border-gray-100 px-3 py-2 flex justify-between gap-3 items-start"
              >
                <PreviewEditableTitle
                  value={event.title}
                  onChange={(title) =>
                    updateBlueprint(patchBlueprintCalendarEvents(blueprint, index, { title }))
                  }
                  ariaLabel={`Calendar event ${index + 1} title`}
                  className="flex-1 min-w-0"
                />
                <span className="text-xs text-gray-500 shrink-0 pt-0.5">
                  {formatCalendarRange(event.start_datetime, event.end_datetime)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.selectedModules.decisions && blueprint.decisions.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Decisions preview</h3>
          <ul className="space-y-2">
            {blueprint.decisions.map((decision, index) => (
              <li
                key={`decision-${index}`}
                className="rounded-lg border border-gray-100 px-3 py-2 space-y-1"
              >
                <PreviewEditableTitle
                  value={decision.title}
                  onChange={(title) =>
                    updateBlueprint(patchBlueprintDecisions(blueprint, index, { title }))
                  }
                  ariaLabel={`Decision ${index + 1} title`}
                />
                {decision.description ? (
                  <p className="text-xs text-gray-500 line-clamp-3">{decision.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.selectedModules.miro && blueprint.miro_boards.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Miro boards preview</h3>
          <ul className="space-y-2">
            {blueprint.miro_boards.map((board, boardIndex) => (
              <li
                key={`miro-${boardIndex}`}
                className="rounded-lg border border-gray-100 px-3 py-2"
              >
                <PreviewEditableTitle
                  value={board.name}
                  onChange={(name) =>
                    updateBlueprint(patchBlueprintMiroBoard(blueprint, boardIndex, { name }))
                  }
                  ariaLabel={`Miro board ${boardIndex + 1} name`}
                />
                {(board.sticky_notes?.length ?? 0) > 0 ? (
                  <ul className="mt-1.5 space-y-1 text-xs text-gray-600 list-disc pl-4">
                    {board.sticky_notes.map((note, noteIndex) => (
                      <li key={`miro-${boardIndex}-note-${noteIndex}`}>{note.content}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
