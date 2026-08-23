#!/usr/bin/env node
/**
 * GUARD: safety DriverScoreDetail.tsx's eventsQuery (Harsh Event Timeline) must render a real
 * error state on failure, never let a failed fetch masquerade as "No harsh events for this
 * driver in period."
 *
 * ROOT CAUSE this freezes shut: eventsQuery never referenced .isError, while the SAME file's
 * sibling trendQuery correctly gates on isError with ListErrorState (12-period composite safety
 * trend panel, above it). A failed harsh-events fetch on this driver-safety-score detail panel
 * silently rendered a false all-clear ("no harsh events") instead of surfacing the failure.
 *
 * Static-only (text-pattern) check against the real component file, in two parts:
 *   1. A tight regex proves eventsQuery.isError gates a real ListErrorState render as the FIRST
 *      arm of a ternary (`eventsQuery.isError ? ( ... <ListErrorState ... ) : (`) — window sizes
 *      measured directly against the real file (78 / 263 actual chars) with headroom, per the
 *      regex-window-too-small landmines hit earlier this session.
 *   2. Because the else-arm (the pre-existing events map + empty-state) is ~1600 chars long — too
 *      wide for a safe fixed window — position-ordering via indexOf proves the existing
 *      `events ?? []).length === 0` empty-state check sits AFTER that ternary's `) : (`, i.e.
 *      inside the else branch, not a sibling/duplicate render.
 *
 * Run:  node scripts/verify-safety-driver-score-events-error-state.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(
  root,
  "apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx"
);
const LABEL = "verify-safety-driver-score-events-error-state";

const GATE_RE =
  /eventsQuery\.isError\s*\?\s*\([\s\S]{0,500}<ListErrorState[\s\S]{0,500}\)\s*:\s*\(/;

export function checkEventsErrorState(src) {
  const problems = [];

  if (!/eventsQuery\.isError/.test(src)) {
    problems.push(
      "eventsQuery.isError is never referenced — a failed fetch cannot be distinguished from a real empty harsh-events list"
    );
  }

  // Combined check: a real ternary gate exists AND the pre-existing empty-state render sits
  // inside its else-arm (proven via indexOf ordering, since the else-arm body is ~1600 chars —
  // too wide for a safe fixed regex window).
  const gateMatch = GATE_RE.exec(src);
  const elseArmStart = gateMatch ? gateMatch.index + gateMatch[0].length : -1;
  const emptyStateIdx = elseArmStart === -1 ? -1 : src.indexOf("events ?? []).length === 0", elseArmStart);
  if (!gateMatch || emptyStateIdx === -1 || emptyStateIdx <= elseArmStart) {
    problems.push(
      "the existing events-map / empty-state render is not the else-arm of a real eventsQuery.isError ternary gating a ListErrorState render — a failed fetch could still fall through to (or render alongside) the existing empty-state"
    );
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    <div className="divide-y divide-slate-100 text-xs">
      {(eventsQuery.data?.events ?? []).slice(0, 50).map((event) => (
        <div key={event.id} />
      ))}
      {(eventsQuery.data?.events ?? []).length === 0 ? (
        <div className="px-3 py-2 text-slate-500">No harsh events for this driver in period.</div>
      ) : null}
    </div>
  `;
  const badProblems = checkEventsErrorState(bad);
  if (badProblems.length !== 2) {
    failures.push(
      `the real pre-fix defect verbatim expected 2 problems, got ${badProblems.length}: ${badProblems.join("; ")}`
    );
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkEventsErrorState(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: isError referenced (e.g. a stray comment) but no real ternary gate, and
  // the empty-state check still sits outside/before any such gate.
  const partial = `
    // eventsQuery.isError is handled upstream, trust me
    <div className="divide-y divide-slate-100 text-xs">
      {(eventsQuery.data?.events ?? []).slice(0, 50).map((event) => (
        <div key={event.id} />
      ))}
      {(eventsQuery.data?.events ?? []).length === 0 ? (
        <div className="px-3 py-2 text-slate-500">No harsh events for this driver in period.</div>
      ) : null}
    </div>
  `;
  const partialProblems = checkEventsErrorState(partial);
  if (partialProblems.length !== 1) {
    failures.push(
      `a partial regression (isError mentioned but no real ternary gate) expected 1 problem, got ${partialProblems.length}: ${partialProblems.join("; ")}`
    );
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (2/2), the real fixed file clears, a ` +
      `partial "isError mentioned but not real gate" regression caught.`
  );
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkEventsErrorState(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — DriverScoreDetail.tsx's eventsQuery renders a real error state on failure, matching its trendQuery sibling.`
);
