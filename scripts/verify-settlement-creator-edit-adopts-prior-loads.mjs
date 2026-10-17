#!/usr/bin/env node
/**
 * GUARD — Lead ruling 2026-10-11 (5769 repair, Option 1): Settlement Creator Edit = void and repost ADOPTS the replaced
 * Creator settlement's own loads (same AlwaysTrack number, same driver) instead of refusing them, keeps their sent
 * invoices, re-uses (never re-inserts) their fill rows, and still refuses every OTHER existing load number. A Creator
 * settlement posted through the close is replaced via the engine reverse (reverseSettlementForVoid), not refused.
 * Run: node scripts/verify-settlement-creator-edit-adopts-prior-loads.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-edit-adopts-prior-loads";
const F = { seed: "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts", svc: "apps/backend/src/driver-finance/settlement-creator.service.ts" };
export function problems(s) {
  const p = [];
  if (!/if \(existing\.rows\[0\] && draft\.edit_void_repost && \(await isPriorCreatorSettlementLoad\(client, draft, existing\.rows\[0\]\.id\)\)\) \{[\s\S]{0,400}continue;/.test(s.seed)) p.push("Edit does not adopt the replaced settlement's own loads");
  if (!/load_already_exists/.test(s.seed)) p.push("an existing load that is not the replaced settlement's own no longer refuses");
  if (!/s\.source_document_ref = \$2 AND s\.driver_id = \$3::uuid/.test(s.seed)) p.push("adoption is not limited to the same AlwaysTrack number and driver");
  if (/for \(const invoiceId of prior\.invoice_ids/.test(s.svc)) p.push("Edit voids the prior loads' sent invoices (Option 1 keeps them)");
  if (/family: "fuel_transaction",\s*documentId: fuelId/.test(s.svc)) p.push("Edit voids the prior fill rows instead of re-using them");
  // LEAD 443.198: a Relay row is the fill's own row (relayRowId, written from its lines) — still never a second insert.
  if (!/const inserted = reused \? \{ rows: \[\{ id: reused \}\] \} : (?:relayRowId \? \{ rows: \[\{ id: relayRowId \}\] \} : )?await client\.query/.test(s.svc)) p.push("a re-used fill is inserted a second time");
  if (!/if \(postedRun\.rows\[0\] && !creatorPosted\)/.test(s.svc)) p.push("a Creator settlement posted through the close cannot be replaced");
  if (!/await reverseSettlementForVoid\(client, \{/.test(s.svc)) p.push("Edit no longer reverses the replaced settlement through the engine");
  // 5777: an NB in a Creator settlement starts a new tour; 5772: a Relay fill links to its ingested Relay transaction.
  if (!/tripType === "NB"\s*\?\s*randomUUID\(\)/.test(s.seed)) p.push("an NB leg of a Creator settlement does not start a new tour (it inherits the truck's prior tour)");
  if (!/relay_transaction_required/.test(s.svc) || !/relay_fuel_transaction_id\s*\)/.test(s.svc) || !/relay_fill_not_ingested/.test(s.svc)) p.push("a Relay fill is not linked to its ingested Relay transaction");
  return p;
}
const read = () => Object.fromEntries(Object.entries(F).map(([k, r]) => [k, fs.readFileSync(path.join(ROOT, r), "utf8")]));
function selftest() {
  const g = read(); const bad = [];
  if (problems(g).length) bad.push(`real tree flagged: ${problems(g).join("; ")}`);
  const plants = [
    ["seed", (x) => x.replace("draft.edit_void_repost && (await isPriorCreatorSettlementLoad", "false && (await isPriorCreatorSettlementLoad")],
    ["seed", (x) => x.replace("s.source_document_ref = $2 AND s.driver_id = $3::uuid", "s.driver_id = $3::uuid")],
    // 443.198 (#27011): the Relay branch adds a relayRowId arm — the plant matches both shapes and drops BOTH reuse arms.
    ["svc", (x) => x.replace(/const inserted = reused \? \{ rows: \[\{ id: reused \}\] \} : (?:relayRowId \? \{ rows: \[\{ id: relayRowId \}\] \} : )?await client\.query/, "const inserted = await client.query")],
    ["svc", (x) => x.replace("if (postedRun.rows[0] && !creatorPosted)", "if (postedRun.rows[0])")],
    ["svc", (x) => x + "\nfor (const invoiceId of prior.invoice_ids ?? []) {}"],
    ["seed", (x) => x.replace(/tripType === "NB"\s*\?\s*randomUUID\(\)/, 'tripType === "NB" ? null')],
    ["svc", (x) => x.replace("relay_fill_not_ingested", "relay_x")],
  ];
  for (const [k, f] of plants) { const pl = f(g[k]); if (pl === g[k]) bad.push(`plant on ${k} did not apply`); else if (!problems({ ...g, [k]: pl }).length) bad.push(`plant on ${k} passed`); }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}
if (process.argv.includes("--selftest")) selftest();
else { const p = problems(read()); if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); } console.log(`${LABEL} PASS`); }
