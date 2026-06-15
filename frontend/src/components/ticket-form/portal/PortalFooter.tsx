'use client';

import Image from 'next/image';

export default function PortalFooter() {
  return (
    <footer
      className="mt-8 flex items-center justify-center gap-1.5 text-sm leading-normal text-gray-700"
      data-testid="portal-footer"
    >
      <span>Powered by Marketing Simplified</span>
    </footer>
  );
}
