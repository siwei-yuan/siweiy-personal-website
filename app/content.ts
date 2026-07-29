export type PosterEntry = {
  marker: string;
  title: string;
  detail: string;
  company?: string;
  period?: string;
  employment?: string;
  location?: string;
  summary?: string;
  highlights?: readonly string[];
  source?: string;
  href?: string;
  screenshot?: string;
  screenshotAlt?: string;
  screenshotOrientation?: "landscape" | "portrait";
};

export type DossierSection = {
  id: string;
  label: string;
  entries: readonly PosterEntry[];
};

export const dossierSections: readonly DossierSection[] = [
  {
    id: "chronology",
    label: "Timeline",
    entries: [
      {
        marker: "MAY 2026—NOW",
        title: "Member of Technical Staff",
        detail: "Paperboy · Full-time",
        company: "Paperboy",
        period: "May 2026 — Present · 3 mos",
        employment: "Full-time",
        summary: "Building AI agents, platforms, and more...",
        source: "LinkedIn profile",
      },
      {
        marker: "JUL 2023—MAY 2026",
        title: "Software Development Engineer",
        detail: "Amazon Web Services · Full-time",
        company: "Amazon Web Services (AWS)",
        period: "Jul 2023 — May 2026 · 2 yrs 11 mos",
        employment: "Full-time",
        location: "Seattle, Washington, United States · On-site",
        summary: "Worked on:",
        highlights: [
          "Windows on Graviton",
          "KDNET extensibility module for Elastic Network Adapters",
          "AWS Volume Shadow Copy Services (VSS)",
          "Windows driver for Elastic Fabric Adapters",
          "Windows experience on AWS",
        ],
        source: "LinkedIn profile",
      },
      {
        marker: "JUN—SEP 2022",
        title: "Software Development Engineer Intern",
        detail: "Amazon Web Services · Internship",
        company: "Amazon Web Services (AWS)",
        period: "Jun 2022 — Sep 2022 · 4 mos",
        employment: "Internship",
        location: "Seattle, Washington, United States · On-site",
        summary: "Built:",
        highlights: ["A telemetry system for the AWS NVMe driver"],
        source: "LinkedIn profile",
      },
      {
        marker: "JAN—SEP 2021",
        title: "Software Engineer Intern",
        detail: "Dell EMC · Internship",
        company: "Dell EMC",
        period: "Jan 2021 — Sep 2021 · 9 mos",
        employment: "Internship",
        location: "Shanghai, China",
        summary: "Worked on:",
        highlights: ["VM-related internal tools", "QA for VxRail releases"],
        source: "LinkedIn profile",
      },
      {
        marker: "JUN—SEP 2020",
        title: "Product Manager Intern",
        detail: "Signify · Internship",
        company: "Signify",
        period: "Jun 2020 — Sep 2020 · 4 mos",
        employment: "Internship",
        location: "Shanghai, China",
        source: "LinkedIn profile",
      },
      {
        marker: "2019—2023",
        title: "UCLA",
        detail: "B.S. in Computer Engineering · GPA 3.97/4.00 · Summa Cum Laude",
        company: "University of California, Los Angeles",
        period: "2019 — 2023",
        employment: "Education",
        source: "LinkedIn profile",
      },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    entries: [
      {
        marker: "OPEN SOURCE / 01",
        title: "KeyTally",
        detail: "AI telemetry · QMK/VIA · macOS",
        company: "The tally light for your AI",
        summary: "Turns AI usage, quota burn, and live activity into keyboard light.",
        highlights: [
          "Claude Code and Codex usage modes",
          "Universal VIA mode with no firmware flashing",
          "Pro QMK firmware with per-LED roles",
        ],
        href: "https://github.com/siwei-yuan/keytally",
        screenshot: "https://raw.githubusercontent.com/siwei-yuan/keytally/main/docs/assets/ui-main.png",
        screenshotAlt: "KeyTally usage telemetry interface with keyboard LED visualization",
        screenshotOrientation: "landscape",
      },
      {
        marker: "OPEN SOURCE / 02",
        title: "Bili Pilot",
        detail: "CDN routing · DASH pre-cache · Chrome",
        company: "Stable high-bitrate Bilibili playback",
        summary: "Compares signed CDN routes and pre-caches complete upcoming DASH segments.",
        highlights: [
          "Manual signed-route selection",
          "Adaptive per-segment pre-cache",
          "Local, private, and fail-open delivery",
        ],
        href: "https://github.com/siwei-yuan/bili-pilot",
        screenshot: "https://raw.githubusercontent.com/siwei-yuan/bili-pilot/main/docs/images/bili-pilot-full-panel.png",
        screenshotAlt: "Bili Pilot extension showing 4K routing and pre-cache status",
        screenshotOrientation: "portrait",
      },
      {
        marker: "OPEN SOURCE / 03",
        title: "Aperture",
        detail: "Agent privacy · ReBAC · disclosure ledger",
        company: "Disclosure control for personal AI agents",
        summary: "Determines which resolution of a memory each person may access before model context is built.",
        highlights: [
          "Resolution-typed memory authorization",
          "Quarantined ingest and audience ceilings",
          "Append-only disclosure ledger",
        ],
        href: "https://github.com/siwei-yuan/aperture",
      },
    ],
  },
  {
    id: "blogs",
    label: "Blogs",
    entries: [
      {
        marker: "TRANSMISSION PENDING",
        title: "Coming Soon",
        detail: "Notes from unfamiliar systems.",
      },
    ],
  },
];

export function getPosterTitleDensity(title: string) {
  const longestWord = Math.max(...title.split(/\s+/).map((word) => word.length));
  if (longestWord >= 11 || title.length >= 32) return "compressed";
  if (title.length >= 22) return "compact";
  return "standard";
}
