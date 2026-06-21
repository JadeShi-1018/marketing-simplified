'use client';

interface TokenEstimatorProps {
  message: string;
}

const CHARS_PER_TOKEN = 4;

export default function TokenEstimator({ message }: TokenEstimatorProps) {
  if (message.length <= 20) return null;

  const estimated = Math.ceil(message.length / CHARS_PER_TOKEN);

  return (
    <p className="mt-1 text-right text-xs text-muted-foreground">
      ~{estimated.toLocaleString()} tokens
    </p>
  );
}
