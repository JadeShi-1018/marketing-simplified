'use client';

interface Props {
  title: string;
  description?: string;
}

/** Read-only form title card — matches ticket form builder metadata header. */
export default function FormMetadataCard({ title, description }: Props) {
  return (
    <div className="shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="h-1.5 w-full shrink-0 bg-green-300" aria-hidden />
      <div className="flex min-h-[120px] flex-col justify-center px-10 py-8">
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        {description && <p className="mt-3 text-base text-gray-600">{description}</p>}
      </div>
    </div>
  );
}
