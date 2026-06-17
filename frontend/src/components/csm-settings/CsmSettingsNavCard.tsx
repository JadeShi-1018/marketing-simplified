'use client';

import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';

interface Props {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function CsmSettingsNavCard({ href, icon: Icon, title, description }: Props) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-colors hover:border-[#86E9A8]"
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-gray-500 group-hover:text-gray-600" aria-hidden />
        <span className="text-base font-semibold text-gray-900">{title}</span>
        <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-gray-400" aria-hidden />
      </div>
      <p className="text-sm leading-5 text-gray-500">{description}</p>
    </Link>
  );
}
