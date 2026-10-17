#!/usr/bin/env node
/**
 * INVERTED — LEAD 443.192 (12:35Z), OWNER LAW: "Per-mile drivers are ALWAYS paid SHORT miles — never practical miles. Short
 * miles is the fixed pay basis, not a per-load choice." This guard now locks THAT rule in resolveDriverBasePayCents and the
 * bill writer: loaded pay = load.miles_shortest x the rate ONLY (no practical fallback, no card-configured practical basis),
 * the fresh-mint gate refuses without short miles, the bill's miles basis is never "practical"; and (kept) no formula derives
 * short miles from practical. Measured 2026-10-17 before the change: 8 open USMCA per-mile bills priced at practical miles.
 * The text below is the superseded 2026-09-04 history (the fallback it locked existed only because short miles had no source).
 *
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
  // The function body (to the next top-level declaration) plus its leading doc comment block.
  // 443.99: a fixed +4000-char window stopped short of the fallback once the function grew (salaried
  // override, 443.31 rate-card refusals) — bound it by the function's own end, never a byte count.
  const rest = src.slice(start + 1);
  const end = rest.search(/\n(?:export\s+)?(?:async\s+)?(?:function|const|let|class|interface|type)\s/);
  return src.slice(Math.max(0, start - 1600), end === -1 ? src.length : start + 1 + end);
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

  // 1. (443.192) Loaded pay is SHORT miles only — the old practical fallback / practical card basis must be gone.
  if (/rate\.miles_basis\s*===\s*"practical_miles"/.test(fn) || /Number\(load\.miles_practical/.test(fn)) {
    problems.push(`${SVC}: resolveDriverBasePayCents prices loaded pay from practical miles — owner law (443.192): per-mile drivers are ALWAYS paid SHORT miles`);
  }
  if (!/const miles = Number\(load\.miles_shortest \?\? Number\.NaN\);/.test(fn)) {
    problems.push(`${SVC}: resolveDriverBasePayCents loaded miles must be load.miles_shortest, verbatim`);
  }
  if (!/const perLoadMiles = Number\(load\.miles_shortest \?\? Number\.NaN\);/.test(src)) {
    problems.push(`${SVC}: the per-load override rate must pay short miles too (perLoadMiles = miles_shortest)`);
  }
  if (!/const hasAnyRealMiles = Number\(load\.miles_shortest \?\? 0\) > 0;/.test(src)) {
    problems.push(`${SVC}: a fresh driver bill must be refused without SHORT miles (driver_bill.refused_no_shortest_miles)`);
  }
  if (/milesBasisType = "practical"/.test(src)) {
    problems.push(`${SVC}: a driver bill's miles basis can never be "practical"`);
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

  // 3. The owner-law comment survives.
  if (!/OWNER LAW \(LEAD 443\.192/.test(fn)) {
    problems.push(`${SVC}: the OWNER LAW (LEAD 443.192) comment on the short-miles pay rule is missing`);
  }

  return problems;
}

function selftest() {
  const dir = fs.mkdtempSync("/tmp/driver-pay-short-miles-selftest-");
  const abs = path.join(dir, SVC);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const good = `
async function resolveDriverBasePayCents(client, operatingCompanyId, driverId, load, actorUserId) {
  if (rate.basis_type === "per_load_pay") {
    // ...
  } else {
    // OWNER LAW (LEAD 443.192, 12:35Z): short miles only.
    const miles = Number(load.miles_shortest ?? Number.NaN);
    cardCents = miles;
  }
  const perLoadMiles = Number(load.miles_shortest ?? Number.NaN);
}
async function createDriverBillArtifacts() {
  const hasAnyRealMiles = Number(load.miles_shortest ?? 0) > 0;
  if (milesShort && milesShort > 0) {
    milesBasis = milesShort;
    milesBasisType = "short";
  }
}
`;
  const check = (src, label, expectClean) => {
    fs.writeFileSync(abs, src);
    const p = run(dir);
    if (expectClean ? p.length : !p.length) throw new Error(`${expectClean ? "PASS fail" : "FAIL to catch"}: ${label} ${JSON.stringify(p)}`);
  };
  check(good, "clean baseline", true);
  check(good.replace("const miles = Number(load.miles_shortest ?? Number.NaN);", 'const miles = rate.miles_basis === "practical_miles" || !(Number(load.miles_shortest ?? 0) > 0) ? Number(load.miles_practical ?? Number.NaN) : Number(load.miles_shortest ?? Number.NaN);'), "practical fallback back", false);
  check(good.replace("cardCents = miles;", "const derivedShort = load.miles_practical * 1.1;\n    cardCents = derivedShort;"), "short derived from practical", false);
  check(good.replace("const perLoadMiles = Number(load.miles_shortest ?? Number.NaN);", "const perLoadMiles = Number(load.miles_practical ?? Number.NaN);"), "override pays practical", false);
  check(good.replace("const hasAnyRealMiles = Number(load.miles_shortest ?? 0) > 0;", "const hasAnyRealMiles = Number(load.miles_shortest ?? 0) > 0 || Number(load.miles_practical ?? 0) > 0;"), "gate accepts practical-only", false);
  check(good.replace('milesBasisType = "short";\n  }', 'milesBasisType = "short";\n  } else { milesBasisType = "practical"; }'), "bill basis practical", false);
  check(good.replace("// OWNER LAW (LEAD 443.192, 12:35Z): short miles only.\n", ""), "owner-law comment dropped", false);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${LABEL} SELFTEST PASS (7 cases)`);
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
console.log(`${LABEL} OK — per-mile driver pay is SHORT miles only (owner law 443.192): no practical fallback, short-miles mint gate, no derivation formula`);
