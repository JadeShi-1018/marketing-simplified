'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  X,
  FileText,
  Image as ImageIcon,
  Film,
  Mic,
  MoreVertical,
  Pause,
  Play,
  Captions,
  Loader2,
} from 'lucide-react';
import type { MessageAttachment } from '@/types/chat';
import { transcribeAttachment } from '@/lib/api/attachmentApi';

interface AttachmentDisplayProps {
  attachments: MessageAttachment[];
  isOwnMessage?: boolean;
}

const NUM_WAVEFORM_BARS = 40;
const FALLBACK_WAVEFORM_BARS = Array.from({ length: NUM_WAVEFORM_BARS }, (_, i) =>
  20 + Math.round(Math.abs(Math.sin(i * 0.6 + 1.2)) * 55),
);
const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;

/**
 * Decodes the audio at `url` using the Web Audio API and returns an array of
 * `numBars` RMS-amplitude values normalised to the range [minPct, maxPct].
 * Falls back to `FALLBACK_WAVEFORM_BARS` on any error.
 */
async function buildWaveformBars(
  url: string,
  numBars = NUM_WAVEFORM_BARS,
  minPct = 15,
  maxPct = 90,
): Promise<number[]> {
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`fetch ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();

    const audioCtx = new (window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();

    // Mix all channels down to a single set of samples.
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const samplesPerBar = Math.max(1, Math.floor(length / numBars));

    const bars: number[] = [];
    for (let b = 0; b < numBars; b++) {
      const start = b * samplesPerBar;
      const end = Math.min(start + samplesPerBar, length);
      let sumSq = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const data = audioBuffer.getChannelData(ch);
        for (let s = start; s < end; s++) {
          sumSq += data[s] * data[s];
        }
      }
      bars.push(Math.sqrt(sumSq / ((end - start) * numChannels)));
    }

    // Normalise to [minPct, maxPct].
    const maxVal = Math.max(...bars, 1e-6);
    const minVal = Math.min(...bars);
    const range = maxVal - minVal || 1;
    return bars.map((v) => Math.round(minPct + ((v - minVal) / range) * (maxPct - minPct)));
  } catch {
    return FALLBACK_WAVEFORM_BARS;
  }
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function VoiceMessagePlayer({
  attachment,
  onDownload,
}: {
  attachment: MessageAttachment;
  onDownload: (attachment: MessageAttachment) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const transcriptPanelRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1);
  const [showMenu, setShowMenu] = useState(false);

  // Close the ⋮ menu when clicking outside it.
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);
  const [waveformBars, setWaveformBars] = useState<number[]>(FALLBACK_WAVEFORM_BARS);

  // Transcript: seed from attachment.transcript (cached server-side), then allow on-demand generation.
  const [transcript, setTranscript] = useState<string | null>(attachment.transcript ?? null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  // Scroll the transcript panel into view whenever it becomes visible.
  useEffect(() => {
    if (transcriptOpen) {
      // rAF gives the browser one frame to paint the panel before we scroll.
      const id = requestAnimationFrame(() => {
        transcriptPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      return () => cancelAnimationFrame(id);
    }
  }, [transcriptOpen]);

  // Generate the real waveform from the audio file once per URL.
  useEffect(() => {
    let cancelled = false;
    buildWaveformBars(attachment.file_url).then((bars) => {
      if (!cancelled) setWaveformBars(bars);
    });
    return () => { cancelled = true; };
  }, [attachment.file_url]);

  const handleTranscript = async () => {
    // If we already have one, just toggle visibility.
    if (transcript !== null) {
      setTranscriptOpen((prev) => !prev);
      return;
    }
    // Generate for the first time.
    setTranscriptOpen(true);
    setTranscriptLoading(true);
    setTranscriptError(null);
    try {
      const text = await transcribeAttachment(attachment.id);
      setTranscript(text);
    } catch {
      setTranscriptError('Could not generate transcript. Please try again.');
    } finally {
      setTranscriptLoading(false);
    }
  };

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const playedBars = Math.round(progress * waveformBars.length);

  // At rest show total duration; once playing/scrubbed show current position.
  const displayTime =
    isPlaying || currentTime > 0
      ? formatAudioTime(currentTime)
      : formatAudioTime(duration);

  const captureDuration = (el: HTMLAudioElement) => {
    const d = el.duration;
    if (Number.isFinite(d) && d > 0) setDuration(d);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        audio.playbackRate = playbackRate;
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
    }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const cyclePlaybackRate = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate);
    const nextRate = PLAYBACK_SPEEDS[(currentIndex + 1) % PLAYBACK_SPEEDS.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const copyAudioLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard?.writeText(attachment.file_url);
      setShowMenu(false);
    } catch {
      window.open(attachment.file_url, '_blank');
    }
  };

  return (
    <div className="w-full min-w-0 max-w-lg rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 px-3 py-3">
        <audio
          ref={audioRef}
          src={attachment.file_url}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => captureDuration(e.currentTarget)}
          onDurationChange={(e) => captureDuration(e.currentTarget)}
          className="hidden"
        >
          Your browser does not support the audio tag.
        </audio>

        <button
          type="button"
          onClick={togglePlayback}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25A9E0] text-white shadow-sm transition hover:bg-[#168EBC]"
          aria-label={isPlaying ? 'Pause audio clip' : 'Play audio clip'}
          title={isPlaying ? 'Pause audio clip' : 'Play audio clip'}
        >
          {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
        </button>

        {/* Waveform — click anywhere to seek */}
        <div
          role="slider"
          aria-label="Audio progress"
          aria-valuemin={0}
          aria-valuemax={duration || 1}
          aria-valuenow={currentTime}
          tabIndex={0}
          className="flex h-12 min-w-0 flex-1 cursor-pointer items-center gap-1"
          onClick={handleWaveformClick}
          onKeyDown={(e) => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            if (e.key === 'ArrowRight') audio.currentTime = Math.min(duration, currentTime + 5);
            if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, currentTime - 5);
          }}
        >
          {waveformBars.map((height, index) => (
            <span
              key={index}
              className={[
                'w-1 shrink-0 rounded-full transition-colors',
                index < playedBars ? 'bg-[#25A9E0]' : 'bg-gray-300',
              ].join(' ')}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>

        <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-700">
          {displayTime}
        </span>

        <button
          type="button"
          onClick={cyclePlaybackRate}
          className="shrink-0 rounded-md px-1.5 py-1 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          aria-label="Change playback speed"
          title="Change playback speed"
        >
          {playbackRate}x
        </button>

        {/* Transcript button */}
        <button
          type="button"
          onClick={handleTranscript}
          disabled={transcriptLoading}
          className={[
            'shrink-0 rounded-md p-1.5 transition',
            transcriptOpen
              ? 'bg-sky-50 text-sky-600 hover:bg-sky-100'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800',
            transcriptLoading ? 'cursor-wait opacity-60' : '',
          ].join(' ')}
          aria-label="Generate transcript"
          title="Generate transcript"
        >
          {transcriptLoading
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <Captions className="h-5 w-5" />}
        </button>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowMenu((prev) => !prev)}
            className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
            aria-label="Audio clip actions"
            title="Audio clip actions"
          >
            <MoreVertical className="h-5 w-5" />
          </button>

          {showMenu && (
            <div className="absolute bottom-full left-0 z-20 mb-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  onDownload(attachment);
                  setShowMenu(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Download
              </button>
              <button
                type="button"
                onClick={copyAudioLink}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Copy link to audio clip
              </button>
              <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
                {attachment.file_size_display}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transcript panel */}
      {transcriptOpen && (
        <div ref={transcriptPanelRef} className="border-t border-gray-100 px-4 py-3">
          {transcriptLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating transcript…
            </div>
          ) : transcriptError ? (
            <p className="text-sm text-red-500">{transcriptError}</p>
          ) : transcript ? (
            <p className="text-sm leading-relaxed text-gray-700">{transcript}</p>
          ) : (
            <p className="text-sm italic text-gray-400">No speech detected.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AttachmentDisplay({
  attachments,
  isOwnMessage = false,
}: AttachmentDisplayProps) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const isAudioAttachment = (attachment: MessageAttachment) =>
    attachment.mime_type?.toLowerCase().startsWith('audio/');

  const isVideoAttachment = (attachment: MessageAttachment) =>
    attachment.file_type === 'video' || attachment.mime_type?.toLowerCase().startsWith('video/');

  const handleDownload = async (attachment: MessageAttachment) => {
    try {
      const response = await fetch(attachment.file_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.original_filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: open in new tab
      window.open(attachment.file_url, '_blank');
    }
  };

  const renderAttachment = (attachment: MessageAttachment) => {
    if (isAudioAttachment(attachment)) {
      return (
        <VoiceMessagePlayer
          key={attachment.id}
          attachment={attachment}
          onDownload={handleDownload}
        />
      );
    }

    if (isVideoAttachment(attachment)) {
      return (
        <div key={attachment.id} className="w-full max-w-md">
          <video
            src={attachment.file_url}
            controls
            className="max-h-80 w-full rounded-lg bg-black shadow-sm"
            preload="metadata"
          >
            Your browser does not support the video tag.
          </video>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500">
            <span className="min-w-0 truncate">{attachment.original_filename}</span>
            <button
              onClick={() => handleDownload(attachment)}
              className="shrink-0 rounded px-1.5 py-0.5 text-gray-600 transition-colors hover:bg-gray-100"
              aria-label="Download video"
              title="Download video"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      );
    }

    switch (attachment.file_type) {
      case 'image':
        return (
          <div 
            key={attachment.id}
            className="relative group cursor-pointer"
            onClick={() => setLightboxImage(attachment.file_url)}
          >
            <img
              src={attachment.file_url}
              alt={attachment.original_filename}
              className="max-w-full max-h-64 rounded-lg object-cover shadow-sm"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded-lg flex items-center justify-center">
              <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        );

      case 'document':
      default:
        return (
          <div
            key={attachment.id}
            className={`flex w-full min-w-0 max-w-full items-center gap-2 rounded-lg border p-3 sm:gap-3 ${
              isOwnMessage 
                ? 'bg-[#3CCED7] border-[#3CCED7]' 
                : 'bg-gray-100 border-gray-200'
            }`}
          >
            <div className={`p-2 rounded-lg ${
              isOwnMessage ? 'bg-[#3CCED7]' : 'bg-gray-200'
            }`}>
              <FileText className={`w-5 h-5 ${
                isOwnMessage ? 'text-white' : 'text-gray-600'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${
                isOwnMessage ? 'text-white' : 'text-gray-800'
              }`}>
                {attachment.original_filename}
              </p>
              <p className={`text-xs ${
                isOwnMessage ? 'text-blue-100' : 'text-gray-500'
              }`}>
                {attachment.file_size_display}
              </p>
            </div>
            <button
              onClick={() => handleDownload(attachment)}
              className={`shrink-0 rounded-lg p-2 transition-colors ${
                isOwnMessage 
                  ? 'hover:bg-[#3CCED7] text-white' 
                  : 'hover:bg-gray-200 text-gray-600'
              }`}
              aria-label="Download file"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        );
    }
  };

  return (
    <>
      <div className="mt-2 flex w-full min-w-0 max-w-full flex-col gap-2">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            data-attachment-id={attachment.id}
            className="w-full min-w-0"
          >
            {renderAttachment(attachment)}
          </div>
        ))}
      </div>

      {/* Lightbox for images */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black bg-opacity-90 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
            onClick={() => setLightboxImage(null)}
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImage}
            alt="Full size"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// Compact version for chat list preview
export function AttachmentPreview({ attachments }: { attachments?: MessageAttachment[] }) {
  if (!attachments || attachments.length === 0) return null;

  const firstAttachment = attachments[0];
  const count = attachments.length;

  const getIcon = () => {
    if (firstAttachment.mime_type?.toLowerCase().startsWith('audio/')) {
      return <Mic className="w-3 h-3" />;
    }
    switch (firstAttachment.file_type) {
      case 'image':
        return <ImageIcon className="w-3 h-3" />;
      case 'video':
        return <Film className="w-3 h-3" />;
      default:
        return <FileText className="w-3 h-3" />;
    }
  };

  return (
    <span className="inline-flex items-center gap-1 text-gray-500">
      {getIcon()}
      <span className="text-xs">
        {count === 1 
          ? firstAttachment.original_filename 
          : `${count} attachments`}
      </span>
    </span>
  );
}
