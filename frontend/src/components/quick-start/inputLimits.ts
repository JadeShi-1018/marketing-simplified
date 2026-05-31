import {
  QUICK_START_MAX_COMBINED_LENGTH,
  QUICK_START_MAX_PROMPT_LENGTH,
  QUICK_START_MAX_SUPPLEMENT_LENGTH,
  QUICK_START_MIN_PROMPT_LENGTH,
} from './constants';

export function getQuickStartMaxSupplementLength(promptTrimmedLength: number): number {
  return Math.max(
    0,
    Math.min(
      QUICK_START_MAX_SUPPLEMENT_LENGTH,
      QUICK_START_MAX_COMBINED_LENGTH - promptTrimmedLength
    )
  );
}

export function isQuickStartPromptLengthValid(promptTrimmedLength: number): boolean {
  return (
    promptTrimmedLength >= QUICK_START_MIN_PROMPT_LENGTH &&
    promptTrimmedLength <= QUICK_START_MAX_PROMPT_LENGTH
  );
}

export function isQuickStartCombinedLengthValid(
  promptTrimmedLength: number,
  supplementTrimmedLength: number
): boolean {
  return promptTrimmedLength + supplementTrimmedLength <= QUICK_START_MAX_COMBINED_LENGTH;
}
