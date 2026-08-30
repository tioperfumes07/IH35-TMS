#!/usr/bin/env node
/** @independent-input live:/healthz/version — binds artifacts to deployed ancestry and artifact files. */
/**
 * GUARD: A STORED ANSWER MUST DECLARE WHEN IT WAS TRUE — AND STILL BE TRUE NOW.
 *
 * OWNER STANDARD (2026-08-29): "as if we had a subscription with QuickBooks or McLeod ... I know I
 * can trust the software." The owner does not check. So a value the owner reads must not be a
 * snapshot of a moment that has passed.
 *
 * WHY THIS EXISTS — the failure it was written for, found the day it was written:
 *   docs/specs/scoreboard/verifier-rollup.json feeds the V1-V6 verifier columns on the Module
 *   Matrix. It is a COMMITTED FILE generated once by scripts/ops/build-verifier-rollup.mjs.
 *   Nothing regenerates it — not package.json, not CI, not the local gate.
 *   At the moment it was found: rollup healthzSha = 14daeed, live healthzSha = 5063761.
 *   V2 BOUND exists to answer "is this stamp an ancestor of LIVE healthz?" — a question whose
 *   answer changes on every deploy. Freezing it into a file is the same disease as the 275
 *   unbound greens, one layer up: a claim that rots and cannot announce that it has.
 *
 *   scenario-tracker.service.ts, in the same repo, states the correct law in its own header:
 *   "status is DERIVED at request time and never stored and read back."
 *
 * THE RULE
 *   Prefer recompute-on-read. Where a derived artifact MUST be stored, it declares the deploy SHA
 *   and timestamp it was computed against, and this guard fails when:
 *     - the declaration is missing entirely                        (an undatable claim)
 *     - its SHA is not an ancestor of live healthz/shallow          (computed on a dead branch)
 *     - live has moved past it by more than maxDeploysBehind        (stale)
 *     - it is older than maxAgeHours                                (stale by clock)
 *     - the SHA cannot be resolved                                  (CANNOT DETERMINE -> fail closed)
 *
 * FAIL CLOSED. Missing file, missing field, unresolvable ref: each FAILS with its own message.
 * Nothing is ever skipped. A guard that skips silently reports green and is worse than no guard.
 *
 * Run:  node scripts/verify-derived-artifact-freshness.mjs
 *       node scripts/verify-derived-artifact-freshness.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expandSha, ancestorCheck, fetchHealthzVersionSync } from "./lib/live-verified-stamps.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = path.join(ROOT, "docs/specs/DERIVED-ARTIFACTS.json");
const LABEL = "verify-derived-artifact-freshness";
const SELFTEST = process.argv.includes("--selftest");

/**
 * Pure decision core — no git, no network, unit-testable.
 * @returns {{problems:string[], warnings:string[], stats:object}}
 */
