import { Clock, Zap, Calendar, Hand } from "lucide-react";
import { TriggerType } from "@/types/agent";
import { cn } from "@/lib/utils";

const TRIGGER_ICONS = {
  polling: Clock,
  instant: Zap,
  scheduled: Calendar,
  manual: Hand,
};

const TRIGGER_COLORS = {
  polling: "text-blue-500",
  instant: "text-amber-500",
  scheduled: "text-indigo-500",
  manual: "text-gray-500",
};

const TRIGGER_LABELS = {
  polling: "Polling",
  instant: "Instant",
  scheduled: "Scheduled",
  manual: "Manual",
};

interface TriggerBadgeProps {
  triggerType: TriggerType;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function TriggerBadge({
  triggerType,
  showLabel = false,
  size = "md",
  className,
}: TriggerBadgeProps) {
  const Icon = TRIGGER_ICONS[triggerType];
  const color = TRIGGER_COLORS[triggerType];
  const label = TRIGGER_LABELS[triggerType];

  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Icon className={cn(sizeClasses[size], color)} />
      {showLabel && (
        <span className="text-xs capitalize text-gray-600 dark:text-gray-400">
          {label}
        </span>
      )}
    </div>
  );
}
