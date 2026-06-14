import Fuse from "fuse.js";

export type HelpCategory =
  | "Getting Started"
  | "Dispatching Loads"
  | "Driver Settlements"
  | "Banking & Reconciliation"
  | "Reports"
  | "Account & Billing"
  | "Module Guides";

export type HelpArticleMeta = {
  slug: string;
  title: string;
  category: HelpCategory;
};

/** Eager raw imports from repo `docs/help/*.md`. */
const helpRawModules = import.meta.glob<string>("../../../../docs/help/*.md", { query: "?raw", import: "default", eager: true });

const HELP_MANIFEST: HelpArticleMeta[] = [
  { slug: "welcome", title: "Welcome to IH 35 Dispatch", category: "Getting Started" },
  { slug: "office-roles-overview", title: "Roles and permissions overview", category: "Getting Started" },
  { slug: "dispatch-board-basics", title: "Using the dispatch board", category: "Dispatching Loads" },
  { slug: "booking-load-checklist", title: "Booking a load — checklist", category: "Dispatching Loads" },
  { slug: "settlements-overview", title: "Driver settlements overview", category: "Driver Settlements" },
  { slug: "settlement-exceptions", title: "Settlement exceptions and disputes", category: "Driver Settlements" },
  { slug: "banking-plaid-connect", title: "Connecting banks with Plaid", category: "Banking & Reconciliation" },
  { slug: "bank-reconciliation-basics", title: "Bank reconciliation basics", category: "Banking & Reconciliation" },
  { slug: "reports-hub", title: "Reports hub navigation", category: "Reports" },
  { slug: "scheduled-reports", title: "Scheduled reports", category: "Reports" },
  { slug: "account-security", title: "Account security and passwords", category: "Account & Billing" },
  { slug: "data-import-wizard", title: "Bulk data import", category: "Account & Billing" },
  // Module Guides — scaffold stubs (content TBD, Jorge fills); bodies in docs/help/module-*.md
  { slug: "module-maintenance", title: "Maintenance", category: "Module Guides" },
  { slug: "module-fuel", title: "Fuel", category: "Module Guides" },
  { slug: "module-safety", title: "Safety", category: "Module Guides" },
  { slug: "module-drivers", title: "Drivers", category: "Module Guides" },
  { slug: "module-catalogs", title: "Catalogs & Lists", category: "Module Guides" },
  { slug: "module-factoring", title: "Factoring", category: "Module Guides" },
  { slug: "module-form-425c", title: "Form 425C", category: "Module Guides" },
  { slug: "module-driver-pwa", title: "Driver App (PWA)", category: "Module Guides" },
];

function resolveBody(slug: string): string {
  const hit = Object.entries(helpRawModules).find(([path]) => path.endsWith(`/${slug}.md`));
  return hit?.[1] ?? `# Missing article\n\nThe article "${slug}" could not be loaded.\n`;
}

export function getAllHelpArticles(): Array<HelpArticleMeta & { body: string }> {
  return HELP_MANIFEST.map((m) => ({ ...m, body: resolveBody(m.slug) }));
}

export function getHelpArticle(slug: string): (HelpArticleMeta & { body: string }) | null {
  const meta = HELP_MANIFEST.find((m) => m.slug === slug);
  if (!meta) return null;
  return { ...meta, body: resolveBody(slug) };
}

export function helpArticlesByCategory(): Record<HelpCategory, HelpArticleMeta[]> {
  const out = {} as Record<HelpCategory, HelpArticleMeta[]>;
  for (const c of [
    "Getting Started",
    "Dispatching Loads",
    "Driver Settlements",
    "Banking & Reconciliation",
    "Reports",
    "Account & Billing",
    "Module Guides",
  ] as HelpCategory[]) {
    out[c] = [];
  }
  for (const m of HELP_MANIFEST) {
    out[m.category].push(m);
  }
  return out;
}

export function searchHelpArticles(query: string, articles: Array<HelpArticleMeta & { body: string }>) {
  const fuse = new Fuse(articles, {
    keys: ["title", "body", "category"],
    threshold: 0.35,
    ignoreLocation: true,
  });
  return fuse.search(query.trim()).map((r) => r.item);
}
