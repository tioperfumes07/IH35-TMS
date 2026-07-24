#!/usr/bin/env node
/**
 * GUARD: per-entity catalog routes resolve the default company canonically, not by lowest UUID.
 *
 * WHY THIS EXISTS (LST-F05, verified 2026-07-24)
 * When operating_company_id is omitted, load-cancellation-reasons and void-cancel-reasons resolved
 * it with an inline `SELECT default … UNION SELECT any accessible … ORDER BY id LIMIT 1`. The UNION
 * put the user's DEFAULT company and every accessible company on equal footing, then took the lowest
 * UUID — LOSING the default. USMCA (5c854333…) sorts below TRANSP (91e0bf0a…), so a param-omitting
 * call to these catalogs hijacked TRANSP's default to USMCA. The canonical resolveOperatingCompanyId
 * already does COALESCE(default, lowest) AND validates membership (403 on a foreign id instead of a
 * silent empty list); items/accounts/classes already use it. This guard keeps these routes on it and
 * bans the inline lowest-UUID fallback from returning.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = [
  "apps/backend/src/catalogs/load-cancellation-reasons.routes.ts",
  "apps/backend/src/catalogs/void-cancel-reasons.routes.ts",
];
const LABEL = "verify-catalog-default-entity-resolver";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertCanonicalResolver(sources) {
  const problems = [];
  for (const rel of ROUTES) {
    const src = stripComments(sources?.[rel] ?? read(rel));
    if (!/resolveOperatingCompanyId\(/.test(src)) {
      problems.push(`${rel}: does not use resolveOperatingCompanyId — a per-entity catalog that omits operating_company_id must resolve the caller's DEFAULT, not an ad-hoc fallback.`);
    }
    // The inline lowest-UUID fallback must not exist: a UNION over accessible companies with
    // ORDER BY id is the exact hijack pattern.
    if (/user_accessible_company_ids\(\)[\s\S]{0,200}ORDER BY id\s+LIMIT 1/.test(src)) {
      problems.push(`${rel}: still contains an inline \`UNION … ORDER BY id LIMIT 1\` default resolver — it picks the lowest accessible UUID and hijacks the user's default (USMCA < TRANSP).`);
    }
  }
  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(ROUTES.map((r) => [r, read(r)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) { failures.push(`${name}: inert`); return; }
    const p = assertCanonicalResolver(mutated);
    if (!p.some((x) => x.includes(needle))) failures.push(`${name}: NOT caught (got: ${p.join(" | ") || "none"})`);
  };
  const [a, b] = ROUTES;
  expectCaught("resolver-removed",
    { ...live, [a]: live[a].replace(/resolveOperatingCompanyId/g, "someOtherResolver") },
    "does not use resolveOperatingCompanyId");
  expectCaught("inline-fallback-returns",
    { ...live, [b]: live[b].replace("const operatingCompanyId = await resolveOperatingCompanyId(",
        "const _x = await client.query(`SELECT c.id FROM org.companies c WHERE c.id IN (SELECT org.user_accessible_company_ids()) ORDER BY id LIMIT 1`);\n      const operatingCompanyId = await resolveOperatingCompanyId(") },
    "inline `UNION");
  const liveProblems = assertCanonicalResolver(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);
  if (failures.length) { console.error(`${LABEL} SELFTEST FAILED:`); for (const f of failures) console.error(`  ${f}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — 2 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertCanonicalResolver();
if (problems.length) { console.error(`${LABEL} FAILED:`); for (const p of problems) console.error(`  ${p}`); process.exit(1); }
console.log(`${LABEL} OK — cancellation-reason catalogs resolve the default company via resolveOperatingCompanyId; no lowest-UUID hijack.`);
