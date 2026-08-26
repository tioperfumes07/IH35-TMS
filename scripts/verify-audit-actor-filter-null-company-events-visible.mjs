#!/usr/bin/env node
// AUDIT-ACTOR-FILTER-NULL-COMPANY-EVENTS-INVISIBLE — guard
//
// buildAuditEventsListQuery's base company predicate (`(e.payload->>'operating_company_id')::uuid
// = $1::uuid`) is unconditional — `NULL = $1` is never true in SQL, so a user whose ENTIRE audit
// trail is company-agnostic events (login, password reset — written before/outside company
// selection) shows a permanent, indistinguishable-from-honest "no events" on their own Activity
// tab. Live-reproduced 2026-08-26: mcastillo@tioperfumes.com had 2 real audit.audit_events rows
// (both NULL-company), the endpoint returned total_count: 0 even with the exact-uuid actor
// already correctly wired (the sibling USER-ACTIVITY-AUDIT-REVERSE-FALSE-EMPTY fix).
//
// FIX: the base predicate widens to also admit a NULL-company row ONLY when the query is already
// narrowed to one specific, known-by-exact-uuid actor (never for an absent actor or a free-text /
// ILIKE email search) — so no other caller of this shared endpoint gains cross-company visibility.
//
// This guard fails if the widening disappears, or if it stops being conditioned on the exact-uuid
// actor narrowing (which would make it an unconditional cross-company leak).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/backend/src/audit/audit-events-list.routes.ts";

export function check(text) {
  const failures = [];

  if (!/const UUID_RE\s*=\s*\/\^\[0-9a-f\]/.test(text)) {
    failures.push("UUID_RE pattern for detecting an exact-uuid actor is missing");
  }

  if (!/let actorExactUuidParamIndex: number \| undefined;/.test(text)) {
    failures.push("actorExactUuidParamIndex bookkeeping variable is missing");
  }

  const actorIdx = text.indexOf("if (input.actor) {");
  if (actorIdx === -1) {
    failures.push("could not find the input.actor filter block");
  } else {
    const actorBlock = text.slice(actorIdx, actorIdx + 1800);
    if (!/if \(UUID_RE\.test\(input\.actor\)\) actorExactUuidParamIndex = values\.length;/.test(actorBlock)) {
      failures.push(
        "actor block no longer records actorExactUuidParamIndex only when input.actor is an exact uuid — " +
          "widening a NULL-company predicate off a non-uuid (free-text/email) actor would be a cross-company leak"
      );
    }
  }

  const widenIdx = text.indexOf("filters.unshift(");
  if (widenIdx === -1) {
    failures.push("base company predicate is no longer assembled via filters.unshift() — the deferred-assembly this fix depends on is gone");
  } else {
    const widenBlock = text.slice(widenIdx, widenIdx + 500);
    if (!/actorExactUuidParamIndex\s*$/m.test(widenBlock) && !/actorExactUuidParamIndex\s*\?/.test(widenBlock)) {
      failures.push("base predicate no longer branches on actorExactUuidParamIndex");
    }
    if (!/\(e\.payload->>'operating_company_id'\)::uuid = \$1::uuid OR/.test(widenBlock)) {
      failures.push("widened predicate no longer preserves the strict `= $1::uuid` branch as its first OR arm — a real, non-matching company's rows must still be excluded");
    }
    if (!/\(e\.payload->>'operating_company_id'\) IS NULL AND e\.actor_user_uuid::text = \$\$\{actorExactUuidParamIndex\}/.test(widenBlock)) {
      failures.push("widened predicate no longer requires BOTH NULL company AND an exact actor_user_uuid match — either half missing would over-widen");
    }
    // The non-widened fallback must be the exact original strict predicate (regression-proofs the
    // no-actor / non-uuid-actor path stays byte-identical to pre-fix behavior).
    if (!/:\s*`\(e\.payload->>'operating_company_id'\)::uuid = \$1::uuid`/.test(widenBlock)) {
      failures.push("the non-widened (no exact-uuid actor) fallback branch no longer matches the original strict predicate exactly");
    }
  }

  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: audit-actor-filter-null-company-events-visible");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: base company predicate widens for NULL-company events ONLY when narrowed to one exact-uuid actor");
}

async function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");

  // Offender 1: revert to the pre-fix unconditional strict predicate (the original live bug).
  const offenderNoWidening = text.replace(
    /filters\.unshift\(\s*actorExactUuidParamIndex[\s\S]*?\);/,
    "filters.unshift(`(e.payload->>'operating_company_id')::uuid = $1::uuid`);"
  );
  if (offenderNoWidening === text) {
    console.error("FAIL(selftest): offender-1 mutation did not change the source — pattern out of sync");
    process.exit(1);
  }
  const f1 = check(offenderNoWidening);
  if (f1.length === 0) {
    console.error("FAIL(selftest): planted no-widening regression (reverts to the exact original live bug) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression (widening removed, live bug reintroduced) correctly caught");

  // Offender 2: widen unconditionally (drop the actor-uuid narrowing) — a cross-company leak.
  const offenderUnconditional = text.replace(
    /if \(UUID_RE\.test\(input\.actor\)\) actorExactUuidParamIndex = values\.length;/,
    "actorExactUuidParamIndex = values.length;"
  );
  if (offenderUnconditional !== text) {
    const f2 = check(offenderUnconditional);
    if (f2.length === 0) {
      console.error("FAIL(selftest): planted unconditional-widening offender (would widen even for a free-text actor) was NOT caught");
      process.exit(1);
    }
    console.log("PASS(selftest): planted regression (widening no longer gated on exact-uuid) correctly caught");
  }

  console.log("PASS: selftest 2/2 planted offenders caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  run();
}
