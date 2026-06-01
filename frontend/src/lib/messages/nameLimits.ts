export const MAX_CHANNEL_NAME_LENGTH = 40;
export const MAX_SIDEBAR_SECTION_NAME_LENGTH = 24;

export function limitName(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

export function normalizeLimitedName(value: string, maxLength: number): string {
  return limitName(value.trim(), maxLength);
}
