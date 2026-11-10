#!/usr/bin/env node
/**
 * ENG-65 residual (LEAD 11-03) — every Relay fill has its fuel records, whether or not a settlement names it.
 * Root cause measured 11-03 (prod, USMCA): 48 posted Relay fill documents ($16,421.01) had no fuel.fuel_transactions row;
 * the Settlement Creator was the only writer, and it adopted a fill's existing rows only on an Edit.
 * Static: ensureRelayFillFuelRecords returns live rows or writes through writeRelayFillFuelRows at relay_created_at with the
 * Relay transaction id; the receipt adopt records a record-less fill; recordRelayFillAtReceipt names the truck and driver
 * (TIER1) before writing and refuses by name, inside a savepoint, audited; the ingest hook records and links every
 * record-less document before the fill engine and fails the run on refusals; the Creator adopts live rows on every post.
 * --selftest plants each defect in memory.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-fill-recorded-at-receipt";
const F = {
  rows: "apps/backend/src/fuel/relay-fill-fuel-rows.ts",
  doc: "apps/backend/src/fuel/fuel-expense-document.service.ts",
  hook: "apps/backend/src/fuel/fuel-ingest-hooks.ts",
  creator: "apps/backend/src/driver-finance/settlement-creator.service.ts",
};

function fn(src, name) {
  const m = new RegExp(`export (async )?function ${name}\\(`).exec(src);
  if (!m) return "";
  const j = src.indexOf("\nexport ", m.index + 10);
  return src.slice(m.index, j < 0 ? undefined : j);
}

export function findDefects(s) {
  const out = [];
  const ensure = fn(s.rows, "ensureRelayFillFuelRecords");
  if (!ensure) out.push("ensureRelayFillFuelRecords not exported");
  if (!/if \(live\.length\) return \{ written: false, rows: live \}/.test(ensure)) out.push("ensure does not return the fill's live records first (would write a second set)");
  if (!/writeRelayFillFuelRows\(client,/.test(ensure)) out.push("ensure does not write through the one Relay record writer");
  if (!/purchasedAt: fill\.relay_created_at/.test(ensure) || !/relay_fill_no_moment/.test(ensure)) out.push("ensure does not stamp Relay's own moment (or guesses one)");
  if (!/reference: fill\.transaction_id/.test(ensure)) out.push("ensure does not reference the Relay transaction id");
  const rec = fn(s.doc, "recordRelayFillAtReceipt");
  const iUnit = rec.indexOf("relay_fill_unit_unknown");
  const iDrv = rec.indexOf("relay_fill_driver_unknown");
  const iSp = rec.indexOf('SAVEPOINT relay_fill_record_at_receipt');
  if (iUnit < 0 || iDrv < 0 || iSp < 0 || iUnit > iSp || iDrv > iSp) out.push("the receipt record does not name truck and driver (TIER1) before writing");
  if (!/resolveFillDriverAtTime\(/.test(rec)) out.push("the receipt record does not use the one fill-driver rule");
  const caught = rec.slice(rec.indexOf("} catch (err) {"));
  if (rec.indexOf("} catch (err) {") < 0 || !/ROLLBACK TO SAVEPOINT relay_fill_record_at_receipt/.test(caught) || !/fuel\.relay_fill_record_refused/.test(caught)) out.push("a refused record is not rolled back to its savepoint and audited");
  const adopt = fn(s.doc, "adoptRelayFillExpenseDocument");
  // sweepA (2026-11-10) — ACCT-F11127 (#28722): a Relay SERVICE code (lumper / scale ticket) is an expense document with no
  // fuel record, so the adopt skips the record for `is_service` rows only. Any other extra condition is still a skip.
  if (!/if \(!fills\.rows\.length(?: && !relayRow\.rows\[0\]\?\.is_service)?\) \{\s*const recorded = await recordRelayFillAtReceipt\(/.test(adopt)) out.push("the receipt adopt does not record a record-less fill");
  const hookStep = s.hook.slice(s.hook.indexOf('"fuel.relay_fill_records"'));
  if (!/listRelayFillDocumentsWithoutRecords\(/.test(hookStep) || !/recordAndLinkRelayFillDocument\(/.test(hookStep)) out.push("the ingest hook does not record and link record-less Relay documents");
  if (s.hook.indexOf('"fuel.relay_fill_records"') < 0 || s.hook.indexOf('"fuel.relay_fill_records"') > s.hook.indexOf('"fuel.follows_truck"')) out.push("record-less fills are not recorded before the fill engine runs");
  if (!/relay_fill_records_refused/.test(s.hook)) out.push("refused Relay records do not fail the run (silent)");
  const creatorBlock = s.creator.slice(s.creator.indexOf("let rows = relayRowsThisPost;"), s.creator.indexOf("const written = await writeRelayFillFuelRows("));
  if (/if \(!rows && draft\.edit_void_repost\)/.test(creatorBlock) || !/if \(!rows\) \{\s*const existing = /.test(creatorBlock)) out.push("the Creator adopts a fill's live records only on an Edit (a second set is written on a first post)");
  return out;
}

const src = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, readFileSync(path.join(ROOT, f), "utf8")]));
if (process.argv.includes("--selftest")) {
  const plant = (k, a, b) => ({ ...src, [k]: src[k].replace(a, b) });
  const plants = [
    ["ensure writes over live rows", plant("rows", "if (live.length) return { written: false, rows: live };", "")],
    ["ensure guesses the moment", plant("rows", "purchasedAt: fill.relay_created_at", "purchasedAt: new Date().toISOString()")],
    ["receipt adopt skips the record", plant("doc", /if \(!fills\.rows\.length(?: && !relayRow\.rows\[0\]\?\.is_service)?\) \{(?=\s*const recorded = await recordRelayFillAtReceipt\()/, "if (false) {")],
    ["receipt adopt skips a fuel fill on another condition", plant("doc", /if \(!fills\.rows\.length(?: && !relayRow\.rows\[0\]\?\.is_service)?\) \{(?=\s*const recorded = await recordRelayFillAtReceipt\()/, "if (!fills.rows.length && input.relay_fill_id === null) {")],
    ["refusal not audited", { ...src, doc: (() => { const i = src.doc.indexOf("} catch (err) {", src.doc.indexOf("export async function recordRelayFillAtReceipt(")); return src.doc.slice(0, i) + src.doc.slice(i).replace('"fuel.relay_fill_record_refused"', '"x"'); })() }],
    ["Creator adopts only on Edit", plant("creator", "      if (!rows) {\n        const existing = ", "      if (!rows && draft.edit_void_repost) {\n        const existing = ")],
    ["hook swallows refusals", plant("hook", "if (refused.length) throw new Error(`relay_fill_records_refused", "if (false) throw new Error(`x")],
  ];
  let caught = 0;
  for (const [name, planted] of plants) {
    const changed = Object.keys(F).some((k) => planted[k] !== src[k]);
    const hit = changed && findDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted defects caught`);
  process.exit(caught === plants.length ? 0 : 1);
}
const defects = findDefects(src);
if (defects.length) { console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`); process.exit(1); }
console.log(`${LABEL} PASS — every Relay fill is recorded from its own lines at receipt; the Creator adopts, never writes a second set`);