export function analyse({ artifacts, liveSha, nowMs, read, ancestorOf }) {
  const problems = [];
  const warnings = [];
  const stats = { checked: 0, fresh: 0, stale: 0 };

  for (const a of artifacts) {
    stats.checked++;
    const doc = read(a.path);
    if (doc === null) {
      problems.push(`${a.path}: MISSING or unparseable. A declared derived artifact that is not there cannot be trusted or repaired. Failing closed.`);
      continue;
    }

    const sha = a.shaField ? doc[a.shaField] : null;
    const at = a.timeField ? doc[a.timeField] : null;

    // 1. An undatable claim is the original sin. It cannot ever be shown to have rotted.
    if (!sha && !at) {
      problems.push(`${a.path}: declares neither "${a.shaField}" nor "${a.timeField}". A stored answer with no idea when it was true is exactly the unfalsifiable claim this standard exists to kill. Add both, or compute it on read.`);
      continue;
    }
    if (a.shaField && !sha) {
      problems.push(`${a.path}: missing "${a.shaField}". Without the deploy SHA it was computed on, nobody can tell whether it still holds.`);
      continue;
    }

    // 2. The SHA must be real, and must be part of what is deployed.
    const verdict = ancestorOf(sha, liveSha);
    if (verdict === "unknown") {
      problems.push(`${a.path}: CANNOT DETERMINE whether ${String(sha).slice(0, 12)} is an ancestor of live ${liveSha} — one of them is unresolvable in this clone. Run a full \`git fetch origin\` (CI: fetch-depth 0). Refusing to guess in either direction.`);
      continue;
    }
    if (verdict === "no") {
      problems.push(`${a.path}: computed on ${String(sha).slice(0, 12)}, which is NOT an ancestor of live ${liveSha}. It was generated on code that is not deployed — its values describe a system nobody is running.`);
      continue;
    }

    // 3. Ancestor is necessary, not sufficient. Live moving on makes it stale.
    if (typeof a.maxDeploysBehind === "number" && typeof doc.__behind === "number" && doc.__behind > a.maxDeploysBehind) {
      problems.push(`${a.path}: ${doc.__behind} commits behind live (max ${a.maxDeploysBehind}). Regenerate it: \`${a.regenerate}\`.`);
      continue;
    }

    // 4. Clock staleness.
    if (a.maxAgeHours && at) {
      const ageH = (nowMs - Date.parse(at)) / 3_600_000;
      if (Number.isNaN(ageH)) {
        problems.push(`${a.path}: "${a.timeField}" = ${JSON.stringify(at)} is not a parseable timestamp.`);
        continue;
      }
      if (ageH > a.maxAgeHours) {
        problems.push(`${a.path}: ${ageH.toFixed(1)}h old (max ${a.maxAgeHours}h). Regenerate it: \`${a.regenerate}\`.`);
        stats.stale++;
        continue;
      }
      if (ageH > a.maxAgeHours * 0.7) warnings.push(`${a.path}: ${ageH.toFixed(1)}h old, approaching the ${a.maxAgeHours}h limit`);
    }

    // 5. A stored artifact must name what regenerates it, or it will freeze again.
    if (!a.regenerate) {
      problems.push(`${a.path}: no "regenerate" command declared. A stored answer with no way to refresh it is a snapshot pretending to be live.`);
      continue;
    }
    stats.fresh++;
  }
  return { problems, warnings, stats };
}

