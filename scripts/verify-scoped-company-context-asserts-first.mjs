#!/usr/bin/env node
/**
 * setScopedCompanyContext() must assert membership BEFORE it sets the RLS scope.
 *
 * This guard exists because the helper is a concentration of risk. Twelve route handlers across
 * mdata/unit-photos, unit-plates, unit-documents and unit-default-driver delegate their entire
 * cross-entity authorization to this one function. If someone "simplifies" it down to the set_config
 * call — or reorders the two statements — all twelve silently become MDATA-F09 again, and the sibling
 * guard verify-caller-scoped-guc-membership.mjs would NOT notice: it inspects call sites, sees the
 * approved helper name, and passes. The call sites would still look correct. Only the helper changed.
 *
 * That is the same failure mode this whole class came from — a control that keeps passing while the
 * thing it protects stops working — so the helper gets its own check rather than being trusted.
 *
 * CHECKED:
 *   1. The helper file exists and exports setScopedCompanyContext.
 *   2. It calls assertCompanyMembership.
 *   3. The assert appears BEFORE the set_config of app.operating_company_id.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = process.cwd();
const HELPER = "apps/backend/src/_helpers/scoped-company-context.ts";
const LABEL = "verify-scoped-company-context-asserts-first";

export function auditSource(raw) {
  // CLS-GUARD-READS-COMMENTS — mask comments before analysing, or the guard reads its own
  // documentation as code: the helper's JSDoc contains the literal `assertCompanyMembership(...)`,
  // which satisfied the "assert is present" probe and made an earlier revision pass with the real
  // call DELETED.
  //
  // This replaces a local naive `stripComments` (two regexes) with the shared, quote-aware
  // `scripts/lib/mask-comments.mjs`. Two concrete reasons, not tidiness:
  //   · the naive version treated `//` inside a string or SQL template literal as a comment, so a
  //     `set_config(...)` written after a URL in a template literal would have been blanked — turning
  //     a real finding into a silent pass, which is worse than the bug it fixed;
  //   · this guard COMPARES POSITIONS (`assertAt > gucAt`). Stripping shortens the source and moves
  //     every offset after the first comment, so a long comment between the two statements could
  //     invert the ordering verdict. maskComments is offset-preserving — comment bytes become spaces
  //     and newlines are kept — so the comparison stays truthful.
  const src = maskComments(raw);
  const problems = [];
  if (!/export\s+async\s+function\s+setScopedCompanyContext/.test(src)) {
    problems.push("does not export setScopedCompanyContext — 12 route handlers import it for their cross-entity authorization.");
    return problems;
  }
  const assertAt = src.search(/\bassertCompanyMembership\s*\(/);
  const gucAt = src.search(/set_config\(\s*['"`]app\.operating_company_id['"`]/);
  if (gucAt === -1) {
    problems.push("no set_config('app.operating_company_id', …) — the helper must actually set the scope it promises.");
    return problems;
  }
  if (assertAt === -1) {
    problems.push("sets app.operating_company_id but never calls assertCompanyMembership — every caller of this helper becomes MDATA-F09 (caller chooses its own RLS scope).");
    return problems;
  }
  if (assertAt > gucAt) {
    problems.push("calls assertCompanyMembership AFTER setting app.operating_company_id — the scope must be proven before it is applied, not after.");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = `import { assertCompanyMembership } from "./x.js";
export async function setScopedCompanyContext(client, userId, id) {
  await assertCompanyMembership(client, userId, id);
  await client.query(\`SELECT set_config('app.operating_company_id', $1, true)\`, [id]);
  return id;
}`;
  const cases = [
    ["correct: assert then GUC", good, 0],
    ["assert removed entirely", good.replace(/\s*await assertCompanyMembership\([^;]*;/, ""), 1],
    ["order swapped: GUC then assert", `export async function setScopedCompanyContext(client, userId, id) {
  await client.query(\`SELECT set_config('app.operating_company_id', $1, true)\`, [id]);
  await assertCompanyMembership(client, userId, id);
}`, 1],
    ["export renamed away", good.replace("setScopedCompanyContext", "somethingElse"), 1],
    ["GUC removed — helper no longer scopes", good.replace(/\s*await client\.query\(`SELECT set_config[^;]*;/, ""), 1],
    // Regression: the guard must not read a COMMENT mentioning assertCompanyMembership( as proof that
    // the call exists. This exact shape made an earlier revision pass with the real assert deleted.
    ["comment mentioning assertCompanyMembership( is not proof", `/** Writing \`assertCompanyMembership(...)\` then set_config is the pattern. */
export async function setScopedCompanyContext(client, userId, id) {
  await client.query(\`SELECT set_config('app.operating_company_id', $1, true)\`, [id]);
}`, 1],
  ];
  let bad = 0;
  for (const [name, src, expect] of cases) {
    const got = auditSource(src).length;
    const ok = expect === 0 ? got === 0 : got >= 1;
    if (!ok) { bad++; console.error(`  selftest FAIL: ${name} — expected ${expect ? ">=1" : "0"}, got ${got}`); }
  }
  if (bad) { console.error(`${LABEL} --selftest: ${bad} case(s) failed`); process.exit(1); }
  console.log(`${LABEL} --selftest: ${cases.length} cases pass`);
  process.exit(0);
}

let src;
try {
  src = readFileSync(join(ROOT, HELPER), "utf8");
} catch {
  console.error(`FAIL ${LABEL}: ${HELPER} is missing — 12 route handlers import setScopedCompanyContext from it.`);
  process.exit(1);
}

const problems = auditSource(src);
if (problems.length) {
  console.error(`FAIL ${LABEL} — ${HELPER}:`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — setScopedCompanyContext asserts membership before setting app.operating_company_id`);
