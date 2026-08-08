#!/usr/bin/env node
/**
 * BY-CLASS SCOREBOARD GENERATOR — emits the defect-class matrix the Programs > Scoreboard tab renders.
 *
 * WHY THIS EXISTS. The Scoreboard tab already carries the 13-GATE TALLY (DoD A–E + VERIFY 1–8) and the
 * per-module rows, both read live. What it has never carried is the OTHER axis the work is actually
 * organised by: the defect CLASS. Work is dispatched vertically, by class, across all modules — but the
 * only place a class status lived was `docs/audit/wave-queue.json`, which nobody can see from the app.
 * So "15 drained / 11 open" was a number people quoted from a file rather than a board they could read.
 *
 * SOURCE OF TRUTH IS THE QUEUE, NOT THIS FILE. Exactly the rule the sibling generator states: the board
 * renders truth, it cannot manufacture it. Every cell here is derived from wave-queue.json. If a class
 * is wrong on the board, the queue is wrong — fix it there.
 *
 * CELL CODES (2 letters, per the standing order) and the status they come from — COLOUR LAW,
 * owner-stated 2026-08-07. The cell's colour is a function of the queue's `status` field and nothing
 * else; see classifyCell() for why inferring it from instance text was wrong.
 *   CC = drained     — status "drained"                     (green)
 *   BB = in progress — status "draining" / "in_progress"     (amber)
 *   NN = open        — anything else, incl. "open"           (neutral/grey)
 *   XX = blocked     — status "blocked"                      (red — reserved, never the backlog)
 * `liveDefect` is a SEPARATE boolean (drain_proof.money_critical on a not-yet-drained class), so the
 * money-critical signal is kept without spending the blocked colour on it.
 *
 * THIS FILE IS THE OFFLINE FALLBACK, NOT THE LIVE PATH. The Programs page reads `classScoreboard`
 * off GET /api/v1/program/audit-scoreboard, which the backend computes per request from the same
 * queue — that is what makes the grid react without a redeploy (PROG-CLASS-STALE). What is emitted
 * here is only what the page shows when that live read fails, and the page labels it as such.
 * classifyCell() here and classCellFor() in the backend MUST stay in agreement.
 *
 * HONEST LIMIT — READ BEFORE TRUSTING A GREEN CELL. "drained" is the queue's own claim. This generator
 * does NOT re-verify it against prod, and a class is only genuinely drained when every instance is
 * proven live AND a mutation-proven guard exists. Where the queue names a guard, the generator checks
 * only that the FILE EXISTS (cheap, deterministic, no DB) and surfaces `guardMissing` — a class marked
 * drained whose guard file is absent is reported, because that combination is the one that has bitten
 * this repo repeatedly. It is existence-only; it does not run the guard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE = path.join(ROOT, "docs/audit/wave-queue.json");
const OUT = path.join(ROOT, "apps/frontend/src/pages/program/classScoreboard.data.ts");

/**
 * Two-letter cell code + tone, derived ONLY from the queue's `status`.
 *
 * COLOUR LAW (owner-stated 2026-08-07): drained = green · draining/in-progress = amber ·
 * open/not-started = neutral · blocked = red.
 *
 * The previous mapping inferred a tone from the SHAPE of a wave's `instances` — a money_critical flag
 * or a regex for FAIL/defect/BROKEN painted the cell red, and a regex for `#1234|block` painted it
 * amber. Two problems. First, it disagreed with the owner's law: 12 classes whose only sin was being
 * OPEN rendered red, spending the one colour reserved for blocked on the ordinary backlog state, so a
 * genuinely blocked class would have been invisible in a field of red. Second, a tone that depends on
 * regex-matching free text inside instance notes is not reactive to the thing it claims to show —
 * editing a note's wording could flip a cell's colour without any status change.
 *
 * Status is the field the queue actually maintains, so status is what colours the cell. The
 * money_critical signal is NOT discarded: it is carried out as a separate `liveDefect` flag.
 *
 * MUST agree with classCellFor() in apps/backend/src/program/audit-scoreboard.routes.ts — that is the
 * live path and this is the offline fallback; two different mappings would mean the board changed
 * colour depending on whether the API answered. Guarded by verify-class-scoreboard-live-sourced.mjs.
 */
