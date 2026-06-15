'use client';

interface Props {
  children: React.ReactNode;
}

export function CsmSettingsProjectGuard() {
  return (
    <p className="text-sm text-gray-600">
      Add ?project= to the URL from a project context.
    </p>
  );
}

export default function CsmSettingsPageRoot({ children }: Props) {
  return (
    <div className="flex min-h-full flex-1 flex-col gap-6 bg-white p-8 max-sm:p-4">
      {children}
    </div>
  );
}