function selftest() {
  const T = []; const t = (n, f) => { try { f(); T.push([n, true]); } catch (e) { T.push([n, false, e.message]); } };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ${a} !== ${b}`); };
  const NOW = Date.parse("2026-08-29T12:00:00Z");
  const anc = (a, b) => (a === "ghost" || b === "ghost" ? "unknown" : a === "good" ? "yes" : "no");
  const base = { path: "x.json", shaField: "healthzSha", timeField: "asOf", maxAgeHours: 24, regenerate: "node scripts/gen.mjs" };

  t("fresh + ancestor PASSES", () => {
    const r = analyse({ artifacts: [base], liveSha: "live", nowMs: NOW, ancestorOf: anc,
      read: () => ({ healthzSha: "good", asOf: "2026-08-29T11:00:00Z" }) });
    eq(r.problems.length, 0, "expected 0");
  });
  t("SHA not an ancestor of live FAILS", () => {
    const r = analyse({ artifacts: [base], liveSha: "live", nowMs: NOW, ancestorOf: anc,
      read: () => ({ healthzSha: "dead", asOf: "2026-08-29T11:00:00Z" }) });
    if (!r.problems[0].includes("NOT an ancestor")) throw new Error(r.problems[0]);
  });
  t("no SHA and no timestamp FAILS as unfalsifiable", () => {
    const r = analyse({ artifacts: [base], liveSha: "live", nowMs: NOW, ancestorOf: anc, read: () => ({}) });
    if (!r.problems[0].includes("unfalsifiable")) throw new Error(r.problems[0]);
  });
  t("too old FAILS even when the SHA is an ancestor", () => {
    const r = analyse({ artifacts: [base], liveSha: "live", nowMs: NOW, ancestorOf: anc,
      read: () => ({ healthzSha: "good", asOf: "2026-08-25T11:00:00Z" }) });
    if (!r.problems[0].includes("old (max")) throw new Error(r.problems[0]);
  });
  t("unresolvable SHA FAILS CLOSED as CANNOT DETERMINE", () => {
    const r = analyse({ artifacts: [base], liveSha: "live", nowMs: NOW, ancestorOf: anc,
      read: () => ({ healthzSha: "ghost", asOf: "2026-08-29T11:00:00Z" }) });
    if (!r.problems[0].includes("CANNOT DETERMINE")) throw new Error(r.problems[0]);
  });
  t("missing file FAILS CLOSED (never skips)", () => {
    const r = analyse({ artifacts: [base], liveSha: "live", nowMs: NOW, ancestorOf: anc, read: () => null });
    if (!r.problems[0].includes("MISSING")) throw new Error(r.problems[0]);
  });
  t("no regenerate command declared FAILS", () => {
    const r = analyse({ artifacts: [{ ...base, regenerate: null }], liveSha: "live", nowMs: NOW, ancestorOf: anc,
      read: () => ({ healthzSha: "good", asOf: "2026-08-29T11:00:00Z" }) });
    if (!r.problems[0].includes("snapshot pretending")) throw new Error(r.problems[0]);
  });
  t("approaching the limit WARNS but does not fail", () => {
    const r = analyse({ artifacts: [base], liveSha: "live", nowMs: NOW, ancestorOf: anc,
      read: () => ({ healthzSha: "good", asOf: "2026-08-28T17:00:00Z" }) });
    eq(r.problems.length, 0, "expected 0"); eq(r.warnings.length, 1, "expected 1 warning");
  });
  t("empty registry is NOT a vacuous pass", () => {
    const r = analyse({ artifacts: [], liveSha: "live", nowMs: NOW, ancestorOf: anc, read: () => null });
    eq(r.stats.checked, 0, "checked");
  });

  const bad = T.filter((x) => !x[1]);
  for (const [n, ok, e] of T) console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${e ? " — " + e : ""}`);
  console.log(`${LABEL} --selftest ${bad.length ? "FAIL" : "PASS"} ${T.length - bad.length}/${T.length}`);
  process.exit(bad.length ? 1 : 0);
}

function main() {
  if (SELFTEST) return selftest();
  if (!fs.existsSync(REGISTRY)) { console.error(`${LABEL} FAIL — ${REGISTRY} missing. Failing closed.`); process.exit(1); }
  const cfg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  if (!Array.isArray(cfg.artifacts) || cfg.artifacts.length === 0) {
    console.error(`${LABEL} FAIL — registry declares zero artifacts. An empty scope is not a pass.`); process.exit(1);
  }

  let liveSha;
  try { liveSha = fetchHealthzVersionSync(); }
  catch (e) { console.error(`${LABEL} FAIL — cannot read live healthz: ${e.message}`); process.exit(1); }
  if (!expandSha(ROOT, liveSha)) { try { execSync("git fetch -q origin", { cwd: ROOT, stdio: "ignore" }); } catch {} }
  const liveFull = expandSha(ROOT, liveSha) || liveSha;

  const read = (rel) => {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) return null;
    try {
      const doc = JSON.parse(fs.readFileSync(p, "utf8"));
      const sha = doc.healthzSha || doc.healthz_sha || null;
      if (sha && expandSha(ROOT, sha)) {
        try { doc.__behind = Number(execSync(`git rev-list --count ${sha}..${liveFull}`, { cwd: ROOT, encoding: "utf8" }).trim()); } catch {}
      }
      return doc;
    } catch { return null; }
  };

  const { problems, warnings, stats } = analyse({
    artifacts: cfg.artifacts, liveSha: liveFull, nowMs: Date.now(), read,
    ancestorOf: (a, b) => ancestorCheck(ROOT, a, b),
  });

  console.log(`${LABEL}: live=${liveSha} checked=${stats.checked} fresh=${stats.fresh} stale=${stats.stale}`);
  for (const w of warnings) console.log(`  warn: ${w}`);
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
