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

const source = { panel: readFileSync(panelPath, "utf8"), page: readFileSync(pagePath, "utf8") };

export function collectFailures(src = source) {
  const failures = [];
  if (!/settlementDisplayId\?\??:\s*string\s*\|\s*null/.test(src.panel)) {
    failures.push(`${panelPath}: no longer declares a settlementDisplayId prop`);
  }
  if (!/settlementLoadIds\?\??:\s*\{\s*id:\s*string;\s*number:\s*string\s*\|\s*null\s*\}\[\]/.test(src.panel)) {
    failures.push(`${panelPath}: no longer declares a settlementLoadIds prop`);
  }
  if (!/kind="settlement"[\s\S]{0,100}?id=\{settlementId\}[\s\S]{0,140}?entityLabel\(settlementDisplayId \?\? null, settlementId, "Settlement"\)/.test(src.panel)) {
    failures.push(`${panelPath}: settlement drill must bind settlementId + settlementDisplayId`);
  }
  if (!/settlementLoadIds\.map\(\(load\)[\s\S]{0,180}?kind="load"[\s\S]{0,100}?id=\{load\.id\}[\s\S]{0,120}?entityLabel\(load\.number, load\.id, "Load"\)/.test(src.panel)) {
    failures.push(`${panelPath}: Loads-in-cycle must bind each load id + human number`);
  }
  if (!/<PayRunClosePanel[\s\S]{0,400}?settlementDisplayId=\{settlementDisplayId\}/.test(src.page)) {
    failures.push(`${pagePath}: PayRunClosePanel is no longer passed settlementDisplayId={settlementDisplayId}`);
  }
  if (!/<PayRunClosePanel[\s\S]{0,400}?settlementLoadIds=\{settlementLoadIds\}/.test(src.page)) {
    failures.push(`${pagePath}: PayRunClosePanel is no longer passed settlementLoadIds={settlementLoadIds}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-payrun-close-panel-settlement-load-links SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const mutations = [
    ["display prop", "panel", /settlementDisplayId\?: string \| null;/, "settlementLabel?: string;"],
    ["loads prop", "panel", /settlementLoadIds\?: \{ id: string; number: string \| null \}\[\];/, "loadCount?: number;"],
    ["settlement id", "panel", /id=\{settlementId\}/, "id={companyId}"],
    ["settlement label", "panel", /entityLabel\(settlementDisplayId \?\? null, settlementId, "Settlement"\)/, 'entityLabel(null, settlementId, "Settlement")'],
    ["load id", "panel", /id=\{load\.id\}/, "id={settlementId}"],
    ["load label", "panel", /entityLabel\(load\.number, load\.id, "Load"\)/, 'entityLabel(null, load.id, "Load")'],
    ["parent display threading", "page", /(<PayRunClosePanel[\s\S]{0,400}?)settlementDisplayId=\{settlementDisplayId\}/, "$1settlementDisplayId={null}"],
    ["parent load threading", "page", /(<PayRunClosePanel[\s\S]{0,400}?)settlementLoadIds=\{settlementLoadIds\}/, "$1settlementLoadIds={[]}"],
  ];
  const escaped = [];
  for (const [name, key, pattern, replacement] of mutations) {
    const planted = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (planted[key] === source[key] || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-payrun-close-panel-settlement-load-links SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-payrun-close-panel-settlement-load-links SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();

if (failures.length > 0) {
  console.error("verify-payrun-close-panel-settlement-load-links: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-payrun-close-panel-settlement-load-links: OK — PayRunClosePanel renders a real settlement label + loads-in-cycle EntityLink strip, both threaded from the parent");