export function classifyCell(wave) {
  const status = String(wave.status ?? "").trim().toLowerCase();
  switch (status) {
    case "drained":
      return { code: "CC", tone: "green", label: "drained" };
    case "draining":
    case "in_progress":
    case "in progress":
      return { code: "BB", tone: "amber", label: "in progress" };
    case "blocked":
      return { code: "XX", tone: "red", label: "blocked" };
    default:
      return { code: "NN", tone: "grey", label: "not started" };
  }
}

/**
 * Look for a guard whose filename is a superset/variant of the referenced one (e.g. the queue names
 * `verify-x.mjs` but the file shipped as `verify-x-durable.mjs`). Deliberately conservative: it only
 * reports a candidate, and the caller must not treat it as proof the class is guarded.
 */
function nearMatchFor(guard) {
  const base = path.basename(guard, ".mjs");
  const dir = path.join(ROOT, "scripts");
  if (!fs.existsSync(dir)) return null;
  const stem = base.replace(/^verify-/, "").split("-").filter((p) => p.length > 3);
  if (stem.length === 0) return null;
  const hit = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mjs") && f !== path.basename(guard))
    // STRICT: every meaningful stem part must appear. A partial match produced a WRONG candidate in
    // testing (it offered verify-delivery-evidence-latch-wired for a disp-wire-04-invoice-evidence
    // reference), and a misleading hint is worse than no hint on a board people act on.
    .find((f) => stem.every((p) => f.includes(p)));
  return hit ? `scripts/${hit}` : null;
}

