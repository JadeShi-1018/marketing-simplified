import Link from "next/link";

import { COMMUNITY_TOPICS } from "./communityContent";

export default function CommunityTopicsSection() {
  return (
    <section
      id="topics"
      className="bg-gradient-to-b from-white to-[#FAFDF9] px-6 py-16 md:px-8 md:py-20 lg:py-[80px]"
      aria-labelledby="community-topics-heading"
    >
      <div className="mx-auto max-w-[1280px]">
        <header className="mb-10 lg:mb-11">
          <h2
            id="community-topics-heading"
            className="text-[clamp(1.75rem,3vw,2.25rem)] font-bold leading-tight text-[#1A202C]"
          >
            Explore Topics
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#718096] md:text-lg">
            Browse popular categories and find answers to your questions
          </p>
        </header>

        <ul className="grid list-none gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {COMMUNITY_TOPICS.map((topic) => {
            const Icon = topic.icon;
            const featured = topic.featured;
            return (
              <li key={topic.slug}>
                <Link
                  href={`/help-center#${topic.slug}`}
                  className={[
                    "group flex h-full flex-col rounded-[10px] border-2 border-[#F1F5F9] bg-white p-6 shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-out motion-reduce:transition-none",
                    "hover:-translate-y-0.5 hover:border-[#86EFAC] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0D9488]",
                    featured ? "shadow-md" : "",
                  ].join(" ")}
                >
                  <span
                    className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg ${topic.trayClassName}`}
                  >
                    <Icon className={`h-5 w-5 ${topic.iconClassName}`} aria-hidden />
                  </span>
                  <span
                    className={`text-lg font-semibold leading-snug ${
                      featured ? "text-emerald-600" : "text-[#1A202C]"
                    }`}
                  >
                    {topic.title}
                  </span>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[#718096]">
                    {topic.description}
                  </p>
                  <div className="mt-5 flex items-center justify-between text-xs text-[#718096]">
                    <span>{topic.topics} topics</span>
                    <span>{topic.posts} posts</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
