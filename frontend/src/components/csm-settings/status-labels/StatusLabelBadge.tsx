'use client';

/**
 * Premium "soft pill" status-label badge: a faint tint of the label color as the
 * background, the color itself as the text, and a small solid dot. Shared across
 * the settings list, customer table, and the conversation profile panel so the
 * label looks identical everywhere.
 */
interface StatusLabelBadgeProps {
  name: string;
  /** Hex color, e.g. "#1D4ED8". */
  color: string;
  className?: string;
}

export default function StatusLabelBadge({ name, color, className = '' }: StatusLabelBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
      style={{
        // Subtle diagonal gradient (top-left → bottom-right), echoing the product's
        // gradient buttons. Two tints of the label color: ~8% → ~18% alpha.
        backgroundImage: `linear-gradient(135deg, ${color}14, ${color}2E)`,
        color,
        // Faint same-color ring for a crisp, premium edge.
        boxShadow: `inset 0 0 0 1px ${color}24`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {name}
    </span>
  );
}
