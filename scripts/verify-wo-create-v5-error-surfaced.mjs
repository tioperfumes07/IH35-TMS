#!/usr/bin/env node
/**
 * GUARD — MNT-F01: a V5 work-order body must get V5's validation errors, not the legacy schema's.
 *
 * THE DEFECT: POST /api/v1/maintenance/work-orders accepts two body shapes — the two-section V5
 * payload the Create WO modal actually sends, and a legacy flat one. The route tried V5 first and, on
 * failure, fell straight through to the legacy parse. So a V5 body with one bad field (a missing
 * Section-A line description) was re-validated against a schema it was never meant to satisfy, and the
 * caller was told "wo_type is required" for a body whose wo_type sits under `header`. The real error
 * was unreachable, which makes the failure unfixable without guessing.
 *
 * This is the validation equivalent of a swallowed exception: the system reports A problem, just not
 * the one that occurred.
 *
 * WHAT IT ENFORCES: the handler must shape-discriminate — detect V5's own keys and return the V5 error
 * — BEFORE any fallback to the legacy schema. Enforced by ORDER, because a discrimination that runs
 * after the fallback is no discrimination at all.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:wo-create-v5-error-surfaced";
const FILE = "apps/backend/src/maintenance/work-orders.routes.ts";

export function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function analyse(src) {
  const problems = [];
  if (src == null) return [`${FILE} is missing.`];
  const body = stripComments(src);

  const v5Parse = body.indexOf("createWorkOrderV5Schema.safeParse");
  if (v5Parse === -1) return [`${FILE}: the V5 parse is gone — this endpoint no longer accepts the shape the Create WO modal sends.`];

  const legacyParse = body.indexOf("createWorkOrderSchema.safeParse");
  if (legacyParse === -1) return problems; // no fallback at all — nothing to guard against

  // The discrimination: a check on V5's own keys that returns the V5 error.
  // The CONDITION itself must be exactly the two terms, in either order. An earlier version merely
  // required the tokens to co-occur, and `if (false && !v5Parsed.success && looksLikeV5)` satisfied it
  // — a guard green on a dead branch. Caught by mutation-testing against real source, not by reading.
  const guardRe =
    /if\s*\(\s*(?:!v5Parsed\.success\s*&&\s*looksLikeV5|looksLikeV5\s*&&\s*!v5Parsed\.success)\s*\)\s*\{[\s\S]{0,160}?validationError\s*\(\s*reply\s*,\s*v5Parsed\.error\s*\)/;
  const m = guardRe.exec(body);
  if (!m) {
    problems.push(
      `${FILE}: a V5-shaped body that fails V5 validation falls through to the LEGACY schema, so the ` +
        `caller receives errors about fields it never sent. Detect V5's keys (header/sectionA/sectionB) ` +
        `and return validationError(reply, v5Parsed.error) before the fallback.`
    );
    return problems;
  }

  if (m.index > legacyParse) {
    problems.push(
      `${FILE}: the V5 shape-check runs AFTER the legacy parse, so the legacy error still wins. ` +
        `A discrimination that runs after the fallback is not a discrimination.`
    );
  }
  return problems;
}

function selftest() {
  const failures = [];
  const t = (label, cond) => { if (!cond) failures.push(label); };

  const good =
    'const v5Parsed = createWorkOrderV5Schema.safeParse(req.body ?? {});\n' +
    'const looksLikeV5 = ["header","sectionA","sectionB"].some((k) => k in raw);\n' +
    'if (!v5Parsed.success && looksLikeV5) { return validationError(reply, v5Parsed.error); }\n' +
    'const parsed = createWorkOrderSchema.safeParse(req.body ?? {});';
  // THE REAL PRE-FIX STATE.
  const preFix =
    'const v5Parsed = createWorkOrderV5Schema.safeParse(req.body ?? {});\n' +
    'if (v5Parsed.success) { /* ... */ }\n' +
    'const parsed = createWorkOrderSchema.safeParse(req.body ?? {});';
  const wrongOrder =
    'const v5Parsed = createWorkOrderV5Schema.safeParse(req.body ?? {});\n' +
    'const parsed = createWorkOrderSchema.safeParse(req.body ?? {});\n' +
    'const looksLikeV5 = true; if (!v5Parsed.success && looksLikeV5) { return validationError(reply, v5Parsed.error); }';
  const noFallback = 'const v5Parsed = createWorkOrderV5Schema.safeParse(req.body ?? {});';

  t("the fixed shape passes", analyse(good).length === 0);
  t("falling through to the legacy schema FAILS", analyse(preFix).length === 1);
  t("a check placed after the legacy parse FAILS", analyse(wrongOrder).length === 1);
  t("no legacy fallback needs no guard", analyse(noFallback).length === 0);
  t("a missing file FAILS", analyse(null).length === 1);
  t("removing the V5 parse entirely FAILS", analyse("const parsed = createWorkOrderSchema.safeParse(x);").length === 1);
  t("a DISABLED branch does not satisfy it (the real mutation miss)",
    analyse(good.replace("if (!v5Parsed.success && looksLikeV5)", "if (false && !v5Parsed.success && looksLikeV5)")).length === 1);
  t("the reversed condition order still passes",
    analyse(good.replace("!v5Parsed.success && looksLikeV5", "looksLikeV5 && !v5Parsed.success")).length === 0);
  t("a COMMENT describing the fix does not satisfy it",
    analyse('// looksLikeV5 -> validationError(reply, v5Parsed.error)\n' + preFix).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 9 cases (3 pass-shapes, 6 fail-shapes incl. the real fall-through, the wrong-order case and the disabled-branch miss)`);
  process.exit(0);
}

const problems = analyse(existsSync(FILE) ? readFileSync(FILE, "utf8") : null);
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — a V5 body's own validation errors are surfaced before any legacy fallback`);
