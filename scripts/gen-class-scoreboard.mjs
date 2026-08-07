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
 * CELL CODES (2 letters, per the standing order) and the status they come from:
 *   CC = drained   — status "drained"                     (green)
 *   BB = building  — status "open" AND instances claimed   (amber)
 *   NN = not started — status "open", nothing claimed      (grey)
 *   XX = live defect — status "open" AND drain_proof.money_critical or a FAIL-verdict instance (red)
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

/** Two-letter cell code + tone, derived ONLY from queue fields. */
export function classifyCell(wave) {
  const status = String(wave.status ?? "").toLowerCase();
  const instances = Array.isArray(wave.instances) ? wave.instances : [];
  const proof = wave.drain_proof ?? {};

  if (status === "drained") return { code: "CC", tone: "green", label: "drained" };

  // A money-critical open class, or one whose instances carry an explicit FAIL/defect note, is a live
  // defect rather than merely unstarted — the board should show red, not grey.
  const moneyCritical = proof.money_critical === true;
  const hasDefect = instances.some((i) => /(?:^|\W)(FAIL|defect|BROKEN)/i.test(JSON.stringify(i ?? {})));
  if (moneyCritical || hasDefect) return { code: "XX", tone: "red", label: "live defect" };

  // "Building" = someone has already resolved instances (a PR/block id is recorded on any of them).
  const claimed = instances.some((i) => /#\d{3,}|PR\s*#?\d{3,}|block/i.test(JSON.stringify(i ?? {})));
  if (claimed) return { code: "BB", tone: "amber", label: "in progress" };

  return { code: "NN", tone: "grey", label: "not started" };
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
        guardMissing: guard ? !fs.existsSync(path.join(ROOT, guard)) : true,
        // Best-effort: a same-subject guard under a different filename, so a stale reference is
        // distinguishable from a genuinely absent one without claiming either.
        guardNearMatch: guard ? nearMatchFor(guard) : null,
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
    liveDefect: by("XX"),
    // The number that matters most and is easiest to lose: classes claiming drained with no guard file.
    drainedWithoutGuard: rows.filter((r) => r.code === "CC" && r.guardMissing).length,
  };
}

// Only act when invoked directly. verify-class-scoreboard-fresh.mjs IMPORTS buildRows/summarise from
// here, and an import that regenerates a file would give the guard the side effect it promises not to
// have — and would mask drift by rewriting the very file it is meant to check.
const IS_ENTRY = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_ENTRY && process.argv.includes("--selftest")) {
  const cases = [
    [{ id: "A", status: "drained" }, "CC"],
    [{ id: "B", status: "open", drain_proof: { money_critical: true } }, "XX"],
    [{ id: "C", status: "open", instances: [{ note: "landed in #4321" }] }, "BB"],
    [{ id: "D", status: "open", instances: [{ note: "nothing yet" }] }, "NN"],
    [{ id: "E", status: "open", instances: [{ note: "OPEN — real defect, FAIL" }] }, "XX"],
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
