#!/usr/bin/env node
/**
 * verify-payrun-close-panel-settlement-load-links.mjs
 *
 * PayRunClosePanel.tsx's Settlement EntityLink always called
 * entityLabel(null, settlementId, "Settlement") — the first arg (display name) was hardcoded null,
 * so every render fell back to the honest-but-avoidable "Settlement — not visible" tombstone, even
 * though the parent page (SettlementDetailPage.tsx) already resolves settlementDisplayId and threads
 * it to sibling components (SettlementHeader, HoldDeductionModal, LiabilityBreakdownModal) — just
 * never to this one. Same root cause blocked the panel's "Loads in cycle" reverse-link: the parent
 * already computes settlementLoadIds ({id, number}[], from settlement_lines.load_id) for
 * SettlementHeader but never passed it here either.
 *
 * Fixed by threading both settlementDisplayId and settlementLoadIds from SettlementDetailPage.tsx
 * into PayRunClosePanel.tsx, and rendering a real Loads-in-cycle EntityLink strip there.
 *
 * Guards against either prop being dropped again, or the panel reverting to a hardcoded-null label.
 */
import { readFileSync } from "node:fs";

const panelPath = "apps/frontend/src/pages/driver-finance/components/PayRunClosePanel.tsx";
const pagePath = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";

const panelSrc = readFileSync(panelPath, "utf8");
const pageSrc = readFileSync(pagePath, "utf8");

const failures = [];

if (/entityLabel\(\s*null\s*,\s*settlementId\s*,\s*"Settlement"\s*\)/.test(panelSrc)) {
  failures.push(`${panelPath}: Settlement EntityLink reverted to entityLabel(null, settlementId, "Settlement") — always renders "Settlement — not visible"`);
}
if (!/settlementDisplayId\?\??:\s*string\s*\|\s*null/.test(panelSrc)) {
  failures.push(`${panelPath}: no longer declares a settlementDisplayId prop`);
}
if (!/settlementLoadIds\?\??:\s*\{\s*id:\s*string;\s*number:\s*string\s*\|\s*null\s*\}\[\]/.test(panelSrc)) {
  failures.push(`${panelPath}: no longer declares a settlementLoadIds prop`);
}
if (!/kind="load"/.test(panelSrc)) {
  failures.push(`${panelPath}: no longer renders a Loads-in-cycle EntityLink kind="load"`);
}

if (!/<PayRunClosePanel[\s\S]{0,400}?settlementDisplayId=\{settlementDisplayId\}/.test(pageSrc)) {
  failures.push(`${pagePath}: PayRunClosePanel is no longer passed settlementDisplayId={settlementDisplayId}`);
}
if (!/<PayRunClosePanel[\s\S]{0,400}?settlementLoadIds=\{settlementLoadIds\}/.test(pageSrc)) {
  failures.push(`${pagePath}: PayRunClosePanel is no longer passed settlementLoadIds={settlementLoadIds}`);
}

if (failures.length > 0) {
  console.error("verify-payrun-close-panel-settlement-load-links: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-payrun-close-panel-settlement-load-links: OK — PayRunClosePanel renders a real settlement label + loads-in-cycle EntityLink strip, both threaded from the parent");
