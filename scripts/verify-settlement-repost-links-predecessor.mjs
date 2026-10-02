#!/usr/bin/env node
// Lead ROUND 330.6 ruling 1 (CC-1, proven on a Neon fork) — a reversed settlement can be RE-POSTED against the same
// loads; its bill numbers are spent forever; the two settlements are linked both ways and the link is on screen.
// Fails if: (1) migration 202615270100 stops adding predecessor/successor and the live-only spine uniqueness;
// (2) closeSettlementPayRun stops linking a re-post to the reversed settlement both ways; (3) the A/P chain stops
// giving a re-post bill a fresh display number when the load number is spent (autoDisplayId); (4) the canonical
// reverser stops superseding its spine rows; (5) the settlement header stops rendering the links.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-settlement-repost-links-predecessor";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  mig: "db/migrations/202615270100_settlement_predecessor_successor.sql",
  close: "apps/backend/src/driver-finance/settlement-payrun-close.service.ts",
  chain: "apps/backend/src/driver-finance/settlement-ap-chain.service.ts",
  bills: "apps/backend/src/accounting/bills.service.ts",
  reverser: "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts",
  header: "apps/frontend/src/pages/driver-finance/components/SettlementHeader.tsx",
  page: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
};

export function problems(s) {
  const p = [];
  if (!/predecessor_settlement_id uuid/.test(s.mig) || !/successor_settlement_id uuid/.test(s.mig)) p.push(`${F.mig}: predecessor / successor columns missing`);
  if (!/uq_driver_settlement_gl_bills_live_driver_bill[\s\S]{0,200}WHERE superseded_at IS NULL/.test(s.mig)) p.push(`${F.mig}: spine rows must be unique per driver bill only while live`);
  if (!/SET predecessor_settlement_id = \$3::uuid/.test(s.close) || !/SET successor_settlement_id = \$3::uuid/.test(s.close)) p.push(`${F.close}: a re-post must link to the reversed settlement both ways`);
  if (!/autoDisplayId: spent\.rows\.length > 0/.test(s.chain)) p.push(`${F.chain}: a re-post bill must take a fresh display number when the load number is spent`);
  if (!/input\.autoDisplayId \? null : billNumber/.test(s.bills)) p.push(`${F.bills}: autoDisplayId must request an automatic display number`);
  if (!/UPDATE driver_finance\.driver_settlement_gl_bills SET superseded_at = now\(\)/.test(s.reverser)) p.push(`${F.reverser}: the reverser must supersede its spine rows`);
  if (!/data-testid="settlement-header-predecessor"/.test(s.header) || !/data-testid="settlement-header-successor"/.test(s.header) || !/predecessor_settlement_id/.test(s.page)) p.push(`${F.header}: the settlement header must show Replaces / Replaced by`);
  return p;
}

const load = () => Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
export function run() { return problems(load()); }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const s = load();
  const own = problems(s);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["no link", { ...s, close: s.close.replace("SET successor_settlement_id = $3::uuid", "SET updated_at = now()") }],
      ["number reused", { ...s, chain: s.chain.replace("autoDisplayId: spent.rows.length > 0", "autoDisplayId: false") }],
      ["spine kept live", { ...s, reverser: s.reverser.replace("UPDATE driver_finance.driver_settlement_gl_bills SET superseded_at = now()", "SELECT 1") }],
    ];
    for (const [name, planted] of plants) if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — a re-posted settlement links to the reversed one both ways, on screen, and never reuses its bill numbers.`);
}
