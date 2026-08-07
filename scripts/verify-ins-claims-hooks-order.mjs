#!/usr/bin/env node
/**
 * INS-claims-crash (Cascade P0) — ClaimsTab must run every hook before any early return.
 *
 * React error #310 ("rendered fewer hooks than expected") when /insurance?tab=claims is opened
 * via direct URL or refresh: companyId is "" on first render, the guard returned early after 7
 * hooks, then context resolved and useMemo ran — hook count mismatch, tab crash.
 *
 * Ratchet: columns useMemo (and every other hook) must appear BEFORE `if (!companyId)`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-ins-claims-hooks-order";
const CLAIMS_TAB = "apps/frontend/src/pages/insurance/ClaimsTab.tsx";

const HOOK_RE = /(?:^|[^.\w])(use[A-Z]\w*)\s*(?:<[\s\S]{0,160}?>)?\s*\(/g;
const RETURN_RE = /\n\s{2,}return[\s(<;]/g;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function componentBody(src) {
  const m = /export function ClaimsTab\s*\(/.exec(src);
  return m ? src.slice(m.index) : src;
}

/**
 * @param {string} rel
 * @param {string} srcRaw
 * @returns {string[]}
 */
export function auditClaimsTab(rel, srcRaw) {
  const problems = [];
  const src = componentBody(stripComments(srcRaw));

  const guardMatch = /if\s*\(\s*!companyId\s*\)/.exec(src);
  if (!guardMatch) {
    problems.push(`${rel}: missing \`if (!companyId)\` guard — entity scope is required before rendering claims`);
    return problems;
  }
  const guardIndex = guardMatch.index;

  const columnsMemo = /const\s+columns\s*=\s*useMemo/.exec(src);
  if (!columnsMemo) {
    problems.push(`${rel}: missing \`const columns = useMemo\` — ClaimsTab column set must be memoized`);
    return problems;
  }
  if (columnsMemo.index > guardIndex) {
    problems.push(
      `${rel}: columns useMemo (offset ${columnsMemo.index}) runs AFTER the companyId guard (offset ${guardIndex}). ` +
        `Move every hook above the guard or React #310 crashes direct URL / refresh.`,
    );
  }

  const firstEarlyReturn = [...src.slice(0, guardIndex + 1).matchAll(RETURN_RE)]
    .map((m) => m.index)
    .sort((a, b) => a - b)[0];
  if (firstEarlyReturn === undefined) return problems;

  for (const m of src.matchAll(HOOK_RE)) {
    if (m.index > firstEarlyReturn) {
      problems.push(
        `${rel}: ${m[1]}() at offset ${m.index} runs AFTER an early return at ${firstEarlyReturn}. ` +
          `Hooks must be unconditional; only the render is conditional.`,
      );
    }
  }

  return problems;
}

function auditTree() {
  const src = readFileSync(join(ROOT, CLAIMS_TAB), "utf8");
  return auditClaimsTab(CLAIMS_TAB, src);
}

function selftest() {
  const failures = [];

  if (auditTree().length !== 0) {
    failures.push(`case0 FAIL — production ClaimsTab flagged: ${auditTree().join(" | ")}`);
  }

  const bug = [
    "export function ClaimsTab() {",
    "  const companyId = useCompanyContext();",
    "  if (!companyId) {",
    "    return (",
    "      <div>Select company</div>",
    "    );",
    "  }",
    "  const columns = useMemo<ParityColumn<InsuranceClaim>[]>(() => [], []);",
    "  return <div>{columns.length}</div>;",
    "}",
  ].join("\n");
  if (!auditClaimsTab("bug.tsx", bug).some((p) => p.includes("useMemo") || p.includes("columns")))
    failures.push("case1 FAIL — hook-after-guard defect was NOT caught");

  const fixed = [
    "export function ClaimsTab() {",
    "  const companyId = useCompanyContext();",
    "  const columns = useMemo<ParityColumn<InsuranceClaim>[]>(() => [], []);",
    "  if (!companyId) {",
    "    return (",
    "      <div>Select company</div>",
    "    );",
    "  }",
    "  return <div>{columns.length}</div>;",
    "}",
  ].join("\n");
  if (auditClaimsTab("fixed.tsx", fixed).length !== 0)
    failures.push("case2 FAIL — corrected hook order was wrongly flagged");

  const noGuard = [
    "export function ClaimsTab() {",
    "  const columns = useMemo(() => [], []);",
    "  return <div>{columns.length}</div>;",
    "}",
  ].join("\n");
  if (!auditClaimsTab("noguard.tsx", noGuard).some((p) => p.includes("!companyId")))
    failures.push("case3 FAIL — missing companyId guard was NOT caught");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — defect caught, fix passes, guard presence enforced`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — ClaimsTab runs every hook before the companyId guard`);
}

main();
