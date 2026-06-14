'use client';

interface Props {
  title: string;
  description?: string;
}

export default function PortalFormMetadata({ title, description }: Props) {
  return (
    <div data-testid="portal-form-metadata">
      <h1 className="text-3xl font-bold leading-tight text-gray-900">{title}</h1>
      {description ? (
        <p className="mt-2 text-base leading-normal text-gray-600">{description}</p>
      ) : null}
    </div>
  );
}
