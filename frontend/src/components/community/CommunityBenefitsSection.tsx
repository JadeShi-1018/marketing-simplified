import { COMMUNITY_BENEFITS } from "./communityContent";

export default function CommunityBenefitsSection() {
  return (
    <section
      className="bg-white px-5 py-20 md:px-8 md:py-[88px] lg:py-24"
      aria-labelledby="community-benefits-heading"
    >
      <div className="mx-auto max-w-[1280px] text-center">
        <header className="mx-auto mb-12 max-w-3xl lg:mb-14">
          <h2
            id="community-benefits-heading"
            className="text-[clamp(1.75rem,3vw,2.25rem)] font-bold leading-tight text-[#001220]"
          >
            Why Join Our Community?
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#707070] md:text-lg">
            Discover the benefits of being an active member
          </p>
        </header>

        <ul className="mx-auto grid list-none gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {COMMUNITY_BENEFITS.map((b) => {
            const Icon = b.icon;
            return (
              <li key={b.title} className="flex flex-col items-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E6F9F5]">
                  <Icon className="h-7 w-7 text-[#14B8A6]" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-bold text-[#001220]">{b.title}</h3>
                <p className="mt-3 max-w-[250px] text-sm leading-relaxed text-[#707070]">
                  {b.description}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
