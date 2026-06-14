'use client';

import { PORTAL_HEADER_GRADIENT_CLASS } from '../constants';
import PortalFooter from './PortalFooter';

interface Props {
  children: React.ReactNode;
}

export default function PortalPageShell({ children }: Props) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div
        className={`relative z-0 h-40 w-full ${PORTAL_HEADER_GRADIENT_CLASS}`}
        aria-hidden
        data-testid="portal-header-band"
      />
      <div className="relative z-10 mx-auto -mt-[140px] max-w-2xl px-5 pb-12">
        <div
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-md"
          data-testid="portal-form-card"
        >
          {children}
        </div>
        <PortalFooter />
      </div>
    </div>
  );
}
