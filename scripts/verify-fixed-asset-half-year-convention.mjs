#!/usr/bin/env node
/**
 * verify-fixed-asset-half-year-convention (FIN-21 / ASC 360 / FLT-02)
 *
 * Guards the shared FIN-21 schedule math in apps/backend/src/accounting/fixed-assets.math.ts.
 * Was RED BY DESIGN until FLT-02 landed the correct half_year treatment (not halfFirst).
 *
 * REQUIRED TREATMENT (QBO / NetSuite / McLeod / MACRS half-year):
 *   - year 1 receives half of a full year's depreciation (6 × monthly);
 *   - the schedule extends useful_life_months + 6 so the closing half-year sits in the tail;
 *   - total depreciation equals cost − salvage exactly.
 *
 * FORBIDDEN: folding half_year into `halfFirst` (that halves the first MONTH, not the first YEAR).
 *
 * Usage: node scripts/verify-fixed-asset-half-year-convention.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const MATH = "apps/backend/src/accounting/fixed-assets.math.ts";
/** Conventions the DB CHECK permits, prod-verified. */
const DB_CONVENTIONS = ["half_month", "mid_month", "half_year", "full_month"];

/**
 * PURE: half_year must be a dedicated convention path that extends the schedule by ~6 months.
 * Adding half_year to halfFirst is explicitly NOT a pass.
 */
export function handlesHalfYear(src) {
  const halfFirst = /const\s+halfFirst\s*=\s*([^;]+);/.exec(src);
  if (halfFirst && /half_year/.test(halfFirst[1])) {
    return {
      ok: false,
      reason:
        "half_year is folded into halfFirst — that halves the first MONTH, not the first YEAR. Use a dedicated half_year path (Y1 = 6× monthly, life+6).",
    };
  }
  const hasDedicated =
    /convention\s*===\s*["']half_year["']/.test(src) ||
    /case\s+["']half_year["']/.test(src) ||
    /["']half_year["']\s*===/.test(src);
  if (!hasDedicated) {
    return { ok: false, reason: "no dedicated half_year convention branch in fixed-assets.math.ts" };
  }
  const extendsLife =
    /useful_life_months\s*\+\s*6/.test(src) ||
    /\blife\s*\+\s*6\b/.test(src) ||
    /periods\s*=\s*[^\n;]*\+\s*6/.test(src);
  if (!extendsLife) {
    return {
      ok: false,
      reason: "half_year path does not extend the schedule by ~6 months (expected life + 6 / useful_life_months + 6)",
    };
  }
  return { ok: true };
}

/** PURE: every convention the DB allows must be reachable somewhere in the math. */
export function unhandledConventions(src) {
  return DB_CONVENTIONS.filter((c) => !src.includes(c));
}

/** PURE: unknown conventions must fail closed (not silently full-month). */
export function rejectsUnknownConvention(src) {
  const hasReject =
    /Unknown depreciation convention/.test(src) ||
    /FIXED_ASSET_CONVENTIONS/.test(src) ||
    /unsupported convention/i.test(src);
  return hasReject
    ? { ok: true }
    : { ok: false, reason: "math never rejects an unknown convention — mid_quarter (etc.) would silently full-month" };
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
    problems.push(
      `the DB CHECK permits convention(s) the math never mentions: ${missing.join(", ")} — an asset can be stored that the schedule cannot price`
    );
  }

  const unk = rejectsUnknownConvention(src);
  if (!unk.ok) problems.push(unk.reason);

  if (problems.length) {
    console.error(`[verify-fixed-asset-half-year-convention] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error("\n  Fix the math (Y1 = 6× monthly, life+6, total = cost−salvage). Do NOT fold half_year into halfFirst.");
    return false;
  }
  console.log(
    `[verify-fixed-asset-half-year-convention] OK — half_year dedicated path + life+6; all ${DB_CONVENTIONS.length} DB conventions handled`
  );
  return true;
}

function selftest() {
  let ok = true;
  const cases = [
    [
      "current main (half_year omitted)",
      'const halfFirst = a.convention === "half_month" || a.convention === "mid_month";',
      false,
    ],
    [
      "WRONG fix (half_year folded into halfFirst)",
      'const halfFirst = a.convention === "half_month" || a.convention === "mid_month" || a.convention === "half_year";',
      false,
    ],
    [
      "WRONG fix via Set",
      'const HALF = new Set(["half_month","mid_month","half_year"]);\nconst halfFirst = HALF.has(a.convention);',
      false,
    ],
    [
      "correct dedicated branch + life+6",
      `
        if (a.convention === "half_year") {
          const periods = life + 6;
        }
        const halfFirst = a.convention === "half_month" || a.convention === "mid_month";
      `,
      true,
    ],
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
  if (handlesHalfYear("const somethingElse = true;").ok) {
    console.error("SELFTEST FAIL: a missing half_year path was treated as passing");
    ok = false;
  } else {
    console.log("SELFTEST: a missing/renamed path fails loudly rather than passing silently");
  }
  if (!ok) process.exit(1);
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
