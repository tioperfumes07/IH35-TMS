#!/usr/bin/env node
/**
 * verify-fixed-asset-half-year-convention (FIN-21 / ASC 360)  — GUARD-FIRST, RED BY DESIGN
 *
 * THE DEFECT. accounting.fixed_assets.convention accepts exactly four values (DB CHECK, prod-verified
 * 2026-07-27): half_month · mid_month · half_year · full_month. But the first-period proration in
 * apps/backend/src/accounting/fixed-assets.math.ts is decided by:
 *
 *     const halfFirst = a.convention === "half_month" || a.convention === "mid_month";
 *
 * `half_year` is ABSENT, so an asset booked half-year takes a FULL first period — the opposite of what
 * the convention means. Half-year exists to take HALF a year in year 1.
 *
 * WHY IT MATTERS NOW. accounting.fixed_assets has 0 rows, so nobody has been burned yet. half_year is
 * the standard fleet default and the one chosen for the 87-unit TRK backfill, so the moment a create
 * path exists this becomes 87 wrong schedules: year 1 overstated by ~six months of depreciation, the
 * final year understated by the same. fixed-assets.math.ts is shared with the FIN-21 GL poster by its
 * own header ("single source of truth"), so the wrong figure would also POST.
 *
 * WHY THIS GUARD IS RED ON MAIN. Guard-first, the repo standard (cf. #3579 / #3580): the failing guard
 * lands BEFORE the fix so the defect cannot be shipped past. It is EXPECTED to fail until the math is
 * corrected. Do not relax the assertion and do not allowlist it — a live 42703 was silenced exactly
 * that way in verify-sql-column-existence.allowlist.json earlier today.
 *
 * WHAT THE FIX MUST DO (spec for the GL-math owner; NOT applied here — depreciation math is Cursor's
 * lane). The schedule is MONTHLY, so simply adding "half_year" to `halfFirst` is WRONG: that halves the
 * first MONTH, not the first YEAR. The treatment QBO / NetSuite / McLeod implement, and MACRS
 * half-year, is:
 *   - year 1 receives half of a full year's depreciation (i.e. 6 x the monthly amount);
 *   - the schedule extends ~6 months beyond useful_life_months so the tail absorbs the other half;
 *   - total depreciation over the whole life still equals cost - salvage, to the cent.
 *
 * ALSO RECORDED: the owner-facing guidance "use mid-quarter if >40% of the year's cost lands in Q4"
 * is UNIMPLEMENTABLE today — there is no mid_quarter value in the DB CHECK. Either the CHECK gains it
 * or the guidance is dropped; it cannot currently be stored.
 *
 * STATIC by design: it reads source text, so it runs under verify:static with no build and no DB
 * (the suite runs against a dead-port sentinel). The numeric behaviour belongs in a unit test that
 * runs after the math is fixed.
 *
 * Usage: node scripts/verify-fixed-asset-half-year-convention.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const MATH = "apps/backend/src/accounting/fixed-assets.math.ts";
/** Conventions the DB CHECK permits, prod-verified. */
const DB_CONVENTIONS = ["half_month", "mid_month", "half_year", "full_month"];

/** PURE: does the first-period proration account for `half_year`? */
export function handlesHalfYear(src) {
  // Find the proration predicate. Accept any shape that names half_year alongside the others —
  // a list, a Set, a switch, or a dedicated branch — so a correct fix is not forced into one style.
  const prorationLine = /const\s+halfFirst\s*=\s*([^;]+);/.exec(src);
  if (!prorationLine) return { ok: false, reason: "could not locate the `halfFirst` first-period proration predicate in fixed-assets.math.ts" };
  if (!/half_year/.test(prorationLine[1]) && !/half_year/.test(src.slice(0, prorationLine.index))) {
    return { ok: false, reason: `first-period proration ignores the half_year convention: halfFirst = ${prorationLine[1].trim()}` };
  }
  return { ok: true };
}

/** PURE: every convention the DB allows must be reachable somewhere in the math. */
export function unhandledConventions(src) {
  return DB_CONVENTIONS.filter((c) => !src.includes(c));
}

function read() {
  const abs = resolve(process.cwd(), MATH);
  if (!existsSync(abs)) {
    console.error(`FAIL: ${MATH} not found — if the math moved, update this guard rather than deleting the check`);
    process.exit(1);
  }
  return readFileSync(abs, "utf8");
}

function run() {
  const src = read();
  const problems = [];

  const hy = handlesHalfYear(src);
  if (!hy.ok) problems.push(hy.reason);

  const missing = unhandledConventions(src);
  if (missing.length) {
    problems.push(`the DB CHECK permits convention(s) the math never mentions: ${missing.join(", ")} — an asset can be stored that the schedule cannot price`);
  }

  if (problems.length) {
    console.error(`[verify-fixed-asset-half-year-convention] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error("\n  RED BY DESIGN until FIN-21 depreciation math handles half_year (see the header for the required treatment).");
    console.error("  Fix the math. Do NOT relax this assertion and do NOT allowlist it.");
    return false;
  }
  console.log(`[verify-fixed-asset-half-year-convention] OK — all ${DB_CONVENTIONS.length} DB conventions are handled, half_year included`);
  return true;
}

function selftest() {
  let ok = true;
  const cases = [
    ["current main (half_year omitted)", 'const halfFirst = a.convention === "half_month" || a.convention === "mid_month";', false],
    ["fixed (half_year named)", 'const halfFirst = a.convention === "half_month" || a.convention === "mid_month" || a.convention === "half_year";', true],
    ["fixed via a Set", 'const HALF = new Set(["half_month","mid_month","half_year"]);\nconst halfFirst = HALF.has(a.convention);', true],
  ];
  for (const [name, src, shouldPass] of cases) {
    const got = handlesHalfYear(src).ok;
    if (got !== shouldPass) {
      console.error(`SELFTEST FAIL: '${name}' expected ok=${shouldPass}, got ${got}`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' -> ok=${got} as expected`);
    }
  }
  // The predicate must be findable at all — a rename should fail loudly, not silently pass.
  if (handlesHalfYear("const somethingElse = true;").ok) {
    console.error("SELFTEST FAIL: a missing halfFirst predicate was treated as passing");
    ok = false;
  } else {
    console.log("SELFTEST: a missing/renamed predicate fails loudly rather than passing silently");
  }
  if (!ok) process.exit(1);
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
