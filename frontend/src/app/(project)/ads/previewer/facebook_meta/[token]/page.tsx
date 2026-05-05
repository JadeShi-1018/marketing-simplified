'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getPublicPreview, AdCreativeData } from '@/lib/api/publicPreviewApi';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/authStore';
import HeaderSection from '@/components/home/HeaderSection';
import FacebookFeedPreview from '@/components/facebook_meta/previews/FacebookFeedPreview';
import InstagramFeedPreview from '@/components/facebook_meta/previews/InstagramFeedPreview';
import FacebookProfileFeedsPreview from '@/components/facebook_meta/previews/FacebookProfileFeedsPreview';
import InstagramProfileFeedPreview from '@/components/facebook_meta/previews/InstagramProfileFeedPreview';
import FacebookStoriesPreview from '@/components/facebook_meta/previews/FacebookStoriesPreview';
import FacebookReelsPreview from '@/components/facebook_meta/previews/FacebookReelsPreview';
import InstagramReelsPreview from '@/components/facebook_meta/previews/InstagramReelsPreview';
import AdsOnFacebookReelsPreview from '@/components/facebook_meta/previews/AdsOnFacebookReelsPreview';
import FacebookMarketplacePreview from '@/components/facebook_meta/previews/FacebookMarketplacePreview';
import InstagramExplorePreview from '@/components/facebook_meta/previews/InstagramExplorePreview';

interface MediaFile {
    id: number;
    type: 'photo' | 'video';
    thumbnail?: string;
    caption?: string;
    url?: string;
}

