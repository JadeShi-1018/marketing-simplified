'use client';

interface Props {
  name: string;
}

/** Experience group name shown above the portal form title. */
export default function PortalBrandingRow({ name }: Props) {
  return (
    <div data-testid="portal-branding-row">
      <span className="text-lg font-semibold leading-snug text-gray-700">{name}</span>
    </div>
  );
}
