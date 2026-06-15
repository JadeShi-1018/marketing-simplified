'use client';

interface Props {
  children: React.ReactNode;
}

export const BUILDER_SIDE_PANEL_CLASS =
  'overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100';

export default function BuilderSidePanelChrome({ children }: Props) {
  return <div className={BUILDER_SIDE_PANEL_CLASS}>{children}</div>;
}
