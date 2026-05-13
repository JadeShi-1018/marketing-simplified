import { redirect } from 'next/navigation';

type SettingsSearchParams = Record<string, string | string[] | undefined>;

function getIntegrationsRedirectUrl(searchParams?: SettingsSearchParams) {
  const params = new URLSearchParams();

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined) params.append(key, item);
      });
      return;
    }

    if (value !== undefined) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return query ? `/integrations?${query}` : '/integrations';
}

export default function SettingsPage({
  searchParams,
}: {
  searchParams?: SettingsSearchParams;
}) {
  redirect(getIntegrationsRedirectUrl(searchParams));
}
