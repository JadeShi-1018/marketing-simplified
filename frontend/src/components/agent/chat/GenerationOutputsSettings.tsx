'use client';

import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { GenerationOutputKey } from '@/types/agent';
import { GENERATION_OUTPUT_CATALOG } from '@/lib/generationOutputs';
import { useGenerationOutputs } from '@/hooks/useGenerationOutputs';
import { cn } from '@/lib/utils';

interface GenerationOutputsSettingsProps {
  disabled?: boolean;
  className?: string;
}

export function GenerationOutputsSettings({
  disabled,
  className,
}: GenerationOutputsSettingsProps) {
  const { selected, applySelection } = useGenerationOutputs();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<GenerationOutputKey[]>(selected);

  useEffect(() => {
    if (open) setDraft(selected);
  }, [open, selected]);

  const toggle = (key: GenerationOutputKey) => {
    setDraft((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleApply = () => {
    if (draft.length === 0) return;
    applySelection(draft);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50',
            className
          )}
          title="Generation outputs"
          aria-label="Generation outputs settings"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3"
        align="end"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium text-foreground">Generation outputs</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Choose what to generate when you upload a file.
        </p>
        <ul className="mt-3 space-y-2">
          {GENERATION_OUTPUT_CATALOG.map((item) => (
            <li key={item.key}>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={draft.includes(item.key)}
                  onChange={() => toggle(item.key)}
                />
                <span>
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {draft.length === 0 && (
          <p className="mt-2 text-xs text-destructive">Select at least one output.</p>
        )}
        <Button
          type="button"
          size="sm"
          className="mt-3 w-full"
          disabled={draft.length === 0}
          onClick={handleApply}
        >
          Apply
        </Button>
      </PopoverContent>
    </Popover>
  );
}
