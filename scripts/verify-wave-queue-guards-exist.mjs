#!/usr/bin/env node
/**
 * verify-wave-queue-guards-exist.mjs — CLS-GUARD-PHANTOM. A class cannot be drained by a guard that
 * was never written.
 *
 * WHY. docs/audit/wave-queue.json is the class queue, and each wave names the guard that holds its
 * class drained. Nothing checked that those files exist. Ten of thirty-one do not — and two of the ten
 * belong to waves already marked **drained**:
 *
 *     CLS-RAW-UUID-INPUT   -> scripts/verify-no-raw-uuid-inputs.mjs          (absent)
 *     CLS-DISP-WIRE-04     -> scripts/verify-disp-wire-04-invoice-evidence.mjs (absent)
 *
 * A drained class with no guard is a FALSE DRAIN CLAIM. The queue says the class is closed and
 * protected; nothing is protecting it, so it can regress in full silence and the queue will keep
 * saying it is closed. That is worse than an open class, because an open class is still being looked
 * at. This is the same shape found twice already this week by accident rather than by check: ACCT-F141
 * (#4607) promised a WORM ratchet in its own migration header that was never written, and
 * CLS-LINKAGE-ONEWAY names verify-money-ops-fk-density.mjs, which does not exist either. Twice is a
 * class, not an incident.
 *
 * It also contradicts the permanent law directly — "LAW = ENFORCED GUARD, OR IT IS NOT LAW" — and the
 * drain rule the queue itself operates under: a class is drained only at zero live instances AND a
 * guard exists. verify-law-registry.mjs already enforces exactly this for docs/law/LAW.json. The class
 * queue had no equivalent. This is it.
 *
 * TWO SEVERITIES, deliberately different:
 *
 *   1. DRAINED wave with a missing guard  -> HARD FAIL, never baselined. The claim is false the moment
 *      it is made, and allowing a baseline entry here would be baselining a lie.
 *   2. OPEN wave with a missing guard     -> shrink-only debt. An open class is honest about not being
 *      finished; its guard is still owed. The count may fall, never rise, so the debt is one-way and
 *      visible instead of quietly growing with each new wave.
 *
 * Existence-only, like verify-law-registry: it does not judge whether a guard is any good, only that
 * the file a wave points at is really there. Cheap, unambiguous, and it cannot produce a false red.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-queue-guards-exist";
const QUEUE = path.join(ROOT, "docs", "audit", "wave-queue.json");
const BASELINE = path.join(ROOT, "scripts", "wave-queue-guard-debt-baseline.json");

export function auditQueue(queue, exists = (p) => fs.existsSync(path.join(ROOT, p))) {
  const drainedMissing = [];
  const openMissing = [];
  for (const wave of queue.waves ?? []) {
    if (!wave || typeof wave !== "object" || !wave.guard) continue;
    if (exists(wave.guard)) continue;
    const row = { id: wave.id, guard: wave.guard, status: wave.status };
    if (String(wave.status).toLowerCase() === "drained") drainedMissing.push(row);
    else openMissing.push(row);
  }
  return { drainedMissing, openMissing };
}

export function evaluate(audit, baseline) {
  const problems = [];
  if (audit.drainedMissing.length) {
    problems.push(
      `${audit.drainedMissing.length} DRAINED wave(s) name a guard that does not exist — the drain claim is false:\n` +
        audit.drainedMissing.map((r) => `      - ${r.id} -> ${r.guard}`).join("\n")
    );
  }
  const allowed = baseline.open_missing_count ?? Infinity;
  if (audit.openMissing.length > allowed) {
    problems.push(
      `open waves missing a guard rose ${allowed} -> ${audit.openMissing.length}. A new wave must ship ` +
        `its guard, or land with the guard written but the class still open. Never RAISE this baseline.`
    );
  }
  return problems;
}

function run() {
  if (!fs.existsSync(QUEUE)) {
    console.log(`${LABEL} OK — no wave-queue.json`);
    return 0;
  }
  const queue = JSON.parse(fs.readFileSync(QUEUE, "utf8"));
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : {};
  const audit = auditQueue(queue);
  const problems = evaluate(audit, baseline);

  if (problems.length) {
    console.error(`${LABEL} FAIL:\n`);
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error(
      `A class is drained only at zero live instances AND a guard that exists. A drained class with no\n` +
        `guard can regress in complete silence while the queue keeps reporting it closed.\n`
    );
    return 1;
  }
  if (audit.openMissing.length < (baseline.open_missing_count ?? 0)) {
    console.log(
      `${LABEL} OK — guard debt IMPROVED: ${audit.openMissing.length} open wave(s) still missing a guard ` +
        `(baseline ${baseline.open_missing_count}). LOWER open_missing_count to lock it in.`
    );
    return 0;
  }
  console.log(
    `${LABEL} OK — 0 drained waves with a phantom guard; ${audit.openMissing.length} open wave(s) still owe one (at baseline)`
  );
  return 0;
}

function selftest() {
  const failures = [];
  const exists = (p) => p === "scripts/real.mjs";
  const q = (waves) => auditQueue({ waves }, exists);
  const base = { open_missing_count: 1 };

  // GREEN: one open wave owes a guard, exactly at baseline
  if (evaluate(q([{ id: "A", status: "open", guard: "scripts/missing.mjs" }]), base).length !== 0)
    failures.push("case1 FAIL — at baseline must be GREEN.");

  // RED: a DRAINED wave names a guard that does not exist
  if (evaluate(q([{ id: "B", status: "drained", guard: "scripts/missing.mjs" }]), base).length === 0)
    failures.push("case2 FAIL — drained wave with phantom guard must go RED.");

  // RED: open debt grew past baseline
  if (evaluate(q([
    { id: "A", status: "open", guard: "scripts/missing.mjs" },
    { id: "C", status: "open", guard: "scripts/missing2.mjs" },
  ]), base).length === 0) failures.push("case3 FAIL — rising open debt must go RED.");

  // GREEN: guards that exist are never flagged, drained or open
  if (evaluate(q([
    { id: "D", status: "drained", guard: "scripts/real.mjs" },
    { id: "E", status: "open", guard: "scripts/real.mjs" },
  ]), { open_missing_count: 0 }).length !== 0) failures.push("case4 FAIL — existing guards must be GREEN.");

  // GREEN: a wave with no guard field is not this guard's business
  if (evaluate(q([{ id: "F", status: "open" }]), { open_missing_count: 0 }).length !== 0)
    failures.push("case5 FAIL — a wave declaring no guard must not be flagged.");

  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — drained+phantom RED, rising debt RED, at-baseline GREEN, real guards GREEN`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? selftest() : run());
}
