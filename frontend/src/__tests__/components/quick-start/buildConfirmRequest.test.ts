import {
  buildQuickStartConfirmRequest,
  validateQuickStartConfirm,
} from '@/components/quick-start/buildConfirmRequest';
import { INITIAL_QUICK_START_WIZARD_STATE } from '@/components/quick-start/constants';
import { QUICK_START_BLUEPRINT_VERSION } from '@/types/quickStart';

const samplePreview = {
  outline: {
    project: { title: 'Launch', description: '' },
    modules: {},
    tasks: [],
    spreadsheets: [],
    calendar_events: [],
  },
  blueprint: {
    version: QUICK_START_BLUEPRINT_VERSION,
    project: { name: 'Launch' },
    tasks: [],
    spreadsheets: [],
    calendar_events: [],
    decisions: [],
    miro_boards: [],
  },
};

describe('buildQuickStartConfirmRequest', () => {
  it('validates missing preview', () => {
    expect(
      validateQuickStartConfirm(null, {
        ...INITIAL_QUICK_START_WIZARD_STATE,
        projectTitle: 'Launch',
      })
    ).toMatch(/generate a preview/i);
  });

  it('validates at least one module', () => {
    expect(
      validateQuickStartConfirm(samplePreview, {
        ...INITIAL_QUICK_START_WIZARD_STATE,
        projectTitle: 'Launch',
        selectedModules: {
          tasks: false,
          spreadsheet: false,
          calendar: false,
          decisions: false,
          miro: false,
        },
      })
    ).toMatch(/at least one module/i);
  });

  it('builds confirm payload', () => {
    const state = {
      ...INITIAL_QUICK_START_WIZARD_STATE,
      projectTitle: 'Custom Title',
    };
    const request = buildQuickStartConfirmRequest(samplePreview, state);

    expect(request.project_title).toBe('Custom Title');
    expect(request.blueprint.version).toBe(1);
    expect(request.selected_modules?.tasks).toBe(true);
  });
});
