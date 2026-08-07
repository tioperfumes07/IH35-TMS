#!/usr/bin/env node
/**
 * GUARD — the Programs > Scoreboard by-class matrix must match docs/audit/wave-queue.json.
 *
 * THE DEFECT THIS PREVENTS. `classScoreboard.data.ts` is a GENERATED file that the app renders as
 * fact: 26 classes, so many drained, so many live defects. If the queue moves and the generated file
 * does not, the board keeps showing yesterday's answer with today's confidence — a board that is
 * confidently wrong is worse than no board, because people stop checking the queue once a screen
 * exists. This is the same failure mode as a stale index: it is trusted precisely because it looks
 * authoritative.
 *
 * WHAT IT ASSERTS: regenerating from the queue in memory produces byte-identical summary + rows to
 * what is committed. It does NOT run the generator's file write, so it is safe in CI and has no
 * side effects.
 *
 * NOT CLAIMED: this proves the board matches the QUEUE. It does not prove the queue is right — a
 * class marked "drained" in the queue renders green here whether or not it truly drained. That
 * limitation is stated on the board itself and in the generator header; this guard is about
 * freshness, not truth.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRows, summarise } from "./gen-class-scoreboard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-class-scoreboard-fresh";
const QUEUE = path.join(ROOT, "docs/audit/wave-queue.json");
const DATA = path.join(ROOT, "apps/frontend/src/pages/program/classScoreboard.data.ts");

/** Pull the committed JSON payload out of the generated TS module. */
function readCommitted(src) {
  const i = src.indexOf("= {");
  if (i < 0) return null;
  const body = src.slice(i + 2).trim().replace(/;\s*$/, "");
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

if (process.argv.includes("--selftest")) {
  const queue = { waves: [{ id: "CLS-X", status: "drained", guard: "scripts/gen-class-scoreboard.mjs" }] };
  const rows = buildRows(queue);
  if (rows.length !== 1 || rows[0].code !== "CC") {
    console.error("SELFTEST FAIL: drained wave did not classify as CC");
    process.exit(1);
  }
  // Drift must be detectable: change the queue and the rows must differ.
  const drifted = buildRows({ waves: [{ id: "CLS-X", status: "open" }] });
  if (JSON.stringify(rows) === JSON.stringify(drifted)) {
    console.error("SELFTEST FAIL: identical rows for drained vs open — drift would be invisible");
    process.exit(1);
  }
  if (summarise(rows).drained !== 1) {
    console.error("SELFTEST FAIL: summarise miscounted");
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — classification + drift detection + summary`);
  process.exit(0);
}

if (!fs.existsSync(QUEUE)) {
  console.error(`${LABEL} FAIL — missing docs/audit/wave-queue.json`);
  process.exit(1);
}
if (!fs.existsSync(DATA)) {
  console.error(`${LABEL} FAIL — missing generated board data. Run: node scripts/gen-class-scoreboard.mjs`);
  process.exit(1);
}

const committed = readCommitted(fs.readFileSync(DATA, "utf8"));
if (!committed) {
  console.error(`${LABEL} FAIL — could not parse the generated payload out of classScoreboard.data.ts`);
  process.exit(1);
}

const queue = JSON.parse(fs.readFileSync(QUEUE, "utf8"));
const rows = buildRows(queue);
const summary = summarise(rows);

if (rows.length === 0) {
  console.error(`${LABEL} FAIL — the queue yields ZERO classes; refusing to pass vacuously on an empty board.`);
  process.exit(1);
}

const problems = [];
if (JSON.stringify(committed.summary) !== JSON.stringify(summary)) {
  problems.push(`summary drift:\n    committed ${JSON.stringify(committed.summary)}\n    queue now ${JSON.stringify(summary)}`);
}
if (JSON.stringify(committed.rows) !== JSON.stringify(rows)) {
  const c = new Map((committed.rows ?? []).map((r) => [r.id, r]));
  const diffs = rows
    .filter((r) => JSON.stringify(c.get(r.id)) !== JSON.stringify(r))
    .slice(0, 6)
    .map((r) => `${r.id}: board=${c.get(r.id)?.code ?? "ABSENT"} queue=${r.code}`);
  problems.push(`row drift (${diffs.length}+ shown):\n    ${diffs.join("\n    ")}`);
}

if (problems.length) {
  console.error(`${LABEL} FAIL — the Programs by-class board no longer matches the wave queue:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nFix: node scripts/gen-class-scoreboard.mjs && commit the regenerated data file.\n`);
  process.exit(1);
}

console.log(
  `${LABEL} OK — board matches the queue: ${summary.total} classes (${summary.drained} drained, ` +
    `${summary.building} building, ${summary.notStarted} not started, ${summary.liveDefect} live defect).`,
);
process.exit(0);
