#!/usr/bin/env node
/**
 * GUARD — verify-user-activity-audit-actor-filter
 *
 * USER-ACTIVITY-AUDIT-REVERSE-FALSE-EMPTY: buildAuditEventsListQuery's `actor` filter used ONE
 * wildcard-wrapped parameter (`%${input.actor}%`) for BOTH branches of
 * `(u.email ILIKE $n OR e.actor_user_uuid::text = $n)`. The ILIKE branch needs the wildcards
 * (partial email search); the `=` branch is exact equality, so a value literally containing `%`
 * characters can never equal a bare UUID string — the exact-actor-uuid lookup was permanently
 * dead code. The ONLY caller that ever passes a bare user uuid as `actor` is the User detail
 * page's own Activity tab (UserActivityTab.tsx passes `actor: userId`), so every user's own
 * Activity tab always showed "No audit activity found for this user" even with real rows.
 * Live-reproduced: a real Owner account (mcastillo@) with 2 real audit.audit_events rows for
 * their exact actor_user_uuid showed 0 rows in the UI before this fix.
 *
 * METHOD: static source-text assertion on audit-events-list.routes.ts. --selftest mutates the
 * REAL file and requires the offender to be caught.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-user-activity-audit-actor-filter";
const TARGET = "apps/backend/src/audit/audit-events-list.routes.ts";

export function check(text) {
  const problems = [];
  const idx = text.indexOf("if (input.actor) {");
  if (idx === -1) {
    problems.push("could not find the input.actor filter block.");
    return problems;
  }
  const block = text.slice(idx, idx + 1300);

  if (!/values\.push\(`%\$\{input\.actor\}%`, input\.actor\);/.test(block)) {
    problems.push("actor filter does not push two separate parameters (one wrapped for ILIKE, one raw for the exact-uuid match).");
  }
  if (!/u\.email ILIKE \$\$\{values\.length - 1\}/.test(block)) {
    problems.push("email ILIKE branch does not reference the wrapped (n-1) parameter.");
  }
  if (!/e\.actor_user_uuid::text = \$\$\{values\.length\}\)/.test(block)) {
    problems.push("actor_user_uuid exact-match branch does not reference the raw (final) parameter.");
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
  console.log(`${LABEL} OK — actor filter uses separate wrapped/raw parameters for its ILIKE and exact-uuid branches.`);
}

function selftest() {
  const real = readFileSync(TARGET, "utf8");
  const failures = [];

  const baseline = check(real);
  if (baseline.length) failures.push(`baseline (real fixed file) should pass, got: ${baseline.join(" | ")}`);

  // Offender: revert to the original single wildcard-wrapped parameter for both branches.
  const fixedNeedle = [
    "    values.push(`%${input.actor}%`, input.actor);",
    "    filters.push(`(u.email ILIKE $${values.length - 1} OR e.actor_user_uuid::text = $${values.length})`);",
  ].join("\n");
  const offenderReplacement = [
    "    values.push(`%${input.actor}%`);",
    "    filters.push(`(u.email ILIKE $${values.length} OR e.actor_user_uuid::text = $${values.length})`);",
  ].join("\n");
  const offender = real.replace(fixedNeedle, offenderReplacement);
  if (offender === real) failures.push("offender mutation did not change the file — guard's own needle may be stale.");
  const p = check(offender);
  if (p.length === 0) {
    failures.push("offender (reverted to single wrapped parameter) NOT caught: guard still passed.");
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — offender caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