export default function PublicPreviewPage() {
    const params = useParams();
    const token = params?.token as string;
    const { initialized, isAuthenticated, user } = useAuthStore();

    const [adCreative, setAdCreative] = useState<AdCreativeData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    useEffect(() => {
        const fetchPreviewData = async () => {
            if (!token) return;

            try {
                setLoading(true);

                // Fetch ad creative data (includes photo_data and video_data in object_story_spec)
                const adCreativeData = await getPublicPreview(token);
                setAdCreative(adCreativeData);

            } catch (err: any) {
                console.error('Error fetching preview:', err);
                setError(err.response?.data?.error || err.message || 'Failed to load preview');
            } finally {
                setLoading(false);
            }
        };

        fetchPreviewData();
    }, [token]);

    // Extract media from object_story_spec (photo_data and video_data)
    const getMediaFiles = (): MediaFile[] => {
        if (!adCreative?.object_story_spec) return [];

        const media: MediaFile[] = [];
        let idCounter = 1;

        // Extract photos from photo_data
        if (adCreative.object_story_spec.photo_data) {
            const photoData = Array.isArray(adCreative.object_story_spec.photo_data)
                ? adCreative.object_story_spec.photo_data
                : [adCreative.object_story_spec.photo_data];

            photoData.forEach((photo: any) => {
                if (photo) {
                    const photoUrl = photo.url?.startsWith('http')
                        ? photo.url
                        : photo.url?.startsWith('/')
                            ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${photo.url}`
                            : photo.url;

                    if (photoUrl) {
                        media.push({
                            id: idCounter++,
                            type: 'photo',
                            url: photoUrl,
                            caption: photo.caption || '',
                            thumbnail: photoUrl,
                        });
                    }
                }
            });
        }

        // Extract videos from video_data
        if (adCreative.object_story_spec.video_data) {
            const videoData = Array.isArray(adCreative.object_story_spec.video_data)
                ? adCreative.object_story_spec.video_data
                : [adCreative.object_story_spec.video_data];

            videoData.forEach((video: any) => {
                if (video) {
                    const videoUrl = (video.image_url || video.url)?.startsWith('http')
                        ? (video.image_url || video.url)
                        : (video.image_url || video.url)?.startsWith('/')
                            ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${video.image_url || video.url}`
                            : (video.image_url || video.url);

                    const thumbnailUrl = video.thumbnail?.startsWith('http')
                        ? video.thumbnail
                        : video.thumbnail?.startsWith('/')
                            ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${video.thumbnail}`
                            : video.thumbnail;

                    if (videoUrl) {
                        media.push({
                            id: idCounter++,
                            type: 'video',
                            url: videoUrl,
                            caption: video.caption || video.title || '',
                            thumbnail: thumbnailUrl || videoUrl,
                        });
                    }
                }
            });
        }

        return media;
    };

    // Extract primary text from object_story_spec
    const getPrimaryText = (): string => {
        if (!adCreative?.object_story_spec) return '';

        const spec = adCreative.object_story_spec;
        return spec.link_data?.message || spec.video_data?.message || '';
    };

    const renderLayout = (content: React.ReactNode) => (
        <div className="min-h-screen bg-gray-50">
            <HeaderSection
                isAuthenticated={isAuthenticated}
                displayName={displayName}
                displayRole={displayRole}
                onLoginClick={handleLoginClick}
                onGetStartedClick={handleGetStartedClick}
                onRedirectToLogin={redirectToLogin}
            />
            <main className="p-4 sm:p-5">
                {content}
            </main>
        </div>
    );

    const mediaFiles = getMediaFiles();
    const primaryText = getPrimaryText();

    if (loading) {
        return renderLayout(
            <div className="flex items-center justify-center py-20">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-[#3CCED7] mx-auto mb-4" />
                    <p className="text-gray-600">Loading preview...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return renderLayout(
            <div className="flex items-center justify-center py-20">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Preview Not Available</h1>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <p className="text-sm text-gray-500">
                        This preview may have expired or the link is invalid.
                    </p>
                </div>
            </div>
        );
    }

    if (!adCreative || mediaFiles.length === 0) {
        return renderLayout(
            <div className="flex items-center justify-center py-20">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Preview Not Available</h1>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <p className="text-sm text-gray-500">
                        Add photos and videos to the ad creative to see the preview.
                    </p>
                </div>
            </div>
        );
    }

    return renderLayout(
        <div className="space-y-4">
            <header className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-gray-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                            Facebook Meta preview
                        </div>
                        <h1 className="mt-1 truncate text-[22px] font-semibold tracking-tight text-gray-900">
                            {adCreative.name}
                        </h1>
                    </div>
                    {adCreative.days_left !== undefined && (
                        <div className="shrink-0 rounded-md bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 ring-1 ring-rose-100">
                            Expires in {adCreative.days_left} {adCreative.days_left === 1 ? 'day' : 'days'}
                        </div>
                    )}
                </div>
            </header>

            <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <div className="space-y-8">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Feeds</h2>
                        <div className="mt-4 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="flex justify-center">
                                <FacebookFeedPreview
                                    mediaToShow={mediaFiles[0]}
                                    primaryText={primaryText}
                                    showHeaderOnHover={false}
                                    scale={75}
                                />
                            </div>
                            <div className="flex justify-center">
                                <FacebookProfileFeedsPreview
                                    mediaToShow={mediaFiles[0]}
                                    primaryText={primaryText}
                                    showHeaderOnHover={false}
                                    scale={75}
                                />
                            </div>
                            <div className="flex justify-center">
                                <InstagramFeedPreview
                                    mediaToShow={mediaFiles[0]}
                                    primaryText={primaryText}
                                    showHeaderOnHover={false}
                                    scale={75}
                                />
                            </div>
                            <div className="flex justify-center">
                                <InstagramProfileFeedPreview
                                    mediaToShow={mediaFiles[0]}
                                    primaryText={primaryText}
                                    showHeaderOnHover={false}
                                    scale={75}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Stories, status, reels</h2>
                        <div className="mt-4 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="flex justify-center">
                                <FacebookStoriesPreview
                                    mediaToShow={mediaFiles[0]}
                                    primaryText={primaryText}
                                    showHeaderOnHover={false}
                                    scale={75}
                                />
                            </div>
                            <div className="flex justify-center">
                                <FacebookReelsPreview
                                    mediaToShow={mediaFiles[0]}
                                    primaryText={primaryText}
                                    showHeaderOnHover={false}
                                    scale={75}
                                />
                            </div>
                            <div className="flex justify-center">
                                <InstagramReelsPreview
                                    mediaToShow={mediaFiles[0]}
                                    primaryText={primaryText}
                                    showHeaderOnHover={false}
                                    scale={75}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">In-stream ads for videos and reels</h2>
                        <div className="mt-4 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="flex justify-center">
                                <AdsOnFacebookReelsPreview
                                    mediaToShow={mediaFiles[0]}
                                    primaryText={primaryText}
                                    showHeaderOnHover={false}
                                    scale={75}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Search results</h2>
                        <div className="mt-4 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="flex justify-center">
                                <FacebookMarketplacePreview
                                    mediaToShow={mediaFiles[0]}
                                    primaryText={primaryText}
                                    showHeaderOnHover={false}
                                    scale={75}
                                />
                            </div>
                            <div className="flex justify-center">
                                <InstagramExplorePreview
                                    mediaToShow={mediaFiles[0]}
                                    primaryText={primaryText}
                                    showHeaderOnHover={false}
                                    scale={75}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
