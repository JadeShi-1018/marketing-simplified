import { Search, Users } from "lucide-react";

const STATS = [
  { value: "35k", label: "Community Members" },
  { value: "912k", label: "Forum members" },
  { value: "16.6k", label: "Questions resolved" },
];

function HeroOrbitGraphic() {
  const badges = [
    { id: "orbit-tr", style: "top-[8%] left-[52%]" },
    { id: "orbit-br", style: "top-[42%] right-[6%]" },
    { id: "orbit-bl", style: "bottom-[18%] right-[28%]" },
    { id: "orbit-l", style: "bottom-[22%] left-[12%]" },
  ];

  return (
    <div className="relative mx-auto h-[260px] w-full max-w-[420px] sm:h-[300px] sm:max-w-[480px] lg:h-[340px]">
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="h-36 w-36 rounded-full bg-[#7CFC00] shadow-[0_0_60px_rgba(124,252,0,0.55),0_0_120px_rgba(124,252,0,0.25)] sm:h-44 sm:w-44"
          aria-hidden
        />
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <div
          className="h-[78%] w-[78%] rounded-full border-[3px] border-white/45 shadow-[0_0_40px_rgba(255,255,255,0.35)] sm:border-[4px]"
          style={{ transform: "rotate(-18deg)" }}
        />
      </div>
      <div className="absolute inset-0" aria-hidden>
        {badges.map((b) => (
          <div
            key={b.id}
            className={`absolute flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md ring-2 ring-white/70 sm:h-11 sm:w-11 ${b.style}`}
          >
            <Users className="h-5 w-5 text-[#0D9488]" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CommunityHeroSection() {
  return (
    <section
      className="bg-[linear-gradient(90deg,#12A68C_0%,#0096C7_100%)] px-6 py-16 text-white md:px-12 md:py-20 lg:px-[80px] lg:py-[96px]"
      aria-labelledby="community-hero-heading"
    >
      <div className="mx-auto flex max-w-[1280px] flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
        <div className="min-w-0 flex-1 lg:max-w-[55%]">
          <h1
            id="community-hero-heading"
            className="max-w-xl text-[clamp(2.25rem,4vw,3.5rem)] font-bold leading-[1.1] [text-shadow:0_1px_2px_rgba(0,0,0,0.15)]"
          >
            Join the Marketing Simplified Community
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white md:text-xl lg:mt-6">
            Discover best practices, ask questions and share advice.
          </p>

          <form role="search" className="mt-10 max-w-[560px] lg:mt-10">
            <label htmlFor="community-hero-search" className="sr-only">
              Search community
            </label>
            <div className="relative flex h-[52px] w-[90%] max-w-full items-center rounded-full bg-white pl-5 pr-2 shadow-sm ring-2 ring-transparent transition-[box-shadow,color] focus-within:ring-[#86EFAC] md:w-[80%]">
              <Search className="h-5 w-5 shrink-0 text-[#A9A9A9]" aria-hidden />
              <input
                id="community-hero-search"
                type="search"
                name="q"
                placeholder="Search"
                autoComplete="off"
                className="placeholder-[#A9A9A9] h-full min-w-0 flex-1 rounded-full border-0 bg-transparent px-3 text-[#1A202C] outline-none ring-0 focus:ring-0 focus-visible:outline-none"
              />
            </div>
          </form>

          <dl className="mt-12 flex flex-wrap gap-x-10 gap-y-8 lg:mt-14">
            {STATS.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="flex flex-col gap-1">
                  <span className="text-[clamp(1.75rem,3vw,2.25rem)] font-bold leading-none tabular-nums">
                    {s.value}
                  </span>
                  <span className="text-sm font-normal leading-snug text-white/95">{s.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative flex flex-1 justify-center lg:justify-end" aria-hidden="true">
          <HeroOrbitGraphic />
        </div>
      </div>
    </section>
  );
}
