import {
  OVERVIEW_PENDING_SECTION_KEY,
  scrollOverviewMainToSection,
  scrollOverviewMainToSectionWithRetry,
} from '@/lib/overviewScroll';

describe('scrollOverviewMainToSection', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main class="dashboard-scrollbar" style="height: 400px; overflow-y: auto;">
        <motion style="height: 800px;"></motion>
        <section id="project-team" style="height: 200px;">Team</section>
      </main>
    `;
  });

  it('scrolls the main panel instead of the window', () => {
    const main = document.querySelector('main.dashboard-scrollbar') as HTMLElement;
    const team = document.getElementById('project-team') as HTMLElement;

    main.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 800, height: 400, bottom: 400, right: 800 }) as DOMRect;
    team.getBoundingClientRect = () =>
      ({ top: 600, left: 0, width: 800, height: 200, bottom: 800, right: 800 }) as DOMRect;

    main.scrollTo = jest.fn();

    const scrolled = scrollOverviewMainToSection('project-team', 'auto');

    expect(scrolled).toBe(true);
    expect(main.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: expect.any(Number), behavior: 'auto' })
    );
    const call = (main.scrollTo as jest.Mock).mock.calls[0][0];
    expect(call.top).toBeGreaterThan(0);
  });
});

describe('scrollOverviewMainToSectionWithRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries until the target section exists and clears pending key', () => {
    const main = document.createElement('main');
    main.className = 'dashboard-scrollbar';
    Object.defineProperty(main, 'scrollTop', { value: 0, writable: true });
    main.scrollTo = jest.fn();
    document.body.innerHTML = '';
    document.body.appendChild(main);

    scrollOverviewMainToSectionWithRetry('project-team', 'auto');
    jest.runOnlyPendingTimers();
    expect(main.scrollTo).not.toHaveBeenCalled();

    const team = document.createElement('section');
    team.id = 'project-team';
    main.appendChild(team);
    team.getBoundingClientRect = () =>
      ({ top: 400, left: 0, width: 800, height: 200, bottom: 600, right: 800 }) as DOMRect;
    main.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 800, height: 400, bottom: 400, right: 800 }) as DOMRect;

    sessionStorage.setItem(OVERVIEW_PENDING_SECTION_KEY, 'project-team');
    jest.runOnlyPendingTimers();

    expect(main.scrollTo).toHaveBeenCalled();
    expect(sessionStorage.getItem(OVERVIEW_PENDING_SECTION_KEY)).toBeNull();
  });
});
