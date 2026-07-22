'use client';

interface Props {
  children: React.ReactNode;
}

export function CsmSettingsProjectGuard() {
  return (
    <p className="text-sm text-gray-600">
      Select a project from the project switcher to configure its settings.
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
