'use client';

interface Props {
  message?: string | null;
}

export default function FormFieldError({ message }: Props) {
  if (!message) return null;
  return <p className="text-xs text-red-600 mt-1">{message}</p>;
}
