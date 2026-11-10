#!/usr/bin/env node
// ACCT-F11112 — the WEX reports the owner downloads import through the ONE statement engine, delta only, and foot.
//
// Owner 2026-11-09: "dreamline has not been used, we are using wex. i need to get that report." / "seed the data
// correctly". The upload took only the TransactionReport .csv/.xlsx (Disc PPU / Disc Amt / Tran Time); the WEX
// Transaction Report PDF and the Enhanced Transaction Report .xlsx (header on row 4, grouped sub-total rows) were refused,
// and the engine's line identity carried the fill instant, so the same ticket re-read from a file printing another clock
// planned a SECOND fuel row (measured on a prod fork: 9 live WEX fills — T148 93567/14284/04974, T175 78679/80999,
// T174 17938 — listed "imported" again).
//
// RULE 1 — the route accepts .pdf (parseWexTransactionReportPdf) and the Enhanced .xlsx (parseWexEnhancedReportGrid) and
//          REFUSES either unless its lines foot to the report's own grand total (wex_report_total_mismatch).
// RULE 2 — the Enhanced parser takes DETAIL rows only (a Transaction ID) — never the grouped sub-total rows.
// RULE 3 — the engine treats a line as already imported when a live statement row of the card carries the same
//          card + provider invoice + product (liveProviderKeys), whatever clock the file printed.
// RULE 4 — a line with no printed time (time_known === false) never stamps the fill moment, and its imported row is
//          written time_unknown.
// RULE 5 — the route hands the engine withCardUnitFallback(lines): a printed unit that is no truck falls back to the
//          card's own truck in the file, noted unit_from_card=.
import fs from "node:fs";

const ROUTE = "apps/backend/src/fuel/fuel-transaction-import.routes.ts";
const ENGINE = "apps/backend/src/fuel/dreamline-statement-import.service.ts";
const PDF = "apps/backend/src/fuel/wex-transaction-report-pdf.ts";
const ENH = "apps/backend/src/fuel/wex-enhanced-transaction-report.ts";
const FILES = [ROUTE, ENGINE, PDF, ENH];

