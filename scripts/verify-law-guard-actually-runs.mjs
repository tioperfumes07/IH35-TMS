#!/usr/bin/env node
/**
 * verify-law-guard-actually-runs.mjs — ACCT-F158. Existence on disk is NOT enforcement.
 *
 * THE HOLE, found independently by CC-3. `verify-law-registry.mjs` proves every law registered as
 * `type: "enforced"` names a guard file that RESOLVES ON DISK — and nothing more. A guard can sit in
 * `scripts/.guard-exempt.json`, be referenced by no workflow and no verify-step, run on no PR ever,
 * and the registry still reports it enforced. That is a green tick over a guard enforcing nothing,
 * which is worse than an unguarded law: an unguarded law is visibly unguarded, while this one reads
 * as protected.
 *
 * It was not hypothetical. Two CC-3-authored guards —
 * `verify-no-hold-language-in-active-blocks.mjs` and `verify-no-patch-or-defer-language.mjs` — were
 * exactly in this state, and the reason is structural rather than anyone's carelessness:
 * CLAIMED-NUMBERS.json's `_band` map partitions EVERY integer among cursor (even), cc-1 (n%4===1) and
 * cc-2 (n%4===3), leaving CC-3 no residue class at all. With no claimable number CC-3 could not wire
 * its own guards and parked them in .guard-exempt.json with an honest note. CC-1 adopted them into its
 * band (steps 2773 / 2777) so they RUN, and un-exempting them immediately surfaced ELEVEN real
 * violations of OWNER LAW 2026-08-03 sitting in active `.block-ready` work orders. Every one of those
 * was invisible for as long as the guard was exempt.
 *
 * WHAT THIS ASSERTS, on top of the registry's existence check:
 *   1. no `type: "enforced"` law names a guard that is listed in `scripts/.guard-exempt.json`;
 *   2. every such guard is REFERENCED by something that actually executes — a `scripts/verify-steps/*`
 *      step, or a `.github/workflows/*` job.
 * Fail either and the law is not enforced, whatever the registry says.
 *
 * Deliberately NOT asserted: that the guard is any GOOD, or that its selftest is meaningful. That is
 * `verify-selftests-can-fail.mjs`'s job. This one answers a narrower question honestly — does it run?
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-law-guard-actually-runs";
const LAW = path.join(ROOT, "docs", "law", "LAW.json");
const EXEMPT = path.join(ROOT, "scripts", ".guard-exempt.json");
const STEPS = path.join(ROOT, "scripts", "verify-steps");
const WORKFLOWS = path.join(ROOT, ".github", "workflows");

function readText(dir) {
  if (!fs.existsSync(dir)) return "";
  return fs.readdirSync(dir)
    .filter((f) => /\.(mjs|js|ts|yml|yaml)$/.test(f))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
}

export function evaluate(laws, exemptKeys, runnerText) {
  const exempted = [];
  const orphaned = [];
  for (const law of laws) {
    if (law?.type !== "enforced" || !law.guard) continue;
    const base = path.basename(law.guard);
    if (exemptKeys.includes(base)) { exempted.push({ id: law.id, guard: base }); continue; }
    if (!runnerText.includes(base)) orphaned.push({ id: law.id, guard: base });
  }
  return { exempted, orphaned };
}

function run() {
  if (!fs.existsSync(LAW)) { console.log(`${LABEL} OK — no LAW.json`); return 0; }
  const laws = JSON.parse(fs.readFileSync(LAW, "utf8"));
  const exemptKeys = fs.existsSync(EXEMPT)
    ? Object.keys(JSON.parse(fs.readFileSync(EXEMPT, "utf8"))).filter((k) => !k.startsWith("_"))
    : [];
  const { exempted, orphaned } = evaluate(laws, exemptKeys, readText(STEPS) + "\n" + readText(WORKFLOWS));

  // SHRINK-ONLY. 21 laws were already in this state when the check was written; fixing them all at
  // once is not safe, because wiring a guard surfaces whatever it was never checking (the two CC-3
  // guards adopted alongside this revealed ELEVEN live breaches the moment they ran). The counts may
  // only fall, so the debt is one-way and visible instead of quietly growing with each new law.
  const BASE = path.join(ROOT, "scripts", "law-enforcement-debt-baseline.json");
  const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, "utf8")) : {};
  const overExempt = exempted.length > (base.exempted_count ?? 0);
  const overOrphan = orphaned.length > (base.orphaned_count ?? 0);
  if (overExempt || overOrphan) {
    console.error(`${LABEL} FAIL — law-enforcement debt ROSE (exempted ${base.exempted_count} -> ${exempted.length}, orphaned ${base.orphaned_count} -> ${orphaned.length}):\n`);
    for (const e of exempted) console.error(`  - ${e.id}: guard ${e.guard} is in .guard-exempt.json — exempt means it does NOT run`);
    for (const o of orphaned) console.error(`  - ${o.id}: guard ${o.guard} is referenced by no verify-step and no workflow`);
    console.error(
      `\nEXISTENCE ON DISK IS NOT ENFORCEMENT. verify-law-registry proves the file resolves; this proves\n` +
        `it RUNS. A guard that is registered, exempted and never executed is a green tick over nothing —\n` +
        `worse than an unguarded law, because it reads as protected.\n\n` +
        `Fix: wire the guard into a verify-step in YOUR band and delete its .guard-exempt.json entry.\n` +
        `If your lane has no claimable band, say so on the board and have a banded lane ADOPT it —\n` +
        `never squat another lane's number, and never leave it exempt and call it law.\n`
    );
    return 1;
  }
  const n = laws.filter((l) => l?.type === "enforced" && l.guard).length;
  if (exempted.length < (base.exempted_count ?? 0) || orphaned.length < (base.orphaned_count ?? 0)) {
    console.log(`${LABEL} OK — debt IMPROVED: exempted ${exempted.length} (was ${base.exempted_count}), ` +
      `orphaned ${orphaned.length} (was ${base.orphaned_count}) of ${n} enforced law(s). LOWER the baseline to lock it in.`);
    return 0;
  }
  console.log(`${LABEL} OK — ${n} enforced law(s); ${exempted.length} exempted + ${orphaned.length} orphaned, at baseline (shrink-only)`);
  return 0;
}

function selftest() {
  const f = [];
  const law = (id, guard, type = "enforced") => ({ id, guard, type });
  const t = (name, laws, exempt, text, wantE, wantO) => {
    const r = evaluate(laws, exempt, text);
    if (r.exempted.length !== wantE || r.orphaned.length !== wantO)
      f.push(`${name}: expected exempted=${wantE} orphaned=${wantO}, got ${r.exempted.length}/${r.orphaned.length}`);
  };
  t("wired and not exempt", [law("L1", "scripts/g.mjs")], [], 'ctx.run("node",["scripts/g.mjs"])', 0, 0);
  t("EXEMPTED enforced law", [law("L1", "scripts/g.mjs")], ["g.mjs"], 'ctx.run("node",["scripts/g.mjs"])', 1, 0);
  t("ORPHANED enforced law", [law("L1", "scripts/g.mjs")], [], "nothing references it", 0, 1);
  t("judgment law is exempt from this check", [law("L1", "scripts/g.mjs", "judgment")], ["g.mjs"], "", 0, 0);
  t("law with no guard is ignored", [{ id: "L1", type: "enforced" }], [], "", 0, 0);
  t("workflow reference counts as wired", [law("L1", "scripts/g.mjs")], [], "run: node scripts/g.mjs", 0, 0);

  if (f.length) { for (const x of f) console.error(`${LABEL} SELFTEST FAIL — ${x}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — 6 cases: exempted RED, orphaned RED, wired GREEN, judgment ignored`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? selftest() : run());
}
