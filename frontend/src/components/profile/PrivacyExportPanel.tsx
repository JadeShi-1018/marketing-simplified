'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileJson,
  Loader2,
  ShieldCheck,
  Table2,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { profileApi, type PersonalDataExportFormat, type PersonalDataExportRequest } from '@/lib/api/profileApi';

const POLLING_STATUSES = new Set(['pending', 'processing']);

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function normalizeDownloadUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (typeof window !== 'undefined' && parsed.origin !== window.location.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return url;
  }
  return url;
}

function statusLabel(status: PersonalDataExportRequest['status']) {
  switch (status) {
    case 'pending':
      return 'Queued';
    case 'processing':
      return 'Processing';
    case 'ready':
      return 'Ready';
    case 'expired':
      return 'Expired';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export default function PrivacyExportPanel() {
  const [exports, setExports] = useState<PersonalDataExportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [exportFormat, setExportFormat] = useState<PersonalDataExportFormat>('json');
  const latestExport = exports[0] ?? null;

  const activeExport = useMemo(
    () => exports.find((item) => ['pending', 'processing', 'ready'].includes(item.status)) ?? latestExport,
    [exports, latestExport],
  );

  const loadExports = useCallback(async () => {
    try {
      const data = await profileApi.listPersonalDataExports();
      setExports(data);
    } catch {
      toast.error('Failed to load privacy exports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExports();
  }, [loadExports]);

  useEffect(() => {
    if (!activeExport || !POLLING_STATUSES.has(activeExport.status)) return undefined;
    const timer = window.setInterval(() => {
      void loadExports();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeExport, loadExports]);

  const handleRequestExport = async (format = exportFormat) => {
    setRequesting(true);
    try {
      const created = await profileApi.requestPersonalDataExport(format);
      setExports((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      toast.success(created.status === 'ready' ? 'Your export is ready.' : 'Personal data export requested.');
    } catch {
      toast.error('Failed to request export.');
    } finally {
      setRequesting(false);
    }
  };

  const handleFormatChange = (format: PersonalDataExportFormat) => {
    setExportFormat(format);
    if (requesting || (activeExport && POLLING_STATUSES.has(activeExport.status))) return;
    if (activeExport && activeExport.export_format === format) return;
    void handleRequestExport(format);
  };

  const statusClass = activeExport?.status === 'ready'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : activeExport?.status === 'failed' || activeExport?.status === 'expired'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-sky-200 bg-sky-50 text-sky-700';

  return (
    <section className="space-y-4" data-testid="privacy-export-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-9 rounded-md border border-gray-200 bg-gray-50 p-0.5" aria-label="Export format">
            {(['json', 'csv'] as const).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => handleFormatChange(format)}
                disabled={Boolean(activeExport && POLLING_STATUSES.has(activeExport.status))}
                className={`inline-flex items-center gap-1.5 rounded px-3 text-xs font-semibold uppercase transition-colors ${
                  exportFormat === format
                    ? 'bg-white text-[#179ea8] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                } disabled:cursor-not-allowed disabled:opacity-60`}
                aria-pressed={exportFormat === format}
              >
                {format === 'json' ? <FileJson className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
                {format}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center gap-3 px-4 py-5 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading export status
          </div>
        ) : activeExport ? (
          <div>
            <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50">
                  {activeExport.status === 'ready' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : activeExport.status === 'failed' || activeExport.status === 'expired' ? (
                    <XCircle className="h-5 w-5 text-red-600" />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">Personal data export</div>
                  <div className="text-xs text-gray-500">Requested {formatDate(activeExport.created_at)}</div>
                </div>
              </div>
              <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass}`}>
                {statusLabel(activeExport.status)}
              </span>
            </div>

            <dl className="grid grid-cols-2 divide-y divide-gray-100 text-sm sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wider text-gray-400">Format</dt>
                <dd className="mt-1 font-medium text-gray-900 uppercase">{activeExport.export_format}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wider text-gray-400">Completed</dt>
                <dd className="mt-1 font-medium text-gray-900">{formatDate(activeExport.completed_at)}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wider text-gray-400">Expires</dt>
                <dd className="mt-1 font-medium text-gray-900">{formatDate(activeExport.expires_at)}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wider text-gray-400">Sections</dt>
                <dd className="mt-1 font-medium text-gray-900">{activeExport.metadata?.section_count ?? '—'}</dd>
              </div>
            </dl>

            {activeExport.failure_reason && (
              <div className="mx-4 mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {activeExport.failure_reason}
              </div>
            )}

            {activeExport.status === 'ready' && activeExport.download_url && (
              <div className="border-t border-gray-100 px-4 py-3">
                <a
                  href={normalizeDownloadUrl(activeExport.download_url)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  Download ZIP
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-3 px-4 py-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50">
              <ShieldCheck className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">No export requested</div>
              <p className="mt-1 text-sm text-gray-500">
                Choose JSON or CSV to assemble your account, project, chat, task, decision, meeting, and related records.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
