#!/usr/bin/env node
// GUARD — verify-relay-fill-records-idempotent (ACCT-F11107)
// fuel.relay_fill_records failed every run on fuel_tx_source_row_hash_uk duplicate keys: a fill whose line already had its
// (voided) record was handed to the writer again. Static pins on the worker: the document list leaves out fills whose line
// hash is taken, a 23505 on that index is "already_recorded", and the job throws only for an unexplained non-link.
import { readFileSync } from "node:fs";

const LABEL = "verify-relay-fill-records-idempotent";
const SVC = "apps/backend/src/fuel/fuel-expense-document.service.ts";
const HOOK = "apps/backend/src/fuel/fuel-ingest-hooks.ts";

export function check(svc, hook) {
  const errs = [];
  const list = svc.slice(svc.indexOf("export async function listRelayFillDocumentsWithoutRecords"), svc.indexOf("export async function recordAndLinkRelayFillDocument"));
  if (!/fv\.source_row_hash = 'relay-line:' \|\| e\.operating_company_id::text \|\| ':' \|\| l\.id::text/.test(list)) errs.push("listRelayFillDocumentsWithoutRecords no longer excludes fills whose line source_row_hash already has a record");
  if (!/export function isRelayLineAlreadyRecordedError/.test(svc) || !/fuel_tx_source_row_hash_uk/.test(svc)) errs.push("isRelayLineAlreadyRecordedError (23505 on fuel_tx_source_row_hash_uk) missing");
  if (!/if \(isRelayLineAlreadyRecordedError\(err\)\) return \{ written: false, refused: null, already_recorded: true \}/.test(svc)) errs.push("recordRelayFillAtReceipt does not treat the duplicate-key as already_recorded");
  if (!/outcome: "already_recorded"/.test(svc)) errs.push("recordAndLinkRelayFillDocument has no already_recorded outcome");
  if (!/relayFillRunVerdict\(results\)/.test(hook)) errs.push("fuel.relay_fill_records does not use relayFillRunVerdict");
  if (/relay_fill_records_refused/.test(hook)) errs.push("fuel.relay_fill_records throws relay_fill_records_refused again (a named refusal must not fail the run)");
  return errs;
}

function selftest() {
  const svc = readFileSync(SVC, "utf8");
  const hook = readFileSync(HOOK, "utf8");
  const planted = [
    ["list exclusion removed", svc.replace("fv.source_row_hash = 'relay-line:'", "fv.source_row_hash = 'x'"), hook],
    ["23505 skip removed", svc.replace("if (isRelayLineAlreadyRecordedError(err))", "if (false)"), hook],
    ["refusal throws again", svc, hook + "\nthrow new Error(`relay_fill_records_refused`)"],
    ["verdict unused", svc, hook.replace("relayFillRunVerdict(results)", "[]")],
  ];
  let bad = 0;
  for (const [name, s, h] of planted) {
    if (check(s, h).length === 0) { console.error(`${LABEL} --selftest FAIL — planted defect not caught: ${name}`); bad += 1; }
  }
  if (check(svc, hook).length) { console.error(`${LABEL} --selftest FAIL — clean tree flagged: ${check(svc, hook).join("; ")}`); bad += 1; }
  if (bad) { process.exitCode = 1; return; }
  console.log(`${LABEL} --selftest PASS — ${planted.length}/${planted.length} planted defects caught, live tree clean`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const errs = check(readFileSync(SVC, "utf8"), readFileSync(HOOK, "utf8"));
  if (errs.length) { console.error(`${LABEL}: FAIL\n - ${errs.join("\n - ")}`); process.exitCode = 1; }
  else console.log(`${LABEL}: PASS`);
}
