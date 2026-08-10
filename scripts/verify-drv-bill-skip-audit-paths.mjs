#!/usr/bin/env node
/**
 * GUARD — DRV-BILL-SKIP-PATHS: every load-mutation path that can seat a driver AND every path that
 * can supply the pay inputs (miles_shortest / miles_practical / driver_pay_rate_per_mile) must
 * re-enter the SAME canonical idempotent driver-pay mint/skip-audit path
 * (`ensureDriverBillArtifactsForLoad`, `dispatch/book-load.service.ts`).
 *
 * BOARD CARD (GUARD-WORKORDERS.md, dispatch lane, "revenue recognized with NO driver cost and NO
 * recorded reason"): `LUSMCAFREIGHT-20260806-0001` posted revenue with an assigned driver, zero
 * driver payable, and zero skip audit. ACCT-F277 (#5125) closed the mdata-create and delivery-status
 * re-entry points. MILES-ON-BOOK (#5143/#5146) closed the Book Load wizard's own miles capture. NOT
 * covered until this guard: **Edit Load** (`PATCH /api/v1/dispatch/loads/:id`, backed by
 * `update-load.service.ts`) is the ONLY writer of `miles_shortest`/`miles_practical` on the mdata
 * generic-CRUD surface — `mdata/loads.routes.ts`'s own create/update Zod schemas carry NO miles
 * fields at all — and it can also change `assigned_primary_driver_id`/`team_id`. Before this guard's
 * fix, editing either AFTER a load was created never re-entered the mint/skip path: only a later
 * delivery-adjacent status transition did, so a load whose miles/driver were corrected AFTER it had
 * already reached a terminal delivered* status (a real workflow — POD arrives, dispatcher fills in
 * actual miles) could never mint or re-record its driver bill. That is the going-forward gap this PR
 * closes: `updateDispatchLoad` now calls `ensureDriverBillArtifactsForLoad` on every edit.
 *
 * NOT IN SCOPE (deliberately, named so a green run is not over-read):
 *   - Historical backfill of `miles_shortest` on already-created loads — inventing miles is forbidden
 *     (Rule 07 / hardline: never fabricate financial inputs). This is a going-forward wire only.
 *   - The EDI 204 inbound handler (`integrations/edi/.../inbound-204.handler.ts`) — verified it never
 *     writes `assigned_primary_driver_id` (no driver seated at tender-intake time), so it is out of
 *     scope for THIS guard by construction, not by exemption list. If it starts assigning a driver,
 *     `verify-load-creators-mint-or-audit-driver-pay.mjs` (the sibling static-scan guard) will catch it.
 *   - FE toast wiring for the Edit-Load outcome (BookLoadModalV4/DispatchKanban already toast the
 *     Book/delivery outcomes per MILES-ON-BOOK) — left as REMAINING in the PR, not silently dropped.
 *
 * Run:  node scripts/verify-drv-bill-skip-audit-paths.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-drv-bill-skip-audit-paths";

const UPDATE_LOAD_SERVICE = "apps/backend/src/dispatch/update-load.service.ts";
const BOOK_LOAD_SERVICE = "apps/backend/src/dispatch/book-load.service.ts";
const MDATA_LOADS_ROUTES = "apps/backend/src/mdata/loads.routes.ts";
const DISPATCH_LOADS_ROUTES = "apps/backend/src/dispatch/loads.routes.ts";

const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

function read(relPath, files) {
  if (files) {
    const hit = files.find((f) => f.rel === relPath);
    return hit ? hit.src : "";
  }
  const fp = path.join(root, relPath);
  return fs.existsSync(fp) ? fs.readFileSync(fp, "utf8") : "";
}

/**
 * The Edit Load re-entry point: `update-load.service.ts` must import the canonical mint/skip
 * function AND actually invoke it inside `updateDispatchLoad` (an import with no call site is the
 * exact "comment-only mention" defect the sibling guard's selftest already catches for the other
 * paths — asserted the same way here).
 */
