#!/usr/bin/env node
/**
 * BREAKEVEN-INCLUDES-SAMPLE-DATA — the break-even rate a dispatcher prices real freight against was
 * computed over sample/test loads on the miles + load-count + loads-revenue leg, because
 * `break-even.service.ts`'s loads query filtered `soft_deleted_at` / `status` but never
 * `is_sample_data`. Live proof (2026-08-11): a single $2,450 sample GL line was 27% of the fixed-cost
 * base rendered on `/finance/break-even` for USMCA.
 *
 * FIX: the loads-side query (readLoadMiles) now excludes `is_sample_data = true` — that column is
 * derived reliably at load creation (book-load.service.ts FAIL-D6), unlike the GL-side equivalent
 * (journal_entries.is_sample_data, proven unreliable in the same trace — see the code comment in
 * break-even.service.ts and board row ACCT-F353). The GL leg is deliberately NOT filtered yet, and
 * the disclaimer string says so honestly rather than pretending the report is fully clean.
 *
 * INVARIANTS (static — no database, runs in every CI context including fresh-DB):
 *   A. the loads-side SELECT filters `is_sample_data` in its WHERE clause.
 *   B. the disclaimer string still names the GL-side gap (so a future filter on the GL leg is a
 *      deliberate edit to this string, not a silent claim of "fully clean" while the flag is still
 *      unreliable).
 *
 * Self-test: node scripts/verify-steps/3097-verify-breakeven-excludes-sample-loads.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "3097-verify-breakeven-excludes-sample-loads";
const FILE = path.join("apps", "backend", "src", "accounting", "break-even.service.ts");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  // Strips JS /* */ and // comments, plus SQL `-- ...` line comments living inside template
  // literals — the latter matters here because the loads query carries explanatory SQL comments
  // that themselves mention is_sample_data; without stripping them a mutation that removes the
  // real filter line would still "pass" by matching the comment above it.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
}

export function checkBreakEven(src) {
  const errors = [];
  const code = stripComments(src);

  const start = code.indexOf("FROM mdata.loads l");
  const end = code.indexOf("`,", start);
  const loadsQuery = start >= 0 && end > start ? code.slice(start, end) : "";
  if (!loadsQuery) {
    errors.push("could not isolate the mdata.loads SELECT in readLoadMiles — file shape changed");
    return errors;
  }
  if (!/is_sample_data/.test(loadsQuery)) {
    errors.push("readLoadMiles' mdata.loads query no longer filters is_sample_data");
  }

  if (!/GL revenue and expense lines may still include untagged sample entries/.test(src)) {
    errors.push("disclaimer no longer names the GL-side sample-data gap — do not claim the report is fully clean until the GL leg is actually filtered");
  }

  return errors;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const good = checkBreakEven(real);
  if (good.length !== 0) fail(`selftest baseline: real file should pass but does not — ${JSON.stringify(good)}`);

  const noFilter = real.replace(/^.*AND COALESCE\(l\.is_sample_data, false\) = false.*\n/m, "");
  const badA = checkBreakEven(noFilter);
  if (!badA.length) fail("selftest mutation A (is_sample_data filter removed from loads query) did not fail — invariant A is inert");

  const noDisclaimer = real.replace(/GL revenue and expense lines may still include untagged sample entries[^"]*/, "");
  const badB = checkBreakEven(noDisclaimer);
  if (!badB.length) fail("selftest mutation B (GL-gap disclaimer text removed) did not fail — invariant B is inert");

  console.log(`[${LABEL}] selftest: PASS — both mutations caught`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const errors = checkBreakEven(src);
if (errors.length) {
  console.error(`[${LABEL}] FAIL:`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — break-even loads leg excludes sample data; GL-side gap still honestly disclaimed`);
