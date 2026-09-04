#!/usr/bin/env node
/**
 * OWNER RULING 2026-09-04 (LANE-MILEAGE-IMPORT-DROPPED-COLUMNS, item 3): "invoice -> practical
 * miles; driver pay -> short miles loaded + empty miles deadhead ... the practical fallback in
 * book-load.service.ts:498-500 is the ONLY correct loaded-pay path today. Keep it, document it as
 * the owner-ruled fallback, and guard it so it cannot be removed. DO NOT invent short miles from
 * practical by any formula."
 *
 * This guard locks resolveDriverBasePayCents's per_mile_pay branch in place:
 *   1. The exact fallback expression is present -- practical miles are used when the driver's rate
 *      card is explicitly configured miles_basis="practical_miles" OR when miles_shortest is
 *      missing/non-positive; otherwise miles_shortest is used. Neither condition is optional.
 *   2. No formula anywhere in this function derives/estimates a "short miles" value FROM
 *      miles_practical (e.g. a multiplier, a percentage, Math.min/Math.max blending the two) --
 *      the owner explicitly forbade deriving one from the other; the only two source values that
 *      may feed the loaded-pay `miles` variable are the raw load.miles_shortest and
 *      load.miles_practical columns, verbatim.
 *   3. The owner-ruling doc comment citing this exact rule survives (so a future refactor can't
 *      silently drop the fallback without a human noticing the comment explaining why it exists).
 *
 * Run: node scripts/verify-driver-pay-practical-fallback-locked.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/dispatch/book-load.service.ts";
const LABEL = "verify-driver-pay-practical-fallback-locked";

function extractFunction(src) {
  const start = src.indexOf("async function resolveDriverBasePayCents");
  if (start === -1) return null;
  // Grab a generous window -- the function body plus its leading doc comment block.
  return src.slice(Math.max(0, start - 1600), start + 4000);
}

export function run(root = ROOT) {
  const problems = [];
  let src;
  try {
    src = fs.readFileSync(path.join(root, SVC), "utf8");
  } catch {
    return [`${SVC}: missing`];
  }

  const fn = extractFunction(src);
  if (!fn) {
    problems.push(`${SVC}: resolveDriverBasePayCents not found — was it renamed or removed?`);
    return problems;
  }

  // 1. The exact fallback expression, allowing only whitespace/formatting drift.
  const fallbackRe =
    /rate\.miles_basis\s*===\s*"practical_miles"\s*\|\|\s*!\(Number\(load\.miles_shortest\s*\?\?\s*0\)\s*>\s*0\)\s*\n?\s*\?\s*Number\(load\.miles_practical\s*\?\?\s*Number\.NaN\)\s*\n?\s*:\s*Number\(load\.miles_shortest\s*\?\?\s*Number\.NaN\)/;
  if (!fallbackRe.test(fn)) {
    problems.push(
      `${SVC}: resolveDriverBasePayCents no longer falls back to miles_practical when miles_shortest is missing or the rate card is explicitly practical_miles — this is the owner-ruled loaded-pay path (2026-09-04), do not remove it`
    );
  }

  // 2. No derivation formula for short-from-practical inside this function. A derivation would
  // look like assigning something computed FROM miles_practical into a variable that then feeds
  // the "short" side of the branch, or a multiplier/ratio applied to miles_practical anywhere in
  // this function's body.
  const derivationRe = /miles_practical[\s\S]{0,40}?[*/][\s\S]{0,20}?[0-9.]|miles_shortest\s*=\s*[\s\S]{0,60}?miles_practical/;
  if (derivationRe.test(fn)) {
    problems.push(
      `${SVC}: resolveDriverBasePayCents appears to derive short miles from practical miles by a formula — the owner explicitly forbade this ("Any formula would fabricate driver pay")`
    );
  }

  // 3. The owner-ruling comment survives.
  if (!/OWNER RULING 2026-09-04/.test(fn) || !/loaded-pay path today/.test(fn)) {
    problems.push(
      `${SVC}: the OWNER RULING 2026-09-04 doc comment above the practical-miles fallback is missing — re-add it so a future refactor understands why this branch cannot be simplified away`
    );
  }

  return problems;
}

function selftest() {
  const dir = fs.mkdtempSync("/tmp/driver-pay-practical-fallback-selftest-");
  const rel = SVC;
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const goodSnippet = `
/**
 * OWNER RULING 2026-09-04 (LANE-MILEAGE-IMPORT-DROPPED-COLUMNS, item 3): encoded here.
 */
async function resolveDriverBasePayCents(client, operatingCompanyId, driverId, load, actorUserId) {
  if (rate.basis_type === "per_load_pay") {
    // ...
  } else {
    // OWNER RULING 2026-09-04: this is THE ONLY correct loaded-pay path today.
    const miles =
      rate.miles_basis === "practical_miles" || !(Number(load.miles_shortest ?? 0) > 0)
        ? Number(load.miles_practical ?? Number.NaN)
        : Number(load.miles_shortest ?? Number.NaN);
    cardCents = miles;
  }
}
`;
  fs.writeFileSync(abs, goodSnippet);
  const passProblems = run(dir);
  if (passProblems.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(passProblems));

  // Mutation 1: remove the fallback (always use shortest).
  const brokenFallback = goodSnippet.replace(
    /const miles =\n[\s\S]*?: Number\(load\.miles_shortest \?\? Number\.NaN\);/,
    "const miles = Number(load.miles_shortest ?? Number.NaN);"
  );
  fs.writeFileSync(abs, brokenFallback);
  const f1 = run(dir);
  if (f1.length === 0) throw new Error("FAIL to catch: removing the practical-miles fallback went undetected");

  // Mutation 2: derive short from practical by a formula.
  const derived = goodSnippet.replace(
    "cardCents = miles;",
    "const derivedShort = load.miles_practical * 1.1;\n    cardCents = derivedShort;"
  );
  fs.writeFileSync(abs, derived);
  const f2 = run(dir);
  if (f2.length === 0) throw new Error("FAIL to catch: deriving short miles from practical miles went undetected");

  // Mutation 3: strip the owner-ruling comment.
  const noComment = goodSnippet
    .replace(/\/\*\*\n \* OWNER RULING[\s\S]*?\*\/\n/, "")
    .replace(/\/\/ OWNER RULING 2026-09-04:.*\n/, "");
  fs.writeFileSync(abs, noComment);
  const f3 = run(dir);
  if (f3.length === 0) throw new Error("FAIL to catch: removing the owner-ruling comment went undetected");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = run();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — the owner-ruled practical-miles fallback in resolveDriverBasePayCents is intact, and no short-from-practical derivation formula was found`);
