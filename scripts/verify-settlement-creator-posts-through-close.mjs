#!/usr/bin/env node
/** @matrix-built {"modules":["settlements"],"cols":["settlement"],"leaves":["settlements.drawer.creator"]} */
// ROUND 326 item 18 (CC-1) — the Settlement Creator has ONE calculator: the close engine. Owner: "the totals he
// verifies must come from the same code path the post writes — do not create a second calculator."
// Before: the creator wrote a settlement 'closed' and never called the close engine (no settlement JE, while the
// feed gate requires one), held escrow in the ledger itself (createHistoricalEscrowHold) and showed a net its own
// section math produced. This guard fails if:
//   1. postSettlementCreatorInClientTx stops recomputing the header and running closeSettlementPayRun (preview,
//      then the real post) on its own client, or stops refusing when the engine's NET differs from the AlwaysTrack
//      TOTAL DUE (totals_differ_from_posting_engine);
//   2. the creator writes the escrow ledger itself (createHistoricalEscrowHold) instead of an escrow_contribution
//      line the close engine posts once;
//   3. the preview route stops computing its totals through the posting engine (previewSettlementCreatorThroughClose:
//      savepoint, dry run, rollback) or the dry run stops skipping invoices;
//   4. the close stops honoring onlyAdvanceIds (the creator recovers exactly the advances its document lists);
//   5. Edit = void and repost stops refusing a settlement already posted through the per-load A/P chain;
//   6. the creator's totals block stops rendering the posting engine's chain (sc-posting-engine-totals).
//   7. (ROUND 365.6, matrix leaf settlements.drawer.creator, column settlement) the drawer stops being mounted on the
//      Settlements page, stops posting its settlement number through the registered creator post route, or the creator
//      stops writing the driver_finance.driver_settlements header that route returns.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-settlement-creator-posts-through-close";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  creator: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  routes: "apps/backend/src/driver-finance/settlement-creator.routes.ts",
  close: "apps/backend/src/driver-finance/settlement-payrun-close.service.ts",
  drawer: "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx",
  page: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
  index: "apps/backend/src/index.ts",
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export function problems(src) {
  const p = [];
  const c = strip(src.creator);
  const post = c.slice(c.indexOf("export async function postSettlementCreatorInClientTx"), c.indexOf("function toCreatorCloseTotals"));
  if (!/await recomputeSettlementHeader\(/.test(post)) p.push("the creator must recompute the settlement header before the close engine reads it");
  if (!/closeSettlementPayRun\(\{\s*\.\.\.closeInput,\s*previewOnly:\s*true\s*\},\s*closeActor,\s*\{\s*client/.test(post)) p.push("the creator must ask the close engine (previewOnly, same client) for the totals");
  if (!/closeSettlementPayRun\(closeInput,\s*closeActor,\s*\{\s*client/.test(post)) p.push("the creator must post through the close engine on its own transaction");
  if (!/"totals_differ_from_posting_engine"/.test(post)) p.push("the creator must refuse when the posting engine's NET differs from the AlwaysTrack TOTAL DUE");
  if (/createHistoricalEscrowHold\(/.test(c)) p.push("the creator writes the escrow ledger itself (createHistoricalEscrowHold) — escrow is an escrow_contribution line the close engine posts once");
  if (!/'escrow_contribution'/.test(post)) p.push("the creator must write escrow as an escrow_contribution settlement line");
  // ROUND 443.3 (#26178): the load is delivered through dispatch's transition engine on real posts only, between the
  // dry-run skip and the mint — the dry run still skips delivery, mint and send.
  if (!/if \(opts\.dryRun\) continue;\s*(?:\/\/[^\n]*\n\s*)*(?:await deliverLoadThroughDispatch\([^;]*\);\s*)?let built;/.test(post)) p.push("the dry run must skip invoice mint / send");
  if (!/onlyAdvanceIds:\s*advanceIds/.test(post)) p.push("the creator must recover only the advances it booked (onlyAdvanceIds)");
  const dry = c.slice(c.indexOf("export async function previewSettlementCreatorThroughClose"));
  if (!/SAVEPOINT settlement_creator_dry_run/.test(dry) || !/ROLLBACK TO SAVEPOINT settlement_creator_dry_run/.test(dry) || !/dryRun:\s*true/.test(dry)) p.push("previewSettlementCreatorThroughClose must dry-run Post inside a savepoint it rolls back");
  if (!/payrun_gl_runs[\s\S]{0,200}status = 'posted'[\s\S]{0,600}"settlement_posted_through_close"/.test(c)) p.push("Edit = void and repost must refuse a settlement posted through the per-load A/P chain");
  if (!/previewSettlementCreatorThroughClose\(client,\s*user\.uuid,\s*draft\)/.test(strip(src.routes))) p.push("the preview route must compute through the posting engine (previewSettlementCreatorThroughClose)");
  const close = strip(src.close);
  if (!/onlyAdvanceIds\?: string\[\] \| null/.test(close) || !/onlyAdvanceIds == null \|\| onlyAdvanceIds\.has\(a\.id\)/.test(close)) p.push("closeSettlementPayRun must honor onlyAdvanceIds");
  if (!/data-testid="sc-posting-engine-totals"/.test(src.drawer) || !/preview\.close_totals\.net_cents/.test(src.drawer)) p.push("the creator's totals block must render the posting engine's chain (sc-posting-engine-totals)");
  if (!/<SettlementCreatorDrawer open=\{creatorOpen\}/.test(src.page)) p.push("the Settlements page must mount the Settlement Creator drawer (settlement)");
  if (!/settlement_no: settlementNo\.trim\(\)/.test(src.drawer) || !/await postSettlementCreator\(draft\)/.test(src.drawer)) p.push("the drawer must post its settlement number through postSettlementCreator (settlement)");
  if (!/app\.post\("\/api\/v1\/driver-finance\/settlement-creator\/post",/.test(src.routes) || !/^\s*await registerSettlementCreatorRoutes\(app\);/m.test(src.index)) p.push("POST /api/v1/driver-finance/settlement-creator/post must be registered (settlement)");
  if (!/INSERT INTO driver_finance\.driver_settlements \(/.test(c)) p.push("the creator must write the driver_finance.driver_settlements header (settlement)");
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["no real close", { ...src, creator: src.creator.replace("closeSettlementPayRun(closeInput, closeActor, { client", "noop(closeInput, closeActor, { client") }],
      ["no mismatch refusal", { ...src, creator: src.creator.replace('"totals_differ_from_posting_engine"', '"x"') }],
      ["escrow ledger back", { ...src, creator: src.creator + "\nawait createHistoricalEscrowHold(client, {});" }],
      ["preview off the engine", { ...src, routes: src.routes.replace("previewSettlementCreatorThroughClose(client, user.uuid, draft)", "previewSettlementCreator(client, draft)") }],
      ["all advances", { ...src, close: src.close.replace("onlyAdvanceIds == null || onlyAdvanceIds.has(a.id)", "true") }],
      ["edit over a posted chain", { ...src, creator: src.creator.replace('"settlement_posted_through_close"', '"x"') }],
      ["drawer unmounted", { ...src, page: src.page.replace("<SettlementCreatorDrawer open={creatorOpen}", "<div") }],
      ["totals block gone", { ...src, drawer: src.drawer.replace('data-testid="sc-posting-engine-totals"', "") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — the Settlement Creator previews and posts through the close engine (one calculator); its NET must equal the AlwaysTrack TOTAL DUE.`);
}
