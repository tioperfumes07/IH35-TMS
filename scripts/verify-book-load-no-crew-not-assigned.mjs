#!/usr/bin/env node
/**
 * GUARD: booking a load with NO CREW must not store an "assigned" status.
 *
 * FAIL-D3 (Cascade) / LV-LOAD-NUMBER-BURN-AND-ASSIGNED-STATUS-WITHOUT-DRIVER (CC-3).
 *
 * Measured on prod 2026-08-08: L-20260808-0020 (c5ece310-c52b-4ee6-acf0-2ef2c5670cd8) sat at
 * status 'assigned_not_dispatched' with assigned_primary_driver_id NULL and zero rows in
 * dispatch.load_assignment_history. The status word said "assigned" and nothing was assigned.
 *
 * ROOT CAUSE, not the symptom: `createDispatchLoadBodySchema` defaults `status` to
 * 'assigned_not_dispatched', and book-load.service.ts wrote that default straight through to the
 * INSERT without ever asking whether a driver or a team came with it. The fix is at the write, so
 * every caller inherits it — a UI-only fix would leave the API able to do it again.
 *
 * WHY THIS IS ASSERTED ON THE SOURCE AND NOT ON PROD ROWS: the existing bad row is historical and a
 * live query would stay red until it is repaired, which is the expected-state-recorded-as-failure
 * anti-pattern. This guard asserts the CODE cannot produce a new one.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it does not forbid 'assigned_not_dispatched' as a default in the
 * route schema. That default is fine for the overwhelmingly common case where a driver IS chosen;
 * forbidding it would be the shallow fix that breaks the normal path to satisfy the edge case.
 *
 * Run:  node scripts/verify-book-load-no-crew-not-assigned.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/dispatch/book-load.service.ts";
const LABEL = "verify-book-load-no-crew-not-assigned";

const read = (rel) => {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

/** Strip line comments so the long rationale note above the fix cannot satisfy the checks. */
const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

export function collectProblems(src) {
  const problems = [];
  if (!src) return [`${SERVICE} not found`];
  const code = strip(src);

  const anchor = code.indexOf("statusForInsert");
  if (anchor === -1) {
    return ["statusForInsert is gone from book-load.service.ts — the booking status write moved; re-point this guard"];
  }
  // The crew test may be hoisted into a local (e.g. `hasCrew`) declared just ABOVE the assignment,
  // so the window must reach backwards as well as forwards or the guard fails on a correct fix.
  const window = code.slice(Math.max(0, anchor - 500), anchor + 700);

  if (!/assigned_primary_driver_id/.test(window)) {
    problems.push(
      "the booking status is derived without consulting assigned_primary_driver_id — a crewless load can be stored as assigned again (FAIL-D3)"
    );
  }
  if (!/team_id/.test(window)) {
    problems.push(
      "the booking status ignores team_id — a team-crewed load would be demoted to unassigned, or a crewless one accepted"
    );
  }
  if (!/["']unassigned["']/.test(window)) {
    problems.push(
      "the crewless branch does not store 'unassigned' — that is the real mdata.load_status_enum member for a booked-but-uncrewed load"
    );
  }
  // toMdataStatus('unassigned') returns 'draft'; routing the crewless case through it would hide a
  // booked load. The fix must use the literal, so assert the literal appears in the same window.
  if (/toMdataStatus\(\s*["']unassigned["']\s*\)/.test(code)) {
    problems.push(
      "the crewless branch routes 'unassigned' through toMdataStatus(), which maps it to 'draft' and would hide a booked load from dispatch"
    );
  }
  return problems;
}

function selftest() {
  const cases = [
    {
      name: "current source passes",
      src: read(SERVICE),
      expect: 0,
    },
    {
      name: "pre-fix form is caught",
      src: `const statusForInsert = input.save_mode === "draft" ? "draft" : toMdataStatus(input.status);`,
      expectAtLeast: 1,
    },
    {
      name: "driver checked but team ignored is caught",
      src: `const statusForInsert = input.save_mode === "draft" ? "draft" : !input.assigned_primary_driver_id ? "unassigned" : toMdataStatus(input.status);`,
      expectAtLeast: 1,
    },
    {
      name: "crewless branch that stores something other than 'unassigned' is caught",
      src: `const hasCrew = Boolean(input.assigned_primary_driver_id) || Boolean(input.team_id);
            const statusForInsert = input.save_mode === "draft" ? "draft" : !hasCrew ? "draft" : toMdataStatus(input.status);`,
      expectAtLeast: 1,
    },
    {
      name: "comment-only mention does not satisfy the guard",
      src: `// assigned_primary_driver_id team_id 'unassigned'
            const statusForInsert = input.save_mode === "draft" ? "draft" : toMdataStatus(input.status);`,
      expectAtLeast: 1,
    },
  ];

  let pass = 0;
  for (const c of cases) {
    const problems = collectProblems(c.src);
    const ok = c.expect === 0 ? problems.length === 0 : problems.length >= (c.expectAtLeast ?? 1);
    if (ok) pass += 1;
    else console.error(`  selftest FAIL: ${c.name} -> ${JSON.stringify(problems)}`);
  }
  console.log(`${LABEL} selftest ${pass}/${cases.length}`);
  return pass === cases.length ? 0 : 1;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = collectProblems(read(SERVICE));
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`${LABEL}: ok`);
  return 0;
}

process.exit(main());
