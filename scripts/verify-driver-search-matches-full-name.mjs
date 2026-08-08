#!/usr/bin/env node
/**
 * GUARD: the driver list search must match the FULL name, not only the separate columns. ACCT-F203.
 *
 * THE DEFECT. GET /api/v1/mdata/drivers built its search filter as
 *   (first_name ILIKE $n OR last_name ILIKE $n OR cdl_number ILIKE $n)
 * so typing a driver's whole name — the single most natural thing a dispatcher does — matched
 * NOTHING. Verified on prod: '%Juan USMCA%' scores 0 against those three columns while
 * (first_name || ' ' || last_name) matches exactly one driver.
 *
 * WHY THAT MADE A DRIVER UNREACHABLE RATHER THAN MERELY INCONVENIENT. The list defaults to LIMIT 50
 * (max 200) and prod holds 92 USMCA / 96 TRANSP drivers. Past the cap, search is the ONLY way to
 * reach someone — and search was the broken part. The picker looked empty and Assign could not
 * proceed, which is how this surfaced as a dispatch blocker rather than a search annoyance.
 *
 * WHAT THE FIX MUST KEEP, and why this guard checks for the concatenation rather than for "a fix":
 *   · BOTH name orders. People type "Perez Juan" as readily as "Juan Perez" here.
 *   · NULL-SAFETY. last_name is nullable and 'Juan' || ' ' || NULL is NULL in SQL, so an unguarded
 *     concatenation would silently drop every driver missing a surname FROM THEIR OWN SEARCH —
 *     turning a broken search into a subtly wrong one, which is worse. Hence COALESCE is required
 *     here, not merely preferred.
 *
 * Run:  node scripts/verify-driver-search-matches-full-name.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/mdata/drivers.routes.ts";
const LABEL = "verify-driver-search-matches-full-name";

export function stripComments(src) {
  return src.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** A concatenation of first and last name in either order, used as an ILIKE target. */
export function hasFullNameMatch(src) {
  const clean = stripComments(src).replace(/\s+/g, " ");
  const fwd = /first_name\s*,?\s*'?'?\s*\)?\s*\|\|\s*' '\s*\|\|[^)]*last_name/i.test(clean);
  const rev = /last_name\s*,?\s*'?'?\s*\)?\s*\|\|\s*' '\s*\|\|[^)]*first_name/i.test(clean);
  return { forward: fwd, reverse: rev };
}

/** The concatenation must be NULL-safe or it drops surname-less drivers from their own search. */
export function concatIsNullSafe(src) {
  const clean = stripComments(src).replace(/\s+/g, " ");
  const concats = clean.match(/[^;]{0,160}\|\|\s*' '\s*\|\|[^;]{0,160}/gi) ?? [];
  const nameConcats = concats.filter((c) => /first_name/i.test(c) && /last_name/i.test(c));
  if (nameConcats.length === 0) return true; // nothing to judge; hasFullNameMatch reports the gap
  return nameConcats.every((c) => (c.match(/COALESCE/gi) ?? []).length >= 2);
}

export function collectProblems(src, file = TARGET) {
  const problems = [];
  const { forward, reverse } = hasFullNameMatch(src);
  if (!forward && !reverse) {
    problems.push(
      `${file}: the driver search filter never matches the concatenated full name. Searching ` +
        `"Juan USMCA" scores 0 against first_name/last_name/cdl_number individually — proven on ` +
        `prod — so typing a driver's whole name returns an empty picker. With the list capped at ` +
        `LIMIT 50 against 92+ drivers, search is the only way to reach someone past the cap (ACCT-F203).`
    );
  } else if (!forward || !reverse) {
    problems.push(
      `${file}: only ${forward ? "first+last" : "last+first"} is matched. Both orders are required — ` +
        `"Perez Juan" is typed as readily as "Juan Perez" (ACCT-F203).`
    );
  }
  if (!concatIsNullSafe(src)) {
    problems.push(
      `${file}: a first/last name concatenation is not NULL-safe. last_name is nullable and ` +
        `'Juan' || ' ' || NULL is NULL, so every driver without a surname would be dropped from ` +
        `their OWN search — a subtly wrong result rather than an obviously broken one. Wrap both ` +
        `sides in COALESCE (ACCT-F203).`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const OLD = "filters.push(`(first_name ILIKE $1 OR last_name ILIKE $1 OR cdl_number ILIKE $1)`)";
  const FIXED =
    "filters.push(`(first_name ILIKE $1 OR last_name ILIKE $1 OR cdl_number ILIKE $1" +
    " OR (COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) ILIKE $1" +
    " OR (COALESCE(last_name,'') || ' ' || COALESCE(first_name,'')) ILIKE $1)`)";

  if (collectProblems(OLD).length !== 1) failures.push("the ACCT-F203 defect verbatim was NOT caught");
  if (collectProblems(FIXED).length !== 0) failures.push("the corrected predicate was flagged");

  // One order only must still be reported.
  const oneOrder = "(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) ILIKE $1";
  if (collectProblems(oneOrder).length !== 1) failures.push("a single-order match was not reported");

  // NULL-unsafe concatenation is a DIFFERENT failure and must be caught even with both orders.
  const unsafe =
    "(first_name || ' ' || last_name) ILIKE $1 OR (last_name || ' ' || first_name) ILIKE $1";
  const unsafeProblems = collectProblems(unsafe);
  if (!unsafeProblems.some((p) => /NULL-safe/.test(p))) {
    failures.push("a NULL-unsafe concatenation was not caught");
  }

  // A comment describing the fix must not satisfy the check.
  if (collectProblems("// COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')\n" + OLD).length !== 1) {
    failures.push("a COMMENT describing the fix satisfied the check — false green");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 5/5 (defect caught, fix passes, single-order reported, NULL-unsafe concat ` +
      `caught, comment cannot fake a pass)`
  );
  process.exit(0);
}

const abs = path.join(root, TARGET);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL — ${TARGET} is missing; the driver search cannot be verified.`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(abs, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — driver search matches the full name in both orders, NULL-safely.`);
