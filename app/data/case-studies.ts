export type CaseStudy = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  challenge: string;
  solution: string;
  metrics: Array<[string, string]>;
  results: string[];
  images: string[];
};

export const caseStudies: CaseStudy[] = [
  {
    slug: "gameon-forge",
    title: "GameOn Forge",
    category: "Community growth",
    summary:
      "Community-driven gaming platform growth across campaigns, social channels and live programming.",
    challenge:
      "Build a vibrant gaming community and drive adoption for Web3 gaming infrastructure.",
    solution:
      "Targeted Galxe campaigns, community engagement, X Spaces and creator partnerships.",
    metrics: [
      ["Community", "26.3K+"],
      ["Participants", "21,191"],
      ["Spaces listeners", "22,666+"],
      ["Social reach", "94,342"],
    ],
    results: [
      "51.2K community messages",
      "Three X Spaces with 41 speakers",
      "More than 75% first-day activation",
    ],
    images: ["gameon-1.png", "gameon-2.png", "gameon-3.png", "gameon-4.png"],
  },
  {
    slug: "alphablockz-ecosystem",
    title: "AlphaBlockZ Ecosystem",
    category: "DeFi infrastructure",
    summary:
      "A multi-phase ecosystem launch combining education, quests and community growth.",
    challenge:
      "Launch a DeFi ecosystem in a competitive market with limited initial awareness.",
    solution:
      "Galxe quests, product education, social growth and multi-channel community building.",
    metrics: [
      ["Galxe followers", "9,913"],
      ["Participation", "15,969"],
      ["Page views", "62,570"],
      ["Social reach", "65,092"],
    ],
    results: [
      "1,321 active Discord members",
      "9,113 AlphaLauncher followers",
      "Consistent upward growth",
    ],
    images: ["alphablockz-1.png", "alphablockz-2.png", "alphablockz-3.png"],
  },
  {
    slug: "performance-acquisition",
    title: "Google & Social Ads",
    category: "Paid acquisition",
    summary:
      "Performance acquisition for gaming products across Google and Meta.",
    challenge:
      "Acquire users cost-effectively while maintaining strong conversion rates.",
    solution:
      "Continuous campaign optimization and precise gaming-audience targeting.",
    metrics: [
      ["Impressions", "15.7M"],
      ["Downloads", "166K"],
      ["CTR", "5.00%"],
      ["Reported spend", "$5.35K"],
    ],
    results: [
      "200K downloads in one campaign",
      "2,300% WAU increase in another",
      "Acquisition costs as low as $0.025",
    ],
    images: ["ads-1.png", "ads-2.png", "ads-3.png"],
  },
  {
    slug: "coralapp-community-growth",
    title: "CoralApp Community Growth",
    category: "Galxe campaign",
    summary: "A quest-led onboarding sprint across Asia, the US and Europe.",
    challenge: "Scale participation while sustaining regional engagement.",
    solution:
      "Quest design and incentive alignment through the Galxe ecosystem.",
    metrics: [
      ["Participation", "1.2K → 12.5K"],
      ["Page views", "50K → 202K"],
      ["Whitelist", "70K+"],
      ["NFTs", "13K"],
    ],
    results: [
      "13K NFTs sold out in under ten minutes",
      "Growth across three regions",
      "Activity sustained after campaign peak",
    ],
    images: ["coral-growth-1.png"],
  },
  {
    slug: "coralapp-ct-mindshare",
    title: "CoralApp CT Mindshare",
    category: "Creator activation",
    summary:
      "Creator-led narrative and sentiment amplification through YapMarket.",
    challenge:
      "Build consistent Crypto Twitter mindshare with efficient spend.",
    solution:
      "Activated 40 creators around balanced posting and repeatable engagement.",
    metrics: [
      ["Audience reach", "331,320"],
      ["Mentions", "74"],
      ["Engagements", "595"],
      ["Campaign views", "17,462"],
    ],
    results: [
      "Largest mention increase in twelve months",
      "40 creators activated",
      "Reported CPV of $0.0012",
    ],
    images: [
      "coral-mindshare-1.png",
      "coral-mindshare-2.png",
      "coral-mindshare-3.png",
    ],
  },
];

export const getCaseStudy = (slug: string) =>
  caseStudies.find((item) => item.slug === slug);
