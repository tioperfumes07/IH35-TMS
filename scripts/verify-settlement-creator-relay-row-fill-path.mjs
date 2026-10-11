#!/usr/bin/env node
/**
 * GUARD — 5772 prod-fork rehearsal (2026-10-11), Lead option (a): a Settlement Creator Relay fill posts THROUGH its Relay
 * fill. Three defects held it back: (1) creator_manual_entry on a Relay row posted an expense against the wallet (refused by
 * trg_relay_wallet_consumed_only_by_relay_fill) instead of taking the relay_link path; (2) a row the Creator pre-linked
 * returned no link, so the fill never posted; (3) a Relay line carries product amount AND fee on the same row, and
 * splitting by fee_type dropped the product. Also: a fill with two products posts once per settlement.
 * Run: node scripts/verify-settlement-creator-relay-row-fill-path.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-relay-row-fill-path";
const FILE = "apps/backend/src/driver-finance/settlement-creator.service.ts";
export function problems(s) {
  const p = [];
  if (!/creator_manual_entry: fuel\.card !== "relay",/.test(s)) p.push("a Relay row is posted as an expense against the wallet (creator_manual_entry on Relay)");
  if (!/const linkedFill = link\.linked \?\? relayFillId;/.test(s)) p.push("a Relay row the Creator pre-linked never posts its fill");
  if (!/if \(linkedFill && !postedRelayFills\.has\(linkedFill\)\) \{/.test(s)) p.push("a fill with two products could post twice");
  if (!/const productLines = linesRows\.rows\.filter\(l => Number\(l\.total_discounted_price_cents \?\? 0\) > 0\);/.test(s)) p.push("product amounts on a line that also carries a fee are dropped");
  return p;
}
function selftest() {
  const g = fs.readFileSync(path.join(ROOT, FILE), "utf8"); const bad = [];
  if (problems(g).length) bad.push(`real tree flagged: ${problems(g).join("; ")}`);
  const plants = [(x) => x.replace('creator_manual_entry: fuel.card !== "relay",', "creator_manual_entry: true,"), (x) => x.replace("link.linked ?? relayFillId", "link.linked"), (x) => x.replace("!postedRelayFills.has(linkedFill)", "true"), (x) => x.replace("filter(l => Number(l.total_discounted_price_cents ?? 0) > 0)", "filter(l => !l.fee_type)")];
  for (const f of plants) { const pl = f(g); if (pl === g) bad.push("plant did not apply"); else if (!problems(pl).length) bad.push("plant passed"); }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}
if (process.argv.includes("--selftest")) selftest();
else { const p = problems(fs.readFileSync(path.join(ROOT, FILE), "utf8")); if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); } console.log(`${LABEL} PASS`); }