export function collectEditLoadReentryProblems(files) {
  const problems = [];
  const code = strip(read(UPDATE_LOAD_SERVICE, files));
  if (!code) {
    problems.push(`${UPDATE_LOAD_SERVICE}: file not found.`);
    return problems;
  }
  if (!/import\s*\{[^}]*\bensureDriverBillArtifactsForLoad\b[^}]*\}\s*from\s*["']\.\/book-load\.service\.js["']/.test(code)) {
    problems.push(
      `${UPDATE_LOAD_SERVICE}: must import ensureDriverBillArtifactsForLoad from ./book-load.service.js — ` +
        `Edit Load is the only writer of miles_shortest on the mdata generic-CRUD surface and must re-enter ` +
        `the canonical driver-pay mint/skip path when it changes miles or the seated driver.`
    );
  }
  // Function-scoped: the call must live inside updateDispatchLoad, not merely be present anywhere
  // in the file (e.g. re-exported and never invoked).
  const fnMatch = code.match(/export async function updateDispatchLoad\s*\([\s\S]*?\n\}/);
  const fnBody = fnMatch ? fnMatch[0] : "";
  if (!fnBody) {
    problems.push(`${UPDATE_LOAD_SERVICE}: updateDispatchLoad function body not found (rename?).`);
  } else if (!fnBody.includes("ensureDriverBillArtifactsForLoad(")) {
    problems.push(
      `${UPDATE_LOAD_SERVICE}: updateDispatchLoad() must CALL ensureDriverBillArtifactsForLoad(...) — an ` +
        `import with no call site leaves Edit Load unable to mint/audit driver pay after a miles/driver edit.`
    );
  }
  // The outcome must be surfaced on the result, not swallowed — mirrors book-load's own
  // driver_bill_mint field (MILES-ON-BOOK) so the caller/route can see mint vs skip vs no-op.
  // Scoped to the TYPE DECLARATION BLOCK specifically (not "anywhere in the file") — otherwise the
  // return statement's own `driver_bill_mint:` key would keep this check green even if the type
  // itself dropped the field, exactly the false-green mutation testing exists to catch.
  const resultTypeMatch = code.match(/export type UpdateDispatchLoadResult = \{[\s\S]*?\n\};/);
  const resultTypeBlock = resultTypeMatch ? resultTypeMatch[0] : "";
  if (!resultTypeBlock) {
    problems.push(`${UPDATE_LOAD_SERVICE}: UpdateDispatchLoadResult type declaration not found (renamed?).`);
  } else if (!resultTypeBlock.includes("driver_bill_mint")) {
    problems.push(
      `${UPDATE_LOAD_SERVICE}: UpdateDispatchLoadResult must carry driver_bill_mint — swallowing the ` +
        `outcome recreates the exact silence (MILES-ON-BOOK) this guard exists to prevent.`
    );
  }
  return problems;
}

/**
 * Canonical function must still exist and still refuse to derive pay from the customer rate — this
 * re-asserts the invariant the new call site depends on (a call into a gutted function would be
 * false-green).
 */
export function collectCanonicalFunctionIntactProblems(files) {
  const problems = [];
  const code = strip(read(BOOK_LOAD_SERVICE, files));
  if (!code.includes("export async function ensureDriverBillArtifactsForLoad")) {
    problems.push(`${BOOK_LOAD_SERVICE}: ensureDriverBillArtifactsForLoad export missing.`);
  }
  if (!code.includes("skipped_no_pay_rate")) {
    problems.push(`${BOOK_LOAD_SERVICE}: skipped_no_pay_rate audit path missing from the canonical mint fn.`);
  }
  if (code.includes("bookLoadRateTotalCents(input.charges)") && /basePayCents\s*=\s*bookLoadRateTotalCents/.test(code)) {
    problems.push(
      `${BOOK_LOAD_SERVICE}: driver base pay must never be derived from the customer rate (ACCT-F63/WIRE-02).`
    );
  }
  return problems;
}

/**
 * The two re-entry points ACCT-F277 already closed (mdata create/delivery, dispatch transition)
 * must not regress while this PR is in flight — same assertions the sibling guard already makes,
 * re-checked here so this guard is a complete standalone picture of "does going-forward driver pay
 * ever go silent" rather than only the new Edit Load site.
 */
export function collectExistingReentryProblems(files) {
  const problems = [];
  const mdata = strip(read(MDATA_LOADS_ROUTES, files));
  const dispatch = strip(read(DISPATCH_LOADS_ROUTES, files));
  if (!mdata.includes("ensureDriverBillArtifactsForLoad")) {
    problems.push(`${MDATA_LOADS_ROUTES}: must call ensureDriverBillArtifactsForLoad (ACCT-F277 regression).`);
  }
  if (!dispatch.includes("ensureDriverBillArtifactsForLoad")) {
    problems.push(`${DISPATCH_LOADS_ROUTES}: transition must call ensureDriverBillArtifactsForLoad (ACCT-F277 regression).`);
  }
  return problems;
}

function readTree() {
  const rels = [UPDATE_LOAD_SERVICE, BOOK_LOAD_SERVICE, MDATA_LOADS_ROUTES, DISPATCH_LOADS_ROUTES];
  return rels.map((rel) => ({ rel, src: fs.readFileSync(path.join(root, rel), "utf8") }));
}

function collectAll(files) {
  return [
    ...collectEditLoadReentryProblems(files),
    ...collectCanonicalFunctionIntactProblems(files),
    ...collectExistingReentryProblems(files),
  ];
}

