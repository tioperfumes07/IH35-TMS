#!/usr/bin/env node
/**
 * GO-0022-BANK-P7-W2-FAKE-SUCCESS — GO-0022 DRAIN /banking.
 *
 * apps/backend/src/banking/p7-wave2.routes.ts had 3 mutations that returned { ok: true } (and 2 of
 * them wrote a REAL audit-log entry claiming success) even when the target row didn't exist or
 * belonged to a different company:
 *   - POST /reconciliation-sessions/:id/finalize — `?? 0` coerced a MISSING row's variance into
 *     "safe to finalize", and the UPDATE that followed had no rowCount check either.
 *   - PATCH /rules/:id and DELETE /rules/:id — no RETURNING/rowCount check on the UPDATE at all.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const P7_WAVE2_FILE = "apps/backend/src/banking/p7-wave2.routes.ts";

function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function check(srcRaw) {
  const src = stripLineComments(srcRaw);
  const failures = [];

  // The specific fake-empty-row coercion this finding fixed.
  if (/\(ses\.rows\[0\][\s\S]{0,60}\?\?\s*0\)/.test(src)) {
    failures.push(`${P7_WAVE2_FILE}: the "?? 0" missing-row coercion reappeared on the reconciliation-session finalize path (GO-0022-BANK-P7-W2-FAKE-SUCCESS)`);
  }

  if (!/if \(!sessionRow\) \{/.test(src)) {
    failures.push(`${P7_WAVE2_FILE}: expected explicit missing-session 404 check not found — guard out of sync or fix reverted`);
  }

  const requiredAnchors = [
    "reconciliation_session_not_found",
    "banking_rule_not_found",
  ];
  const missingAnchors = requiredAnchors.filter((a) => !src.includes(a));
  if (missingAnchors.length > 0) {
    failures.push(`${P7_WAVE2_FILE}: expected 404 error code(s) not found — a fix site may have been reverted: ${missingAnchors.join(", ")}`);
  }

  // All 3 UPDATE sites this finding touched must carry RETURNING id.
  const updateReturningCount = (src.match(/UPDATE (banking\.reconciliation_sessions|accounting\.banking_rules)[\s\S]{0,300}?RETURNING id/g) ?? []).length;
  if (updateReturningCount < 3) {
    failures.push(`${P7_WAVE2_FILE}: only ${updateReturningCount} of the 3 expected UPDATE...RETURNING id sites found — a fix site may have been reverted`);
  }

  return failures;
}

function readSrc() {
  return fs.readFileSync(path.join(root, P7_WAVE2_FILE), "utf8");
}

function run() {
  const failures = check(readSrc());
  if (failures.length > 0) {
    console.error("FAIL: banking-p7-wave2-no-fake-success");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: p7-wave2 finalize/rules mutations stay honest about zero-rows-affected");
}

function selftest() {
  const src = readSrc();
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Offender A: reintroduce the "?? 0" missing-row coercion.
  const offenderA = src.replace(
    "const sessionRow = ses.rows[0] as { variance_cents?: string } | undefined;\n      if (!sessionRow) {\n        reply.code(404).send({ error: \"reconciliation_session_not_found\" });\n        return;\n      }\n      const variance = Number(sessionRow.variance_cents ?? 0);",
    "const variance = Number((ses.rows[0] as { variance_cents?: string } | undefined)?.variance_cents ?? 0);"
  );
  if (offenderA === src) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender A (?? 0 coercion reintroduced) was NOT caught");
    process.exit(1);
  }

  // Offender B: strip RETURNING from the rules PATCH update.
  const offenderB = src.replace(
    "WHERE id = $1 AND operating_company_id = $2::uuid\n          RETURNING id\n        `,\n        [params.data.id, body.data.operating_company_id, body.data.priority ?? null, body.data.is_active ?? null]",
    "WHERE id = $1 AND operating_company_id = $2::uuid\n        `,\n        [params.data.id, body.data.operating_company_id, body.data.priority ?? null, body.data.is_active ?? null]"
  );
  if (offenderB === src) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender B (RETURNING dropped from rules PATCH) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