export function buildRows(queue) {
  const waves = Array.isArray(queue.waves) ? queue.waves : [];
  return waves
    .map((w) => {
      const cell = classifyCell(w);
      const guard = typeof w.guard === "string" && w.guard.trim() ? w.guard.trim() : null;
      return {
        id: String(w.id ?? "?"),
        lane: String(w.lane ?? "—"),
        layer: String(w.layer ?? "—"),
        status: String(w.status ?? "—"),
        code: cell.code,
        tone: cell.tone,
        label: cell.label,
        instances: Array.isArray(w.instances) ? w.instances.length : 0,
        modules: Array.isArray(w.modules) ? w.modules.length : 0,
        guard,
        // Existence-only, per the header note. Never "the guard passes".
        // EXISTENCE ONLY. A true value means the NAMED FILE is not on disk — which in practice has
        // meant a STALE REFERENCE (the guard was renamed or split) at least as often as a missing
        // guard. Both are registry defects worth surfacing; neither asserts the class is unprotected.
        // Scoped to DRAINED classes, matching the backend's live path. An OPEN class with no guard
        // named is the expected state, not a registry defect, and flagging all of them buried the
        // handful that actually matter: a class CLAIMING drained whose guard file is not there.
        guardMissing: cell.code === "CC" && guard != null && !fs.existsSync(path.join(ROOT, guard)),
        // Best-effort: a same-subject guard under a different filename, so a stale reference is
        // distinguishable from a genuinely absent one without claiming either.
        guardNearMatch: guard ? nearMatchFor(guard) : null,
        // Carried separately from the tone so the money-critical signal survives the colour law
        // (open is neutral, red is reserved for blocked) instead of being encoded in it.
        // A DRAINED class that was money-critical is no longer a live defect — it is a drained one.
        liveDefect: cell.code !== "CC" && (w.drain_proof ?? {}).money_critical === true,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function summarise(rows) {
  const by = (c) => rows.filter((r) => r.code === c).length;
  return {
    total: rows.length,
    drained: by("CC"),
    building: by("BB"),
    notStarted: by("NN"),
    // Counted from the flag, not the tone — see the colour law in classifyCell().
    liveDefect: rows.filter((r) => r.liveDefect).length,
    // The number that matters most and is easiest to lose: classes claiming drained with no guard file.
    drainedWithoutGuard: rows.filter((r) => r.code === "CC" && r.guardMissing).length,
  };
}

// Only act when invoked directly. verify-class-scoreboard-fresh.mjs IMPORTS buildRows/summarise from
// here, and an import that regenerates a file would give the guard the side effect it promises not to
// have — and would mask drift by rewriting the very file it is meant to check.
const IS_ENTRY = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_ENTRY && process.argv.includes("--selftest")) {
  // COLOUR LAW cases. B and E are the corrections: an OPEN class is neutral even when it is
  // money-critical or its notes say FAIL — red belongs to BLOCKED alone, and C proves a note
  // mentioning a PR number no longer flips a cell to amber behind the status field's back.
  const cases = [
    [{ id: "A", status: "drained" }, "CC"],
    [{ id: "B", status: "open", drain_proof: { money_critical: true } }, "NN"],
    [{ id: "C", status: "open", instances: [{ note: "landed in #4321" }] }, "NN"],
    [{ id: "D", status: "open", instances: [{ note: "nothing yet" }] }, "NN"],
    [{ id: "E", status: "open", instances: [{ note: "OPEN — real defect, FAIL" }] }, "NN"],
    [{ id: "F", status: "draining" }, "BB"],
    [{ id: "G", status: "blocked" }, "XX"],
    [{ id: "H", status: "DRAINING" }, "BB"],
  ];
  let bad = 0;
  for (const [wave, want] of cases) {
    const got = classifyCell(wave).code;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${wave.id} expected ${want}, got ${got}`);
      bad++;
    }
  }
  // A drained class whose guard file does not exist must be counted — this is the regression that matters.
  const rows = buildRows({ waves: [{ id: "Z", status: "drained", guard: "scripts/does-not-exist-xyz.mjs" }] });
  if (summarise(rows).drainedWithoutGuard !== 1) {
    console.error("SELFTEST FAIL: drainedWithoutGuard not counted");
    bad++;
  }
  // An OPEN class that names no guard is the expected state and must NOT be counted as a registry
  // defect — that over-count is what buried the drained-without-guard signal.
  const openNoGuard = buildRows({ waves: [{ id: "Y", status: "open" }] });
  if (openNoGuard[0].guardMissing !== false || summarise(openNoGuard).drainedWithoutGuard !== 0) {
    console.error("SELFTEST FAIL: an open class with no guard was flagged as a registry defect");
    bad++;
  }
  // money_critical must survive as a flag now that it no longer colours the cell.
  const mc = buildRows({ waves: [{ id: "X", status: "open", drain_proof: { money_critical: true } }] });
  if (mc[0].liveDefect !== true || summarise(mc).liveDefect !== 1) {
    console.error("SELFTEST FAIL: money_critical lost when it stopped driving the tone");
    bad++;
  }
  if (bad) process.exit(1);
  console.log(`gen-class-scoreboard SELFTEST PASS — ${cases.length + 1} cases`);
  process.exit(0);
}

if (IS_ENTRY) {
  runGenerator();
}

function runGenerator() {
if (!fs.existsSync(QUEUE)) {
  console.error(`gen-class-scoreboard FAIL — missing ${path.relative(ROOT, QUEUE)}`);
  process.exit(1);
}

const queue = JSON.parse(fs.readFileSync(QUEUE, "utf8"));
const rows = buildRows(queue);
if (rows.length === 0) {
  console.error("gen-class-scoreboard FAIL — wave-queue.json produced ZERO classes; refusing to emit an empty board.");
  process.exit(1);
}
const summary = summarise(rows);

const header = `// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — do not hand-edit.
// Produced by scripts/gen-class-scoreboard.mjs from docs/audit/wave-queue.json.
// Source of truth = the wave queue. The board renders truth; it cannot manufacture it.
//
// A green (CC) cell is the QUEUE'S claim that a class is drained — it is NOT independent proof.
// \`guardMissing\` flags a class claiming drained whose named guard file does not exist; that is an
// existence check only and never asserts the guard passes.
// ─────────────────────────────────────────────────────────────────────────────

export type ClassCellCode = "CC" | "BB" | "NN" | "XX";
export type ClassCellTone = "green" | "amber" | "grey" | "red";
export interface ClassRow {
  id: string;
  lane: string;
  layer: string;
  status: string;
  code: ClassCellCode;
  tone: ClassCellTone;
  label: string;
  instances: number;
  modules: number;
  guard: string | null;
  guardMissing: boolean;
  guardNearMatch: string | null;
  liveDefect: boolean;
}
export interface ClassScoreboard {
  meta: { generatedAt: string; source: string };
  summary: { total: number; drained: number; building: number; notStarted: number; liveDefect: number; drainedWithoutGuard: number };
  rows: ClassRow[];
}

export const CLASS_SCOREBOARD: ClassScoreboard = ${JSON.stringify(
  { meta: { generatedAt: new Date().toISOString(), source: "docs/audit/wave-queue.json" }, summary, rows },
  null,
  2,
)};
`;

fs.writeFileSync(OUT, header);
console.log(
  `gen-class-scoreboard: wrote ${rows.length} classes — ${summary.drained} drained, ${summary.building} building, ` +
    `${summary.notStarted} not started, ${summary.liveDefect} live defect; ${summary.drainedWithoutGuard} drained WITHOUT a guard file.`,
);
}
