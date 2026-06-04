import type {
  QuickStartBlueprint,
  QuickStartBlueprintCalendarEvent,
  QuickStartBlueprintDecision,
  QuickStartBlueprintMiroBoard,
  QuickStartBlueprintSpreadsheet,
  QuickStartBlueprintTask,
} from '@/types/quickStart';

function replaceAt<T>(items: T[], index: number, next: T): T[] {
  return items.map((item, i) => (i === index ? next : item));
}

export function isoToDateInput(iso: string | undefined): string {
  if (!iso) return '';
  const datePart = iso.split('T')[0];
  return datePart.slice(0, 10);
}

export function mergeDateIntoIso(iso: string | undefined, dateValue: string): string {
  if (!dateValue) return iso ?? '';
  const timePart = iso?.includes('T') ? iso.split('T')[1] : '00:00:00';
  return `${dateValue}T${timePart}`;
}

export function patchBlueprintTasks(
  blueprint: QuickStartBlueprint,
  index: number,
  patch: Partial<QuickStartBlueprintTask>
): QuickStartBlueprint {
  const tasks = replaceAt(
    blueprint.tasks,
    index,
    { ...blueprint.tasks[index], ...patch }
  );
  return { ...blueprint, tasks };
}

export function patchBlueprintDecisions(
  blueprint: QuickStartBlueprint,
  index: number,
  patch: Partial<QuickStartBlueprintDecision>
): QuickStartBlueprint {
  const decisions = replaceAt(
    blueprint.decisions,
    index,
    { ...blueprint.decisions[index], ...patch }
  );
  return { ...blueprint, decisions };
}

export function patchBlueprintCalendarEvents(
  blueprint: QuickStartBlueprint,
  index: number,
  patch: Partial<QuickStartBlueprintCalendarEvent>
): QuickStartBlueprint {
  const calendar_events = replaceAt(
    blueprint.calendar_events,
    index,
    { ...blueprint.calendar_events[index], ...patch }
  );
  return { ...blueprint, calendar_events };
}

export function patchBlueprintSpreadsheets(
  blueprint: QuickStartBlueprint,
  index: number,
  patch: Partial<QuickStartBlueprintSpreadsheet>
): QuickStartBlueprint {
  const spreadsheets = replaceAt(
    blueprint.spreadsheets,
    index,
    { ...blueprint.spreadsheets[index], ...patch }
  );
  return { ...blueprint, spreadsheets };
}

export function patchBlueprintMiroBoard(
  blueprint: QuickStartBlueprint,
  boardIndex: number,
  patch: Partial<QuickStartBlueprintMiroBoard>
): QuickStartBlueprint {
  const miro_boards = replaceAt(
    blueprint.miro_boards,
    boardIndex,
    { ...blueprint.miro_boards[boardIndex], ...patch }
  );
  return { ...blueprint, miro_boards };
}

export function patchBlueprintMiroSticky(
  blueprint: QuickStartBlueprint,
  boardIndex: number,
  noteIndex: number,
  content: string
): QuickStartBlueprint {
  const board = blueprint.miro_boards[boardIndex];
  const sticky_notes = replaceAt(
    board.sticky_notes,
    noteIndex,
    { ...board.sticky_notes[noteIndex], content }
  );
  return patchBlueprintMiroBoard(blueprint, boardIndex, { sticky_notes });
}
