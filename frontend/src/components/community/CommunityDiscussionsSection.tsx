import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";

import { COMMUNITY_DISCUSSIONS } from "./communityContent";

export default function CommunityDiscussionsSection() {
  return (
    <section
      className="bg-white px-6 py-16 md:px-8 md:py-20 lg:py-[80px]"
      aria-labelledby="community-discussions-heading"
    >
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between lg:mb-9">
          <header>
            <h2
              id="community-discussions-heading"
              className="text-[clamp(1.75rem,3vw,2.25rem)] font-bold leading-tight text-[#0F172A]"
            >
              Recent Discussions
            </h2>
            <p className="mt-2 max-w-xl text-base leading-relaxed text-[#475569] md:text-lg">
              Join the conversation and connect with the community
            </p>
          </header>
          <Link
            href="/help-center"
            className="inline-flex shrink-0 items-center gap-1 text-base font-semibold text-[#0D9488] transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D9488]"
          >
            View All
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[#D1FAE5] bg-[#F7FFFB] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <ul className="divide-y divide-[#DCFCE7]">
            {COMMUNITY_DISCUSSIONS.map((row) => (
              <li key={row.id}>
                <article className="transition-colors duration-200 ease-out hover:bg-white motion-reduce:transition-none">
                  <Link
                    href={`/help-center#discussion-${row.id}`}
                    className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8 md:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-[19px] font-bold leading-snug text-[#0F172A]">
                          {row.title}
                        </h3>
                        {row.solved ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#10B981]">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Solved
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-[#475569]">
                        <span>by {row.author}</span>
                        <span className="text-[#A3A3A3]" aria-hidden>
                          &#8226;
                        </span>
                        <span className="font-semibold text-[#0D9488]">{row.category}</span>
                        <span className="text-[#A3A3A3]" aria-hidden>
                          &#8226;
                        </span>
                        <span>{row.time}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-8 sm:justify-end">
                      <div className="text-center sm:text-right">
                        <p className="text-xl font-bold tabular-nums leading-none text-[#0F172A]">
                          {row.replies}
                        </p>
                        <p className="mt-1 text-xs text-[#64748B]">replies</p>
                      </div>
                      <div className="text-center sm:text-right">
                        <p className="text-xl font-bold tabular-nums leading-none text-[#0F172A]">
                          {row.views}
                        </p>
                        <p className="mt-1 text-xs text-[#64748B]">views</p>
                      </div>
                    </div>
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
