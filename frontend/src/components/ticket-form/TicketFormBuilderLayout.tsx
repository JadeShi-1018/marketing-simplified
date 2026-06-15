'use client';

import BuilderSidePanelChrome from './BuilderSidePanelChrome';

interface Props {
  canvas: React.ReactNode;
  fieldsPanel: React.ReactNode;
}

/** Matches `/tasks/new` page shell: max-w-5xl centered column + 1fr / 280px grid. */
export default function TicketFormBuilderLayout({ canvas, fieldsPanel }: Props) {
  return (
    <div
      className="mx-auto w-full max-w-5xl px-0 py-3 sm:px-6 sm:py-8"
      data-testid="builder-page-root"
    >
      <div
        className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_280px] animate-in fade-in duration-150"
        data-testid="builder-workspace"
        data-layout-state="idle_wide"
      >
        <div className="min-w-0" data-testid="builder-canvas-zone">
          {canvas}
        </div>

        <aside
          className="min-w-0 lg:sticky lg:top-6 lg:self-start"
          data-testid="builder-fields-zone"
        >
          <BuilderSidePanelChrome>{fieldsPanel}</BuilderSidePanelChrome>
        </aside>
      </div>
    </div>
  );
}
