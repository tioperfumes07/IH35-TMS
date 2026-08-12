#!/usr/bin/env node
/**
 * DA-PROGRAM-ROUTES-500-MISSING-UUID-CAST — every safety.da_program_enrollments /
 * safety.da_test_records query in program.service.ts must scope operating_company_id with an
 * explicit `::uuid` cast, never a bare `$N` placeholder.
 *
 * ROOT CAUSE this closes: both tables declare operating_company_id UUID NOT NULL
 * (db/migrations/0327_drug_alcohol_program.sql), but 5 of the service's queries compared it against
 * a bare `$N` placeholder with no `::uuid` cast, and Postgres threw 42883 ("operator does not exist:
 * uuid = text") in production — reproduced live on 4 endpoint variants (Devin-A, prove lane) before
 * this fix, with a no-filter control ruling out the driver filter as the cause. Every
 * `/api/safety/drug-alcohol/*` list route consumed one of these queries, so the whole D&A program
 * surface was permanently dark.
 *
 * WHY THIS IS A STATIC CHECK, NOT A LIVE QUERY EXECUTION — tried the live route first and it is
 * deliberately NOT what ships here: an ad-hoc `pg.Client` connected directly to a plain local
 * Postgres.app instance (no connection pooler in front) correctly infers the `$N` parameter as uuid
 * from context EVEN WITHOUT an explicit cast — Postgres's own type inference papers over the exact
 * bug the live prod reproduction hit. Prod's connection almost certainly goes through a pooler
 * (Neon/PgBouncer-style transaction pooling, where prepared-statement/parameter-type behavior
 * differs from a bare unpooled connection), which is presumably why the cast matters there and not
 * in a quick local check. Since CI's own ephemeral DB (verify:local-ci / build-typecheck) is ALSO an
 * unpooled local Postgres, a live-query guard would pass regardless of whether the cast is present —
 * a false sense of coverage, not a real one. A static assertion on the SQL text itself does not have
 * that blind spot: it is exactly as strict wherever it runs.
 *
 * Narrowly scoped to program.service.ts's own known query blocks (not a repo-wide grep for
 * `= $1`, which would be noisy across hundreds of unrelated queries) — the same file this finding
 * named, five specific functions.
 */
import fs from "node:fs";

const LABEL = "verify-da-program-routes-uuid-scoped";
const FILE = "apps/backend/src/safety/drug-alcohol/program.service.ts";

// One entry per function, anchored on its own name so a future function can be added here
// deliberately rather than being silently skipped by a generic whole-file scan.
const FUNCTIONS = ["listEnrollments", "deactivateEnrollment", "listTestRecords", "recordResult", "flagPositive"];

function findFunctionBody(src, name) {
  const anchor = `export async function ${name}(`;
  const start = src.indexOf(anchor);
  if (start === -1) return null;

  // Bracket-match the PARAMETER LIST first (it can itself contain `{...}` type annotations, e.g.
  // `options: { driverUuid?: string } = {}` — jumping straight to the first `{` after the anchor,
  // as an earlier version of this function did, lands inside that type annotation instead of the
  // function body and silently truncates the extracted body before it ever reaches the SQL).
  const parenStart = src.indexOf("(", start);
  let parenDepth = 0;
  let parenEnd = -1;
  for (let i = parenStart; i < src.length; i++) {
    if (src[i] === "(") parenDepth++;
    else if (src[i] === ")") {
      parenDepth--;
      if (parenDepth === 0) {
        parenEnd = i;
        break;
      }
    }
  }
  if (parenEnd === -1) return null;

  // Now find the function BODY's opening brace — the first `{` after the parameter list closes
  // (skipping over any `: ReturnType` annotation in between, which is plain text here).
  const braceStart = src.indexOf("{", parenEnd);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  return null;
}

/** Every `operating_company_id = $N` occurrence that is NOT immediately followed by `::uuid`. */
function uncastOccurrences(body) {
  const re = /operating_company_id\s*=\s*\$\d+(::uuid)?/g;
  const bad = [];
  let match;
  while ((match = re.exec(body))) {
    if (!match[1]) bad.push(match[0]);
  }
  return bad;
}

export function check(src) {
  const problems = [];
  for (const name of FUNCTIONS) {
    const body = findFunctionBody(src, name);
    if (!body) {
      problems.push(`${name}(): function not found — was it renamed or removed?`);
      continue;
    }
    const bad = uncastOccurrences(body);
    if (bad.length > 0) {
      problems.push(`${name}(): ${bad.length} uncast operating_company_id comparison(s): ${bad.join(", ")}`);
    }
  }
  return problems;
}

function main() {
  const src = fs.readFileSync(FILE, "utf8");
  const problems = check(src);
  if (problems.length > 0) {
    console.error(`FAIL ${LABEL}: ${problems.length} issue(s) in ${FILE}:`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      "This is the exact class that 500'd every /api/safety/drug-alcohol/* list route in prod " +
        "(SQLSTATE 42883, operator does not exist: uuid = text) — cast every operating_company_id " +
        "comparison to ::uuid, do not rely on Postgres parameter-type inference under a pooled connection."
    );
    process.exit(1);
  }
  console.log(`PASS ${LABEL} — all ${FUNCTIONS.length} functions cast operating_company_id to ::uuid on every comparison.`);
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const clean = check(original);
  if (clean.length > 0) {
    console.error(`SELFTEST FAIL: current (should-be-fixed) source already has issues: ${JSON.stringify(clean)}`);
    process.exit(1);
  }
  console.log(`  ok: current source has 0 uncast comparisons across ${FUNCTIONS.length} functions`);

  let probesProven = 0;
  for (const name of FUNCTIONS) {
    const body = findFunctionBody(original, name);
    const bad = uncastOccurrences(body); // sanity: should be empty on the real file
    if (bad.length !== 0) {
      console.error(`SELFTEST SETUP FAILED: ${name}() already uncast before mutation.`);
      process.exit(1);
    }
    // Strip the cast from exactly this function's occurrence(s) and confirm detection fires.
    const mutatedBody = body.replace(/operating_company_id\s*=\s*(\$\d+)::uuid/g, "operating_company_id = $1");
    if (mutatedBody === body) {
      console.error(`SELFTEST SETUP FAILED: no ::uuid cast found to strip in ${name}().`);
      process.exit(1);
    }
    const mutatedSrc = original.replace(body, mutatedBody);
    const problems = check(mutatedSrc);
    const caught = problems.some((p) => p.startsWith(`${name}():`));
    if (!caught) {
      console.error(`SELFTEST INERT: stripping ${name}()'s ::uuid cast was not caught.`);
      process.exit(1);
    }
    probesProven++;
  }

  console.log(`PASS ${LABEL} --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  main();
}
