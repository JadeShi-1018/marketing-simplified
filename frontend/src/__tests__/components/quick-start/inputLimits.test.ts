import {
  getQuickStartMaxSupplementLength,
  isQuickStartCombinedLengthValid,
  isQuickStartPromptLengthValid,
} from '@/components/quick-start/inputLimits';
import {
  QUICK_START_MAX_COMBINED_LENGTH,
  QUICK_START_MAX_PROMPT_LENGTH,
  QUICK_START_MAX_SUPPLEMENT_LENGTH,
  QUICK_START_MIN_PROMPT_LENGTH,
} from '@/components/quick-start/constants';

describe('quick start input limits', () => {
  it('validates prompt length bounds', () => {
    expect(isQuickStartPromptLengthValid(QUICK_START_MIN_PROMPT_LENGTH - 1)).toBe(false);
    expect(isQuickStartPromptLengthValid(QUICK_START_MIN_PROMPT_LENGTH)).toBe(true);
    expect(isQuickStartPromptLengthValid(QUICK_START_MAX_PROMPT_LENGTH)).toBe(true);
    expect(isQuickStartPromptLengthValid(QUICK_START_MAX_PROMPT_LENGTH + 1)).toBe(false);
  });

  it('caps supplement by per-field and combined limits', () => {
    expect(getQuickStartMaxSupplementLength(1000)).toBe(QUICK_START_MAX_SUPPLEMENT_LENGTH);
    expect(getQuickStartMaxSupplementLength(3500)).toBe(
      QUICK_START_MAX_COMBINED_LENGTH - 3500
    );
    expect(getQuickStartMaxSupplementLength(QUICK_START_MAX_PROMPT_LENGTH)).toBe(
      QUICK_START_MAX_COMBINED_LENGTH - QUICK_START_MAX_PROMPT_LENGTH
    );
  });

  it('validates combined length', () => {
    expect(isQuickStartCombinedLengthValid(3000, 2000)).toBe(true);
    expect(isQuickStartCombinedLengthValid(3000, 2001)).toBe(false);
  });
});
