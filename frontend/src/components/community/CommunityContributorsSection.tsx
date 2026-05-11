import Image from "next/image";

import { COMMUNITY_CONTRIBUTORS } from "./communityContent";

export default function CommunityContributorsSection() {
  return (
    <section
      className="bg-gradient-to-b from-[#FAFDF9] to-white px-6 py-16 md:px-8 md:py-20 lg:py-[80px]"
      aria-labelledby="community-contributors-heading"
    >
      <div className="bg-gradient-to-b from-[#FAFDF9] to-white mx-auto max-w-[1280px]">
        <header className="mb-10 lg:mb-12">
          <h2
            id="community-contributors-heading"
            className="text-[clamp(1.75rem,3vw,2.25rem)] font-bold leading-tight text-[#1A202C]"
          >
            Top Contributors
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#718096] md:text-lg">
            Meet the experts helping our community thrive
          </p>
        </header>

        <ul className="grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {COMMUNITY_CONTRIBUTORS.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                aria-label={`${c.name}, ${c.role}. ${c.badge}`}
                className={[
                  "group flex h-full w-full cursor-default flex-col items-center rounded-[10px] border-2 border-transparent bg-white px-6 pb-8 pt-8 text-center font-inherit text-inherit shadow-sm outline-none transition-[box-shadow,border-color] duration-200 motion-reduce:transition-none",
                  "hover:border-[#86EFAC] hover:shadow-md",
                  "focus-visible:ring-2 focus-visible:ring-[#86EFAC] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8FAFC]",
                  c.featured ? "shadow-md" : "",
                ].join(" ")}
              >
                <div
                  className={[
                    "relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-full ring-4 ring-[#86EFAC]/30 transition-shadow duration-200 motion-reduce:transition-none",
                    c.featured ? "ring-[#319795]/35" : "",
                    "group-hover:ring-[#86EFAC]",
                    "group-focus-visible:ring-[#86EFAC]",
                  ].join(" ")}
                  aria-hidden
                >
                  <Image
                    src={c.avatarSrc}
                    alt=""
                    width={84}
                    height={84}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span className="mt-4 rounded-full bg-[#E6FFFA] px-3 py-1 text-xs font-semibold text-[#319795]">
                  {c.badge}
                </span>
                <h3 className="mt-3 text-lg font-bold text-[#1A202C]">{c.name}</h3>
                <p className="mt-1 text-sm text-[#718096]">{c.role}</p>
                <dl className="mt-6 grid w-full grid-cols-2 gap-4 border-t border-[#E2E8F0] pt-6">
                  <div>
                    <dt className="sr-only">Posts</dt>
                    <dd className="flex flex-col gap-0.5">
                      <span className="text-lg font-bold tabular-nums text-[#1A202C]">{c.posts}</span>
                      <span className="text-xs uppercase tracking-wide text-[#718096]">Posts</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">Solutions</dt>
                    <dd className="flex flex-col gap-0.5">
                      <span className="text-lg font-bold tabular-nums text-[#1A202C]">
                        {c.solutions}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-[#718096]">
                        Solutions
                      </span>
                    </dd>
                  </div>
                </dl>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
