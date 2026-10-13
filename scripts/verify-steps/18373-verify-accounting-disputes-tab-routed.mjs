#!/usr/bin/env node
/**
 * 18373-verify-accounting-disputes-tab-routed.mjs
 *
 * ROUND 443.17 (CC-1, 2026-10-10). Owner order: route DisputesHubPage and add "Disputes" tab to
 * the Accounting module top tabs so users can reach invoice disputes without knowing the URL.
 *
 * Rules verified (static, no DB):
 *   1. "Disputes" tab entry exists in the accounting case of getSidebarFlyoutItems (sidebar-config.ts).
 *   2. The tab points to "/accounting/disputes".
 *   3. DisputesHubPage is imported in manifest.tsx (lazy import).
 *   4. The route path="/accounting/disputes" renders DisputesHubPage in manifest.tsx.
 *   5. openInvoiceDispute is imported in DisputesHubPage.tsx (open-dispute capability present).
 *   6. data-testid="open-dispute-btn" exists in DisputesHubPage.tsx (button is rendered).
 */
import { readFileSync } from "node:fs";

const SIDEBAR_PATH = "apps/frontend/src/components/layout/sidebar-config.ts";
const MANIFEST_PATH = "apps/frontend/src/routes/manifest.tsx";
const PAGE_PATH = "apps/frontend/src/pages/accounting/DisputesHubPage.tsx";

function loadFile(p) {
  return readFileSync(p, "utf8");
}

export function collectFailures(
  sidebarSrc = loadFile(SIDEBAR_PATH),
  manifestSrc = loadFile(MANIFEST_PATH),
  pageSrc = loadFile(PAGE_PATH),
) {
  const failures = [];

  // Rule 1: "Disputes" label in the accounting case
  if (!/"Disputes"/.test(sidebarSrc)) {
    failures.push('sidebar-config.ts does not contain a "Disputes" label — Disputes tab missing from accounting flyout');
  }

  // Rule 2: tab points to /accounting/disputes
  if (!/"\/accounting\/disputes"/.test(sidebarSrc)) {
    failures.push('sidebar-config.ts does not have "/accounting/disputes" — Disputes tab has wrong or missing path');
  }

  // Rule 3: DisputesHubPage is lazy-imported in manifest
  if (!/DisputesHubPage/.test(manifestSrc)) {
    failures.push("manifest.tsx does not reference DisputesHubPage — page is not imported into the router");
  }

  // Rule 4: route at /accounting/disputes renders DisputesHubPage
  if (!/path=["']\/accounting\/disputes["']/.test(manifestSrc)) {
    failures.push('manifest.tsx does not have a route path="/accounting/disputes" — page has no URL');
  }
  if (!/<DisputesHubPage\s*\/>/.test(manifestSrc)) {
    failures.push("manifest.tsx does not render <DisputesHubPage /> — route element is missing");
  }

  // Rule 5: openInvoiceDispute is called in the page (not just imported)
  if (!/openInvoiceDispute\(/.test(pageSrc)) {
    failures.push("DisputesHubPage.tsx does not call openInvoiceDispute() — open-dispute capability is absent");
  }

  // Rule 6: Open dispute button is present
  if (!/data-testid="open-dispute-btn"/.test(pageSrc)) {
    failures.push('DisputesHubPage.tsx does not have data-testid="open-dispute-btn" — open dispute button is missing');
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`18373-verify-accounting-disputes-tab-routed SELFTEST FAIL — good sources rejected:\n  ${baseline.join("\n  ")}`);
    process.exit(1);
  }
  const sidebarSrc = loadFile(SIDEBAR_PATH);
  const manifestSrc = loadFile(MANIFEST_PATH);
  const pageSrc = loadFile(PAGE_PATH);
  const mutations = [
    ["Disputes label removed from sidebar",
      sidebarSrc.replace('{ label: "Disputes", to: "/accounting/disputes" }', '// Disputes removed'),
      manifestSrc, pageSrc],
    ["Disputes path removed from sidebar",
      sidebarSrc.replace('"/accounting/disputes"', '"/accounting/REMOVED"'),
      manifestSrc, pageSrc],
    ["DisputesHubPage not in manifest",
      sidebarSrc,
      manifestSrc.replace(/DisputesHubPage/g, "RemovedHubPage"),
      pageSrc],
    ["openInvoiceDispute not called in page",
      sidebarSrc, manifestSrc,
      pageSrc.replace("openInvoiceDispute(selectedInvoice.id,", "// openInvoiceDispute call removed;")],
    ["open-dispute-btn removed from page",
      sidebarSrc, manifestSrc,
      pageSrc.replace('data-testid="open-dispute-btn"', 'data-testid="REMOVED-btn"')],
  ];
  const escaped = [];
  for (const [name, s, m, p] of mutations) {
    const result = collectFailures(s, m, p);
    if (result.length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`18373-verify-accounting-disputes-tab-routed SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`18373-verify-accounting-disputes-tab-routed SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
  process.exit(0);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("18373-verify-accounting-disputes-tab-routed: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("18373-verify-accounting-disputes-tab-routed: OK — Disputes tab in accounting sidebar; /accounting/disputes routes to DisputesHubPage; open-dispute capability present");
