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
 *   4. LEAD 443.129 D / Codex AJK-08 — a caller whose document is financially complete only when its
 *      bill is posted (a road-service ticket becomes 'invoiced') passes requirePosted: the bill posts
 *      in the same transaction OR NOTHING is written. On that path a PostingEngineError propagates
 *      (never caught-and-logged), and a company whose BILL_GL_POSTING_ENABLED is OFF is refused up
 *      front (WoBillGlPostingDisabledError). The road-service create-wo passes requirePosted and its
 *      route surfaces both refusals by name (409 / 422). Callers without requirePosted keep the
 *      documented non-fatal contract (an unposted, retriable bill; the function reports posted=false).
 *
 * METHOD: static source-text assertions on two-section-service.ts, road-service/wo-integration.ts and
 * road-service/tickets.routes.ts. --selftest mutates the REAL files and requires every assertion to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-wo-auto-bill-posts-gl";
const TARGET = "apps/backend/src/maintenance/two-section-service.ts";
const WOI = "apps/backend/src/maintenance/road-service/wo-integration.ts";
const ROUTES = "apps/backend/src/maintenance/road-service/tickets.routes.ts";

/** 443.129 D / AJK-08 — the road-service ticket posts or nothing. */
export function checkPostsOrNothing(text, woi, routes) {
  const problems = [];
  const fnStart = text.indexOf("export async function autoCreateBillFromWO");
  const fn = fnStart === -1 ? "" : text.slice(fnStart, text.indexOf("export async function autoCreateExpenseFromWO", fnStart));
  if (!/if \(!flagOn && opts\?\.requirePosted\) \{\s*throw new WoBillGlPostingDisabledError\(/.test(fn)) {
    problems.push("a requirePosted caller is not refused when BILL_GL_POSTING_ENABLED is off (a deferred posting would leave an invoiced document on an unposted bill).");
  }
  const strictStart = fn.indexOf("if (flagOn && opts?.requirePosted) {");
  const strictEnd = fn.indexOf("} else if (flagOn) {", strictStart);
  const strict = strictStart === -1 || strictEnd === -1 ? "" : fn.slice(strictStart, strictEnd);
  if (!strict || !/postSourceTransactionInClientTx\(/.test(strict)) {
    problems.push("the requirePosted branch does not post the bill in the caller's transaction.");
  } else if (/\bcatch\b/.test(strict)) {
    problems.push("the requirePosted branch catches the posting error — a refusal must propagate, never be caught-and-logged.");
  }
  if (!/autoCreateBillFromWO\([\s\S]{0,400}requirePosted: true/.test(woi)) {
    problems.push("road-service create-wo does not pass requirePosted: true — the ticket would be invoiced on an unposted bill.");
  }
  if (!/WoBillGlPostingDisabledError\)\s*\{\s*return reply\.code\(409\)/.test(routes) || !/PostingEngineError\)\s*\{\s*return reply\.code\(422\)/.test(routes)) {
    problems.push("the create-wo route does not surface the posting refusals by name (409 disabled / 422 refused).");
  }
  return problems;
}

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
  const problems = [...check(text), ...checkPostsOrNothing(text, readFileSync(WOI, "utf8"), readFileSync(ROUTES, "utf8"))];
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — autoCreateBillFromWO inserts status='unpaid' + vendor_id, and posts the GL JE in-transaction, gated and non-fatal; the road-service ticket posts or nothing (443.129 D).`);
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

  // 443.129 D offenders.
  const woi = readFileSync(WOI, "utf8");
  const routes = readFileSync(ROUTES, "utf8");
  const base2 = checkPostsOrNothing(real, woi, routes);
  if (base2.length) failures.push(`baseline posts-or-nothing should pass, got: ${base2.join(" | ")}`);
  const o5 = real.replace(/if \(!flagOn && opts\?\.requirePosted\) \{\s*throw new WoBillGlPostingDisabledError\(billOperatingCompanyId\);\s*\}/, "");
  if (!checkPostsOrNothing(o5, woi, routes).some((m) => m.includes("not refused when BILL_GL_POSTING_ENABLED is off"))) failures.push("offender-5 (flag-off requirePosted not refused) NOT caught");
  const o6 = real.replace(
    /(if \(flagOn && opts\?\.requirePosted\) \{\s*)(await postSourceTransactionInClientTx\([\s\S]*?\);)/,
    "$1try { $2 } catch (err) { if (!(err instanceof PostingEngineError)) throw err; }"
  );
  if (!checkPostsOrNothing(o6, woi, routes).some((m) => m.includes("catches the posting error"))) failures.push("offender-6 (requirePosted posting swallowed) NOT caught");
  const o7 = woi.replace("requirePosted: true", "requirePosted: false");
  if (!checkPostsOrNothing(real, o7, routes).some((m) => m.includes("does not pass requirePosted"))) failures.push("offender-7 (road-service without requirePosted) NOT caught");
  const o8 = routes.replace("return reply.code(422)", "return reply.code(500)");
  if (!checkPostsOrNothing(real, woi, o8).some((m) => m.includes("surface the posting refusals"))) failures.push("offender-8 (refusal not surfaced by name) NOT caught");

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 8/8 offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
