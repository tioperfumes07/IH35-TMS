#!/usr/bin/env node
/**
 * GUARD — verify-wo-auto-bill-posts-gl
 *
 * WO-AUTO-BILL-NEVER-POSTS-GL-JE: autoCreateBillFromWO() (two-section-service.ts) inserted the
 * WO-auto-created Bill with status='draft' and never set the legacy `vendor_id` (text) column,
 * and never called any poster. Two independent effects, both fixed here, both by reuse only:
 *
 *   1. LV-060 (posting-engine.service.ts) REFUSES to post any bill with status='draft' ("a draft
 *      is not yet an approved liability"). Wiring a poster call without also fixing the insert
 *      status would have silently no-op'd forever. Fixed: insert status='unpaid', the SAME
 *      finalized status the canonical manual Bill-create path (bills.service.ts createBill())
 *      always uses.
 *   2. vendor_id (text) was never set, only vendor_uuid/mdata_vendor_id — the scenario.maintenance
 *      probe joins on `b.vendor_id = w.vendor_id::text`, which NULL can never satisfy. Fixed:
 *      populate vendor_id from the SAME resolved vendor subquery already used for vendor_uuid.
 *   3. No poster was ever called. Cannot call postBillGlIfEnabled directly (bill-gl.service.ts) —
 *      it opens its OWN connection (postSourceTransaction), which cannot see this bill row until
 *      the caller's own open transaction commits (the same cross-connection READ-COMMITTED
 *      visibility bug already fixed for the revenue latch and for this file's sibling
 *      autoCreateExpenseFromWO). Fixed: postSourceTransactionInClientTx, gated by
 *      BILL_GL_POSTING_ENABLED, run in the caller's own open transaction, non-fatal on
 *      PostingEngineError (matches the canonical route's own contract).
 *
 * METHOD: static source-text assertions on two-section-service.ts. --selftest mutates the REAL
 * file and requires every assertion to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-wo-auto-bill-posts-gl";
const TARGET = "apps/backend/src/maintenance/two-section-service.ts";

export function check(text) {
  const problems = [];
  const fnStart = text.indexOf("export async function autoCreateBillFromWO");
  if (fnStart === -1) {
    problems.push("could not find autoCreateBillFromWO in the file.");
    return problems;
  }
  const fnEnd = text.indexOf("export async function autoCreateExpenseFromWO");
  const fn = fnEnd === -1 ? text.slice(fnStart) : text.slice(fnStart, fnEnd);

  if (!/vendor_id, vendor_uuid, mdata_vendor_id/.test(fn)) {
    problems.push("INSERT column list does not include vendor_id alongside vendor_uuid/mdata_vendor_id.");
  }
  if (!/\(SELECT v\.id::text FROM mdata\.vendors v/.test(fn)) {
    problems.push("vendor_id is not resolved from the same mdata.vendors subquery as vendor_uuid.");
  }
  if (!/'unpaid',\s*\n\s*CURRENT_DATE,/.test(fn)) {
    problems.push("bill status is not inserted as 'unpaid' (LV-060 refuses to post status='draft').");
  }
  if (/'draft',\s*\n\s*CURRENT_DATE,/.test(fn)) {
    problems.push("bill status still inserts 'draft' — LV-060 will refuse to post it, forever.");
  }
  if (!/RETURNING id, operating_company_id/.test(fn)) {
    problems.push("INSERT does not RETURNING operating_company_id (needed for the poster call).");
  }
  if (!/postSourceTransactionInClientTx\(\s*\n\s*client as never,\s*\n\s*\{ operating_company_id: billOperatingCompanyId, source_transaction_type: "bill", source_transaction_id: billId \}/.test(fn)) {
    problems.push("does not call postSourceTransactionInClientTx with source_transaction_type 'bill' in the caller's own transaction.");
  }
  if (/postBillGlIfEnabled\(/.test(fn)) {
    problems.push("calls postBillGlIfEnabled directly — that opens a new connection and cannot see this uncommitted bill row.");
  }
  if (!/WO_BILL_GL_POSTING_FLAG_KEY/.test(fn) || !/isEnabled\(client as never, WO_BILL_GL_POSTING_FLAG_KEY/.test(fn)) {
    problems.push("posting call is not gated by the BILL_GL_POSTING_ENABLED flag.");
  }
  if (!/if \(!\(err instanceof PostingEngineError\)\) throw err;/.test(fn)) {
    problems.push("posting failure is not caught non-fatally (a WO create must never 500 on a posting failure).");
  }
  return problems;
}

function run() {
  const text = readFileSync(TARGET, "utf8");
  const problems = check(text);
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — autoCreateBillFromWO inserts status='unpaid' + vendor_id, and posts the GL JE in-transaction, gated and non-fatal.`);
}

function selftest() {
  const real = readFileSync(TARGET, "utf8");
  const failures = [];

  const baseline = check(real);
  if (baseline.length) failures.push(`baseline (real fixed file) should pass, got: ${baseline.join(" | ")}`);

  // Offender 1: revert status back to 'draft' (the original bug — silently unpostable forever).
  const o1 = real.replace("'unpaid',\n        CURRENT_DATE,", "'draft',\n        CURRENT_DATE,");
  const p1 = check(o1);
  if (!p1.some((m) => m.includes("LV-060 will refuse")) && !p1.some((m) => m.includes("not inserted as 'unpaid'"))) {
    failures.push(`offender-1 (status reverted to draft) NOT caught: ${p1.join(" | ") || "none"}`);
  }

  // Offender 2: remove vendor_id from the column list (original bug).
  const o2 = real.replace("vendor_id, vendor_uuid, mdata_vendor_id", "vendor_uuid, mdata_vendor_id");
  const p2 = check(o2);
  if (!p2.some((m) => m.includes("does not include vendor_id"))) {
    failures.push(`offender-2 (missing vendor_id column) NOT caught: ${p2.join(" | ") || "none"}`);
  }

  // Offender 3: swap the in-tx poster for the direct (wrong-connection) call.
  const o3 = real.replace(
    /await postSourceTransactionInClientTx\(\s*\n\s*client as never,\s*\n\s*\{ operating_company_id: billOperatingCompanyId, source_transaction_type: "bill", source_transaction_id: billId \},\s*\n\s*\{ userId \}\s*\n\s*\);/,
    'await postBillGlIfEnabled(billOperatingCompanyId, billId, { userId });'
  );
  const p3 = check(o3);
  if (!p3.some((m) => m.includes("cross-connection") || m.includes("cannot see"))) {
    failures.push(`offender-3 (wrong-connection poster call) NOT caught: ${p3.join(" | ") || "none"}`);
  }

  // Offender 4: remove the non-fatal PostingEngineError catch (would 500 the WO create on a post failure).
  const o4 = real.replace("if (!(err instanceof PostingEngineError)) throw err;\n        await appendCrudAudit(", "await appendCrudAudit(");
  const p4 = check(o4);
  if (!p4.some((m) => m.includes("not caught non-fatally"))) {
    failures.push(`offender-4 (missing non-fatal catch) NOT caught: ${p4.join(" | ") || "none"}`);
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 4/4 offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
