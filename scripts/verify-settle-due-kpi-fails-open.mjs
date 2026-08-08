#!/usr/bin/env node
/**
 * NO-WINDOW / FAIL-S2 — the "Settle Due" KPI must fail OPEN, never on a status allowlist.
 *
 * It counted only status ∈ (presettle, acked, locked). Live settlements carry status `closed` — which is not
 * even a member of the shared SettlementStatus union (draft|presettle|acked|locked|paid|held|cancelled) — so
 * real driver money sat behind a card reading 0 while the ledger was correct. That is the NO-WINDOW class:
 * a correct ledger with no screen.
 *
 * An allowlist silently drops every status nobody thought of; a denylist surfaces them. For a "needs
 * attention" counter, being wrong in the direction of showing too much is recoverable and showing nothing
 * is not.
 *
 *   node scripts/verify-settle-due-kpi-fails-open.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-settle-due-kpi-fails-open";
const PAGE = "apps/frontend/src/pages/Drivers.tsx";

function assert(files) {
  const problems = [];
  const src = files[PAGE] ?? "";
  const i = src.indexOf("const settleDueCount");
  if (i === -1) return [`${PAGE}: settleDueCount not found — anchor drifted`];
  const block = src.slice(i, i + 1400);

  if (/\[\s*"presettle"\s*,\s*"acked"\s*,\s*"locked"\s*\]\s*\.includes/.test(block)) {
    problems.push(
      `${PAGE}: settleDueCount must not count an ALLOWLIST of statuses — live settlements are "closed", ` +
        `which that list omits (and which the shared SettlementStatus union does not even model), so the ` +
        `KPI read 0 over real driver money (NO-WINDOW / FAIL-S2).`,
    );
  }
  if (!/\["paid", "cancelled", "canceled"\]\.includes/.test(block)) {
    problems.push(`${PAGE}: settleDueCount must EXCLUDE settled/abandoned statuses explicitly (denylist)`);
  }
  return problems;
}

const files = Object.fromEntries([PAGE].map((r) => [r, readFileSync(path.join(ROOT, r), "utf8")]));

if (SELFTEST) {
  const reverted = {
    ...files,
    [PAGE]: files[PAGE].replace(
      /const settleDueCount = useMemo\([\s\S]*?\n  \);/,
      `const settleDueCount = useMemo(
    () => (settlementsQuery.data?.settlements ?? []).filter((s) => ["presettle", "acked", "locked"].includes(String(s.status))).length,
    [settlementsQuery.data?.settlements]
  );`,
    ),
  };
  const caught = assert(reverted);
  if (!caught.some((p) => /must not count an ALLOWLIST/.test(p))) {
    console.error(`${LABEL} SELFTEST FAIL — reverted allowlist not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — reverted allowlist caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — Settle Due excludes settled/abandoned and surfaces everything else`);
process.exit(0);
