#!/usr/bin/env node
// B4 (owner, 2026-09-12) — "relationship-health-score honesty: exclude missing inputs, label
// partial, or remove." CUST-01 C3(b) (pre-existing) already handles the zero-signal case; this
// guards the previously-unhandled 1-4-of-5-signals case: a customer with SOME but not all subscores
// present must never be shown a definitive tier or the overall number as if fully scored.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-relationship-score-partial-honesty";
const FILE = "apps/frontend/src/components/customers/CustomerRelationshipScore.tsx";

export function auditAll(src) {
  const failures = [];
  if (!/function isPartial\(/.test(src)) {
    failures.push(`${FILE}: isPartial() detection removed — a customer with 1-4 of 5 subscores would silently be shown a definitive tier again`);
  }
  if (!/if \(partial\) return "Partial";/.test(src)) {
    failures.push(`${FILE}: tierLabel no longer returns "Partial" for a partial score — regressed to a definitive tier label`);
  }
  if (!/!partial\s*&&\s*typeof score\?\.overall_health_score/.test(src)) {
    failures.push(`${FILE}: the overall_health_score number is no longer hidden while partial — a number computed from incomplete inputs would render as if authoritative`);
  }
  return failures;
}

function run() {
  const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const failures = auditAll(src);
  if (failures.length > 0) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} OK — a partial relationship score (1-4 of 5 subscores) never renders a definitive tier or the overall number.`);
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const real = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  assert.equal(auditAll(real).length, 0, "real source should already pass");

  const mutated1 = real.replace('if (partial) return "Partial";\n  ', "");
  assert.notEqual(mutated1, real, "selftest setup bug: tierLabel partial branch text not found");
  assert.ok(auditAll(mutated1).some((f) => f.includes('no longer returns "Partial"')), "MUTATION 1 (stripped partial tier label) escaped detection");

  const mutated2 = real.replace("!partial && typeof score?.overall_health_score", "typeof score?.overall_health_score");
  assert.notEqual(mutated2, real, "selftest setup bug: overall_health_score gate text not found");
  assert.ok(auditAll(mutated2).some((f) => f.includes("no longer hidden while partial")), "MUTATION 2 (unhid the overall number) escaped detection");

  console.log(`${LABEL} --selftest PASS (2/2 mutations caught)`);
  process.exit(0);
}

run();