function selftest() {
  const cases = [];
  let pass = 0;

  // 1) Real tree must be green.
  {
    const problems = collectAll(null);
    if (problems.length === 0) pass += 1;
    else console.error("  selftest FAIL: real tree not green ->", problems);
    cases.push(1);
  }

  // 2) Strip the import -> must be caught.
  {
    const real = fs.readFileSync(path.join(root, UPDATE_LOAD_SERVICE), "utf8");
    const mutated = real.replace(
      /import\s*\{[^}]*\bensureDriverBillArtifactsForLoad\b[^}]*\}\s*from\s*["']\.\/book-load\.service\.js["'];?\n?/,
      ""
    );
    if (mutated === real) {
      console.error("  selftest FAIL: mutation #2 did not change the source (regex drifted)");
    } else {
      const problems = collectAll([{ rel: UPDATE_LOAD_SERVICE, src: mutated }]);
      if (problems.some((p) => p.includes("must import ensureDriverBillArtifactsForLoad"))) pass += 1;
      else console.error("  selftest FAIL: missing import not detected ->", problems);
    }
    cases.push(1);
  }

  // 3) Import present but call site removed (comment-only mention) -> must be caught.
  {
    const real = fs.readFileSync(path.join(root, UPDATE_LOAD_SERVICE), "utf8");
    const mutated = real.replace(
      /const driverBillMint = await ensureDriverBillArtifactsForLoad\(client, \{[\s\S]*?\}\);/,
      "const driverBillMint = null; // ensureDriverBillArtifactsForLoad(client, {...}) removed"
    );
    if (mutated === real) {
      console.error("  selftest FAIL: mutation #3 did not change the source (regex drifted)");
    } else {
      const problems = collectAll([{ rel: UPDATE_LOAD_SERVICE, src: mutated }]);
      if (problems.some((p) => p.includes("must CALL ensureDriverBillArtifactsForLoad"))) pass += 1;
      else console.error("  selftest FAIL: removed call site not detected ->", problems);
    }
    cases.push(1);
  }

  // 4) driver_bill_mint dropped from the result type -> must be caught.
  {
    const real = fs.readFileSync(path.join(root, UPDATE_LOAD_SERVICE), "utf8");
    const mutated = real.replace(
      /export type UpdateDispatchLoadResult = \{[\s\S]*?\n\};/,
      "export type UpdateDispatchLoadResult = {\n  load: Record<string, unknown>;\n  stops: Record<string, unknown>[];\n};"
    );
    if (mutated === real) {
      console.error("  selftest FAIL: mutation #4 did not change the source (regex drifted)");
    } else {
      const problems = collectAll([{ rel: UPDATE_LOAD_SERVICE, src: mutated }]);
      if (problems.some((p) => p.includes("must carry driver_bill_mint"))) pass += 1;
      else console.error("  selftest FAIL: dropped result field not detected ->", problems);
    }
    cases.push(1);
  }

  // 5) Canonical function gutted (no export) -> must be caught.
  {
    const bookReal = fs.readFileSync(path.join(root, BOOK_LOAD_SERVICE), "utf8");
    const mutated = bookReal.replace(
      "export async function ensureDriverBillArtifactsForLoad",
      "async function ensureDriverBillArtifactsForLoad"
    );
    if (mutated === bookReal) {
      console.error("  selftest FAIL: mutation #5 did not change the source (regex drifted)");
    } else {
      const files = readTree().map((f) => (f.rel === BOOK_LOAD_SERVICE ? { rel: f.rel, src: mutated } : f));
      const problems = collectAll(files);
      if (problems.some((p) => p.includes("export missing"))) pass += 1;
      else console.error("  selftest FAIL: gutted export not detected ->", problems);
    }
    cases.push(1);
  }

  // 6) ACCT-F277 mdata regression -> must be caught.
  {
    const files = readTree().map((f) =>
      f.rel === MDATA_LOADS_ROUTES ? { rel: f.rel, src: "export const noop = 1;" } : f
    );
    const problems = collectAll(files);
    if (problems.some((p) => p.includes(MDATA_LOADS_ROUTES))) pass += 1;
    else console.error("  selftest FAIL: mdata regression not detected ->", problems);
    cases.push(1);
  }

  // 7) ACCT-F277 dispatch-transition regression -> must be caught.
  {
    const files = readTree().map((f) =>
      f.rel === DISPATCH_LOADS_ROUTES ? { rel: f.rel, src: "export const noop = 1;" } : f
    );
    const problems = collectAll(files);
    if (problems.some((p) => p.includes(DISPATCH_LOADS_ROUTES))) pass += 1;
    else console.error("  selftest FAIL: dispatch transition regression not detected ->", problems);
    cases.push(1);
  }

  const total = cases.reduce((a, b) => a + b, 0);
  console.log(`${LABEL} selftest ${pass}/${total}`);
  return pass === total ? 0 : 1;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = collectAll(null);
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`${LABEL}: ok — Edit Load re-enters the canonical driver-pay mint/skip path`);
  return 0;
}

process.exit(main());