export function audit(files) {
  const out = [];
  for (const f of FILES) if (files[f] == null) out.push(`${f} is missing`);
  if (out.length) return out;
  const route = files[ROUTE];
  const wexRoute = route.slice(route.indexOf('"/api/v1/fuel/wex/statement-import"'));
  if (!/!name\.endsWith\("\.csv"\) && !name\.endsWith\("\.xlsx"\) && !name\.endsWith\("\.pdf"\)\) return reply\.code\(400\)/.test(wexRoute) || !/parseWexTransactionReportPdf\(/.test(wexRoute)) out.push("RULE 1: the WEX route no longer reads the Transaction Report PDF");
  if (!/parseWexEnhancedReportGrid\(/.test(wexRoute)) out.push("RULE 1: the WEX route no longer reads the Enhanced Transaction Report");
  const refusals = wexRoute.match(/if \(!reportControl\.ok\) return reply\.code\(400\)\.send\(\{ error: "wex_report_total_mismatch"/g) ?? [];
  if (refusals.length < 2) out.push(`RULE 1: ${refusals.length} of 2 report formats refuse a file that does not foot to its grand total`);

  const enh = files[ENH];
  if (!/const txid = txt\(at\(row, C\.txid\)\);\s*\n\s*if \(!txid\) return;/.test(enh)) out.push("RULE 2: the Enhanced parser no longer skips rows without a Transaction ID (sub-total rows would import)");
  if (!/parsed_cents === report\.grand_total_cents/.test(enh)) out.push("RULE 1: the Enhanced control no longer compares to the grand-total row");
  if (!/parsed_cents === report\.grand_total_cents/.test(files[PDF])) out.push("RULE 1: the PDF control no longer compares to the report Grand Total");

  const eng = files[ENGINE];
  if (!/const liveProviderKeys = new Map<string, number>\(\);/.test(eng)) out.push("RULE 3: the engine lost the provider-identity set (liveProviderKeys)");
  if (!/\|\| seq <= \(liveProviderKeys\.get\(providerKeyOf\(line\)\) \?\? 0\)\) \{/.test(eng)) out.push("RULE 3: a line already on the books by card + invoice + product is no longer 'already_imported'");
  const stamps = eng.match(/await stampStatementFillMoment\(client, \{ companyId, railKey/g) ?? [];
  const guarded = eng.match(/(time_known !== false\) \{\s*\n\s*await stampStatementFillMoment|time_known !== false\) await stampStatementFillMoment)/g) ?? [];
  if (stamps.length === 0 || guarded.length !== stamps.length) out.push(`RULE 4: ${stamps.length - guarded.length} fill-moment stamp(s) run on a file that printed no time`);
  if (!/created_by_user_id, trailer_id, time_unknown\)/.test(eng) || !/line\.time_known === false,\n/.test(eng)) out.push("RULE 4: an imported row with no printed time is not written time_unknown");
  if (!/withCardUnitFallback\(parsed\.lines\)/.test(wexRoute)) out.push("RULE 5: the WEX route no longer applies the card's own truck as the unit fallback");
  if (!/unitFromCard \? `unit_from_card=\$\{unitFromCard\}` : null/.test(eng)) out.push("RULE 5: a fallback truck is not noted on the row (unit_from_card=)");
  return out;
}

function load(root) {
  const files = {};
  for (const f of FILES) {
    try { files[f] = fs.readFileSync(`${root}/${f}`, "utf8"); } catch { files[f] = null; }
  }
  return files;
}

if (process.argv.includes("--selftest")) {
  const good = load(process.cwd());
  const clean = audit(good);
  if (clean.length) throw new Error("SELFTEST FAIL (live tree should be clean): " + JSON.stringify(clean));
  const plant = (file, from, to) => {
    const f = { ...good };
    if (!f[file] || !f[file].includes(from)) throw new Error(`SELFTEST setup broken: '${from}' not in ${file}`);
    f[file] = f[file].replace(from, to);
    return f;
  };
  const cases = [
    ["pdf refused", plant(ROUTE, ' && !name.endsWith(".pdf")) return reply.code(400).send({ error: "pdf_xlsx_or_csv_required" });', ') return reply.code(400).send({ error: "pdf_xlsx_or_csv_required" });')],
    ["pdf imports without footing", plant(ROUTE, 'if (!reportControl.ok) return reply.code(400).send({ error: "wex_report_total_mismatch", detail: "The parsed lines', 'if (false) return reply.code(400).send({ error: "x", detail: "The parsed lines')],
    ["enhanced imports without footing", plant(ROUTE, 'if (!reportControl.ok) return reply.code(400).send({ error: "wex_report_total_mismatch", detail: "The report\'s detail', 'if (false) return reply.code(400).send({ error: "x", detail: "The report\'s detail')],
    ["sub-total rows import", plant(ENH, "    if (!txid) return;\n", "")],
    ["provider identity dropped", plant(ENGINE, " || seq <= (liveProviderKeys.get(providerKeyOf(line)) ?? 0)) {", ") {")],
    ["placeholder clock stamped", plant(ENGINE, "    if (line.time_known !== false) await stampStatementFillMoment(client, { companyId, railKey: rail.key, at: line.transaction_at, city: line.city, state: line.state, stationName: line.location_name, fuelTransactionId: fuelId });", "    await stampStatementFillMoment(client, { companyId, railKey: rail.key, at: line.transaction_at, city: line.city, state: line.state, stationName: line.location_name, fuelTransactionId: fuelId });")],
    ["time_unknown not written", plant(ENGINE, "        line.time_known === false,\n", "        false,\n")],
    ["card fallback dropped", plant(ROUTE, "withCardUnitFallback(parsed.lines)", "parsed.lines")],
  ];
  let caught = 0;
  for (const [name, files] of cases) {
    if (audit(files).length === 0) throw new Error(`SELFTEST FAIL: planted defect '${name}' went undetected`);
    caught += 1;
  }
  console.log(`verify-wex-transaction-report-import: SELFTEST PASS (${caught}/${cases.length} planted defects caught)`);
  process.exit(0);
}

const failures = audit(load(process.cwd()));
if (failures.length) {
  console.error("verify-wex-transaction-report-import FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-wex-transaction-report-import: PASS — PDF + Enhanced report import, foot to grand total, delta by card+invoice+product, no placeholder clock");
