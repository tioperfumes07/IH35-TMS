#!/usr/bin/env node
// DISPATCH-3 guard (owner order 2026-09-05): pressing Dispatch on a draft/unassigned load must show a
// plain-English reason, not the bare "invalid_transition" code (13508 "dead button"). Two contracts:
//   (1) userFacingApiError special-cases {error:"invalid_transition"} into invalidTransitionMessage,
//       and the draft (from="unassigned") case tells the operator to assign a driver first.
//   (2) the DispatchKanban drop catch routes the rejection through userFacingApiError, not raw
//       error.message (which would print the machine code).
//
// Usage: node scripts/verify-dispatch-invalid-transition-reason.mjs [--selftest]

import { readFileSync } from "node:fs";

const ERR_FILE = "apps/frontend/src/lib/api-error-message.ts";
const KANBAN_FILE = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";

function auditErr(src) {
  const f = [];
  if (!/data\.error === "invalid_transition"/.test(src))
    f.push(`${ERR_FILE}: userFacingApiError must special-case data.error === "invalid_transition"`);
  if (!/export function invalidTransitionMessage\(/.test(src))
    f.push(`${ERR_FILE}: must export invalidTransitionMessage(from, to)`);
  // draft case must be actionable: mention draft AND assigning a driver.
  const m = src.match(/if \(from === "unassigned"\)\s*\{\s*return\s*([^\n]+)/);
  if (!m || !/draft/i.test(m[1]) || !/assign a driver/i.test(m[1]))
    f.push(`${ERR_FILE}: the from="unassigned" branch must return a draft message that says to assign a driver`);
  return f;
}

function auditKanban(src) {
  const f = [];
  // The drop catch must humanize via userFacingApiError, not the raw error.message it used before.
  if (!/const reason = userFacingApiError\(error,/.test(src))
    f.push(`${KANBAN_FILE}: the drop catch must build its reason from userFacingApiError(error, ...)`);
  if (/const reason = error instanceof Error \? error\.message/.test(src))
    f.push(`${KANBAN_FILE}: the drop catch still reads raw error.message (regression) — use userFacingApiError`);
  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const errSrc = readFileSync(ERR_FILE, "utf8");
  const kanbanSrc = readFileSync(KANBAN_FILE, "utf8");

  const failures = [...auditErr(errSrc), ...auditKanban(kanbanSrc)];
  if (failures.length) {
    console.error("FAIL verify-dispatch-invalid-transition-reason:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }

  if (selftest) {
    const mutErr = errSrc.replace(/data\.error === "invalid_transition"/, 'data.error === "nope"');
    if (auditErr(mutErr).length === 0) {
      console.error("SELFTEST FAIL: dropping the invalid_transition special-case did not trip the guard");
      process.exit(1);
    }
    const mutKanban = kanbanSrc.replace(
      /const reason = userFacingApiError\(error, "the server rejected it and gave no reason"\)\.trim\(\);/,
      "const reason = error instanceof Error ? error.message.trim() : \"\";",
    );
    if (auditKanban(mutKanban).length === 0) {
      console.error("SELFTEST FAIL: reverting Kanban to raw error.message did not trip the guard");
      process.exit(1);
    }
    console.log("SELFTEST OK: guard trips on both mutations");
  }

  console.log("PASS verify-dispatch-invalid-transition-reason");
}

main();
