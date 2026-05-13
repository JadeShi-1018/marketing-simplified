import type { LucideIcon } from "lucide-react";
import {
  Award,
  Bell,
  BookOpen,
  Flag,
  Heart,
  HelpCircle,
  Lightbulb,
  LineChart,
  MessageCircle,
  Star,
  TrendingUp,
} from "lucide-react";

export type TopicCard = {
  slug: string;
  title: string;
  description: string;
  topics: string;
  posts: string;
  icon: LucideIcon;
  iconClassName: string;
  trayClassName: string;
  featured?: boolean;
};

export const COMMUNITY_TOPICS: TopicCard[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "New to marketing? Start here to learn the basics and get oriented.",
    topics: "342",
    posts: "1.2k",
    icon: BookOpen,
    iconClassName: "text-emerald-600",
    trayClassName: "bg-emerald-50",
    featured: true,
  },
  {
    slug: "best-practices",
    title: "Best Practices",
    description: "Learn from experts and discover proven marketing strategies.",
    topics: "1205",
    posts: "4.5k",
    icon: Star,
    iconClassName: "text-teal-600",
    trayClassName: "bg-teal-50",
  },
  {
    slug: "tips-tricks",
    title: "Tips & Tricks",
    description: "Marketing hacks and hidden strategies shared by experts.",
    topics: "867",
    posts: "3.2k",
    icon: Lightbulb,
    iconClassName: "text-cyan-600",
    trayClassName: "bg-cyan-50",
  },
  {
    slug: "product-updates",
    title: "Product Updates",
    description: "Stay informed about new features and improvements.",
    topics: "234",
    posts: "1.8k",
    icon: Bell,
    iconClassName: "text-lime-600",
    trayClassName: "bg-lime-50",
  },
  {
    slug: "integrations",
    title: "Integrations",
    description: "Connect your marketing tools and streamline workflows.",
    topics: "456",
    posts: "2.1k",
    icon: TrendingUp,
    iconClassName: "text-teal-700",
    trayClassName: "bg-teal-50/80",
  },
  {
    slug: "workflows",
    title: "Workflows",
    description: "Optimize your marketing processes and campaigns.",
    topics: "678",
    posts: "3.7k",
    icon: Flag,
    iconClassName: "text-emerald-700",
    trayClassName: "bg-emerald-50/70",
  },
  {
    slug: "help-support",
    title: "Help & Support",
    description: "Get assistance with technical issues and questions.",
    topics: "534",
    posts: "5.2k",
    icon: HelpCircle,
    iconClassName: "text-blue-600",
    trayClassName: "bg-blue-50",
  },
  {
    slug: "success-stories",
    title: "Success Stories",
    description: "Real examples of how teams achieve marketing success.",
    topics: "189",
    posts: "890",
    icon: Heart,
    iconClassName: "text-lime-700",
    trayClassName: "bg-lime-50/80",
  },
];

export type DiscussionRow = {
  id: string;
  title: string;
  author: string;
  category: string;
  time: string;
  replies: number;
  views: number;
  solved?: boolean;
};

export const COMMUNITY_DISCUSSIONS: DiscussionRow[] = [
  {
    id: "1",
    title: "How to automate email marketing campaigns effectively?",
    author: "Jordan Lee",
    category: "Best Practices",
    time: "2 hours ago",
    replies: 24,
    views: 1834,
    solved: true,
  },
  {
    id: "2",
    title: "Best integrations for syncing CRM data with ad platforms?",
    author: "Sam Rivera",
    category: "Integrations",
    time: "5 hours ago",
    replies: 17,
    views: 942,
  },
  {
    id: "3",
    title: "Workflow templates for seasonal campaign launches?",
    author: "Taylor Morgan",
    category: "Workflows",
    time: "1 day ago",
    replies: 31,
    views: 2103,
    solved: true,
  },
  {
    id: "4",
    title: "Tips for improving landing page conversion rates?",
    author: "Casey Nguyen",
    category: "Tips & Tricks",
    time: "2 days ago",
    replies: 42,
    views: 3567,
  },
];

export type ContributorCard = {
  id: string;
  name: string;
  role: string;
  badge: string;
  posts: number;
  solutions: number;
  /** Path under `public/` (e.g. `/avatars/person-1.jpg`). */
  avatarSrc: string;
  featured?: boolean;
};

export const COMMUNITY_CONTRIBUTORS: ContributorCard[] = [
  {
    id: "1",
    name: "Sarah Chen",
    role: "Marketing Expert",
    badge: "Top Contributor",
    posts: 1243,
    solutions: 342,
    avatarSrc: "/avatars/person-1.jpg",
    featured: true,
  },
  {
    id: "2",
    name: "Marcus Johnson",
    role: "Community Expert",
    badge: "Solution Master",
    posts: 987,
    solutions: 276,
    avatarSrc: "/avatars/person-2.jpg",
  },
  {
    id: "3",
    name: "Aisha Patel",
    role: "Marketing Specialist",
    badge: "Most Helpful",
    posts: 1567,
    solutions: 423,
    avatarSrc: "/avatars/person-3.jpg",
  },
  {
    id: "4",
    name: "David Kim",
    role: "Community Leader",
    badge: "Expert",
    posts: 2134,
    solutions: 589,
    avatarSrc: "/avatars/person-4.jpg",
  },
];

export type BenefitColumn = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export const COMMUNITY_BENEFITS: BenefitColumn[] = [
  {
    title: "Get Expert Help",
    description:
      "Ask questions and receive answers from experienced marketers and community experts.",
    icon: MessageCircle,
  },
  {
    title: "Share Knowledge",
    description: "Contribute your expertise and help others succeed with their marketing goals.",
    icon: Heart,
  },
  {
    title: "Earn Recognition",
    description: "Build your reputation and earn badges as a valued community contributor.",
    icon: Award,
  },
  {
    title: "Stay Updated",
    description:
      "Be the first to know about new marketing trends, tools, and community events.",
    icon: LineChart,
  },
];
