'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import TiktokPreview from '@/components/tiktok/TiktokPreview';
import { fetchPublicPreview, type TiktokMaterialItem } from '@/lib/api/tiktokApi';
import { useAuthStore } from '@/lib/authStore';
import HeaderSection from '@/components/home/HeaderSection';

type PreviewState = {
  name: string;
  adText: string;
  callToAction: string | null | undefined;
  assets: unknown;
};

function normalizeMaterial(item: any): TiktokMaterialItem | null {
  if (!item) return null;
  const typeStr = String(item.type || '').toLowerCase();
  const type: 'video' | 'image' | null = typeStr.includes('video')
    ? 'video'
    : typeStr.includes('image')
      ? 'image'
      : null;
  if (!type) return null;
  const idNum = typeof item.id === 'number' ? item.id : Number(item.id);
  return {
    id: Number.isNaN(idNum) ? Date.now() : idNum,
    type,
    url: item.url || item.previewUrl || item.preview_url || item.file_url || '',
    previewUrl: item.previewUrl || item.preview_url || item.thumbnail_url,
    fileUrl: item.fileUrl || item.file_url || item.url,
    title: item.name || item.title,
    created_at: item.created_at,
    width: item.width,
    height: item.height,
  };
}

function hydrateAssets(rawAssets: unknown): { primary: TiktokMaterialItem | null; images: TiktokMaterialItem[] } {
  let assets: any = rawAssets;
  if (Array.isArray(assets) && assets.length === 1 && typeof assets[0] === 'object') {
    if (assets[0].primaryCreative || assets[0].images) assets = assets[0];
  }
  if (assets && typeof assets === 'object' && !Array.isArray(assets)) {
    const primary = assets.primaryCreative ? normalizeMaterial(assets.primaryCreative) : null;
    const images = Array.isArray(assets.images)
      ? (assets.images.map(normalizeMaterial).filter(Boolean) as TiktokMaterialItem[])
      : [];
    if (primary?.type === 'video') return { primary, images: [] };
    return { primary: primary ?? images[0] ?? null, images };
  }
  const items = (Array.isArray(assets) ? assets : [])
    .map(normalizeMaterial)
    .filter(Boolean) as TiktokMaterialItem[];
  const primary = items[0] ?? null;
  return {
    primary,
    images: items.filter((item) => item.type === 'image'),
  };
}

function getErrorMessage(error: any) {
  if (error?.response?.status === 410) return 'This preview link has expired.';
  if (error?.response?.status === 404) return 'Preview not found.';
  return 'Failed to load preview.';
}

export default function TikTokPublicPreviewPage() {
  const params = useParams();
  const slug = params?.slug as string | undefined;
  const { initialized, isAuthenticated, user } = useAuthStore();
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const redirectToLogin = () => {
    window.location.href = '/login';
  };

  const handleLoginClick = () => {
    if (!initialized) return;
    if (isAuthenticated) {
      window.location.href = '/profile';
      return;
    }
    window.location.href = '/login';
  };

  const handleGetStartedClick = () => {
    if (!initialized) return;
    if (isAuthenticated) {
      window.location.href = '/tasks';
      return;
    }
    window.location.href = '/login';
  };

  const displayName = user?.username || user?.email || 'User';
  const displayRole = user?.roles?.[0] || 'Member';

  const renderLayout = (content: ReactNode) => (
    <div className="min-h-screen bg-gray-50">
      <HeaderSection
        isAuthenticated={isAuthenticated}
        displayName={displayName}
        displayRole={displayRole}
        onLoginClick={handleLoginClick}
        onGetStartedClick={handleGetStartedClick}
        onRedirectToLogin={redirectToLogin}
      />
      <main className="px-4 py-6">
        {content}
      </main>
    </div>
  );

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      if (!slug) {
        setError('Preview not found.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await fetchPublicPreview(slug);
        if (cancelled) return;
        const snapshot = data?.snapshot_json || {};
        setPreview({
          name: snapshot.name || '',
          adText: snapshot.ad_text || '',
          callToAction: snapshot.call_to_action,
          assets: snapshot.assets,
        });
      } catch (err: any) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const hydrated = useMemo(() => hydrateAssets(preview?.assets), [preview?.assets]);
  const cta = useMemo(() => {
    if (preview?.callToAction === null || typeof preview?.callToAction === 'undefined') {
      return { mode: 'hidden' as const };
    }
    if (preview.callToAction === '') {
      return { mode: 'dynamic' as const };
    }
    return { mode: 'standard' as const, label: preview.callToAction };
  }, [preview?.callToAction]);

  if (loading) {
    return renderLayout(
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#3CCED7] mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return renderLayout(
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900">Preview Not Available</h1>
          <p className="mt-2 text-sm text-gray-600">{error || 'Preview not found.'}</p>
        </div>
      </div>
    );
  }

  return renderLayout(
    <>
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-gray-100">
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            TikTok preview
          </div>
          <h1 className="mt-1 truncate text-[22px] font-semibold tracking-tight text-gray-900">
            {preview.name || 'Shared draft'}
          </h1>
        </header>
        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="flex justify-center">
            <TiktokPreview
              creative={hydrated.primary}
              text={preview.adText}
              cta={cta}
              images={hydrated.images}
              currentImageIndex={currentImageIndex}
              onImageIndexChange={setCurrentImageIndex}
              enablePlacementSwitch
            />
          </div>
        </section>
      </div>
    </>
  );
}
