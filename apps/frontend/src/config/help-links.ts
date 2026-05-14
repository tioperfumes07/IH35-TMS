/**
 * Longest pathname prefix wins. Values are absolute doc paths from repo root (including /docs/...).
 * GitHub renders fragments against markdown headings / explicit <a id> anchors.
 */
export const HELP_DOCS_BASE: string =
  (import.meta.env.VITE_HELP_DOCS_BASE as string | undefined)?.replace(/\/$/, "") ??
  "https://github.com/tioperfumes07/IH35-TMS/blob/main";

export type HelpLinkRule = { prefix: string; docRel: string };

/** More-specific routes first within each prefix length bucket (sorted below). */
export const HELP_LINK_RULES: HelpLinkRule[] = [
  { prefix: "/admin/launch-readiness", docRel: "docs/user-guides/owner-admin-quickstart.md#launch-readiness" },
  { prefix: "/reports/scheduled", docRel: "docs/user-guides/owner-admin-quickstart.md#scheduled-reports" },
  { prefix: "/driver-finance/settlements", docRel: "docs/user-guides/owner-admin-quickstart.md#settlements" },
  { prefix: "/accounting/invoices", docRel: "docs/user-guides/dispatcher-quickstart.md#invoices" },
  { prefix: "/maintenance", docRel: "docs/user-guides/dispatcher-quickstart.md#maintenance" },
  { prefix: "/banking", docRel: "docs/user-guides/owner-admin-quickstart.md#banking" },
  { prefix: "/dispatch", docRel: "docs/user-guides/dispatcher-quickstart.md#booking-loads" },
  { prefix: "/qbo", docRel: "docs/user-guides/owner-admin-quickstart.md#qbo-sync" },
  { prefix: "/driver/loads/", docRel: "docs/user-guides/driver-quickstart.md#load-detail" },
  { prefix: "/driver/loads", docRel: "docs/user-guides/driver-quickstart.md#today-loads" },
  { prefix: "/driver/hos", docRel: "docs/user-guides/driver-quickstart.md#hos" },
  { prefix: "/driver/disputes", docRel: "docs/user-guides/driver-quickstart.md#disputes" },
  { prefix: "/driver/settings", docRel: "docs/user-guides/driver-quickstart.md#settings" },
  { prefix: "/driver/login", docRel: "docs/user-guides/driver-quickstart.md#login-email" },
  { prefix: "/driver", docRel: "docs/user-guides/driver-quickstart.md#pwa-home" },
  { prefix: "/home", docRel: "docs/user-guides/owner-admin-quickstart.md#owner-home" },
  { prefix: "/fuel", docRel: "docs/user-guides/dispatcher-quickstart.md#dispatch-board-mental-model" },
  { prefix: "/reports", docRel: "docs/user-guides/dispatcher-quickstart.md#reports-hub" },
  { prefix: "/customers", docRel: "docs/user-guides/dispatcher-quickstart.md#customer-lookup-ar-sensitive" },
  { prefix: "/drivers", docRel: "docs/user-guides/dispatcher-quickstart.md#assigning-driver-unit" },
  { prefix: "/users", docRel: "docs/user-guides/owner-admin-quickstart.md#user-administration-roles" },
  { prefix: "/legal", docRel: "docs/user-guides/owner-admin-quickstart.md#governance-first-mindset" },
  { prefix: "/lists", docRel: "docs/user-guides/dispatcher-quickstart.md#dispatch-board-mental-model" },
  { prefix: "/safety", docRel: "docs/user-guides/dispatcher-quickstart.md#troubleshooting-playbook" },
  { prefix: "/425c", docRel: "docs/user-guides/common-flow-faq.md" },
  { prefix: "/integrations/samsara", docRel: "docs/user-guides/dispatcher-quickstart.md#troubleshooting-playbook" },
  { prefix: "/admin/forensic-review", docRel: "docs/user-guides/owner-admin-quickstart.md#quickbooks-online-qbo-sync-posture" },
  { prefix: "/driver-app", docRel: "docs/user-guides/driver-quickstart.md#pwa-home" },
  { prefix: "/login", docRel: "docs/user-guides/dispatcher-quickstart.md#sign-in-and-company-context" },
].sort((a, b) => b.prefix.length - a.prefix.length);

export const FAQ_DOC_REL = "docs/user-guides/common-flow-faq.md";

export function helpUrlFromRel(docRel: string): string {
  return `${HELP_DOCS_BASE}/${docRel.replace(/^\//, "")}`;
}

export function resolveHelpUrl(pathname: string): string | null {
  const path = pathname.split("?")[0] ?? pathname;
  for (const rule of HELP_LINK_RULES) {
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) {
      return helpUrlFromRel(rule.docRel);
    }
  }
  return null;
}

export function faqHelpUrl(): string {
  return helpUrlFromRel(FAQ_DOC_REL);
}
