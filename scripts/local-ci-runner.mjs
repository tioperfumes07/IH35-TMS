#!/usr/bin/env node
/**
 * LOCAL CI RUNNER — the GitHub Actions billing-lock workaround (owner 2026-10-02: "find solution to GitHub, we use
 * other methods").
 *
 * GitHub Actions jobs never start while the account is billing-locked, but the commit-STATUS API is part of the
 * repository, not of Actions — it keeps working. This runner checks out a PR's head in its own throwaway worktree,
 * runs the same commands CI's required jobs run, and posts each result as a commit status on the PR head SHA
 * (context `local-ci/<step>` plus an aggregate `local-ci`). PRs show real green / red checks again, produced on this
 * machine instead of on GitHub-hosted runners.
 *
 * Steps (from .github/workflows/ci.yml + required-checks.yml):
 *   static-guards   node --test scripts/lib/run-required-guards.test.mjs          (ci.yml required-static-guards)
 *   money-gate      node scripts/money-pr-local-gate.mjs                          (pre-push gate)
 *   frontend-tsc    generate-module-completion-data + apps/frontend tsc -b        (build-typecheck-heavy)
 *   frontend-build  apps/frontend vite build                                      (build-typecheck-heavy)
 *   backend-build   npm run build:backend                                         (build-typecheck-heavy)
 *   backend-unit    vitest run (apps/backend, unit suites; *.db.test.ts excluded) — fails only on tests that fail on the
 *                   PR but NOT on current origin/main (main's own failures are ambient, listed, never hidden)
 *   migrate-precommit  db:migrate on a local throwaway Postgres + verify:pre-commit — ONLY with LOCAL_CI_MIGRATE=1
 *                   (db:migrate is run by the owner / Lead; the runner never applies a migration on its own).
 *
 * Usage: node scripts/local-ci-runner.mjs <pr-number> [--no-post] [--keep]
 *   env: SEAT (default CC-1), READONLY_DATABASE_URL (for the money gate's live checks; optional)
 * Exit 0 only when every step that ran passed. Writes the full log of each step under the worktree's .local-ci/.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = process.env.LOCAL_CI_REPO ?? "tioperfumes07/IH35-TMS";
const pr = process.argv.find((a) => /^\d+$/.test(a));
const POST = !process.argv.includes("--no-post");
const KEEP = process.argv.includes("--keep");

export const STEPS = [
  { name: "static-guards", cmd: "node --test scripts/lib/run-required-guards.test.mjs" },
  { name: "money-gate", cmd: "node scripts/money-pr-local-gate.mjs" },
  { name: "frontend-tsc", cmd: "node scripts/generate-module-completion-data.mjs && cd apps/frontend && npx tsc -b --pretty false" },
  { name: "frontend-build", cmd: "cd apps/frontend && npx vite build" },
  { name: "backend-build", cmd: "npm run build:backend" },
  { name: "backend-unit", cmd: "cd apps/backend && npx vitest run --exclude '**/*.db.test.ts' --reporter=dot", compareToMain: true },
  { name: "migrate-precommit", cmd: "npm run db:migrate && npm run verify:pre-commit", gated: "LOCAL_CI_MIGRATE" },
];

function sh(cmd, cwd, env = {}) {
  return spawnSync("bash", ["-lc", cmd], { cwd, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function postStatus(sha, context, state, description) {
  if (!POST) return;
  const r = spawnSync("gh", ["api", `repos/${REPO}/statuses/${sha}`, "-f", `state=${state}`, "-f", `context=${context}`, "-f", `description=${description.slice(0, 139)}`], { encoding: "utf8" });
  if (r.status !== 0) console.error(`[local-ci] could not post status ${context}: ${(r.stderr || r.stdout).trim()}`);
}

/** Failing test ids in a vitest log (" FAIL  file > suite > test"). */
export function failingTests(log) {
  return new Set((log.match(/^ FAIL {1,2}.+$/gm) ?? []).map((l) => l.replace(/\s+\d+ms$/, "").trim()));
}

/** The same step run on current origin/main, cached per main commit — the ambient baseline. */
function mainBaseline(step, env) {
  const mainSha = sh("git rev-parse origin/main", ROOT).stdout.trim();
  const cache = path.join(os.tmpdir(), `ih35-local-ci-main-${step.name}-${mainSha.slice(0, 12)}.log`);
  if (fs.existsSync(cache)) return fs.readFileSync(cache, "utf8");
  const dir = path.join(os.tmpdir(), `ih35-local-ci-main-${mainSha.slice(0, 8)}`);
  if (!fs.existsSync(dir)) sh(`git worktree add -q --detach ${JSON.stringify(dir)} ${mainSha}`, ROOT);
  linkModules(dir);
  const r = sh(step.cmd, dir, env);
  const log = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  fs.writeFileSync(cache, log);
  sh(`git worktree remove --force ${JSON.stringify(dir)}`, ROOT);
  return log;
}

function linkModules(dir) {
  for (const d of ["", "apps/backend/", "apps/frontend/"]) {
    const src = path.join(ROOT, d, "node_modules");
    const dst = path.join(dir, d, "node_modules");
    if (fs.existsSync(src) && !fs.existsSync(dst)) fs.symlinkSync(src, dst);
  }
}

function main() {
  if (!pr) { console.error("usage: node scripts/local-ci-runner.mjs <pr-number> [--no-post] [--keep]"); process.exit(2); }
  const head = sh(`gh pr view ${pr} --repo ${REPO} --json headRefOid -q .headRefOid`, ROOT);
  const sha = head.stdout.trim();
  if (head.status !== 0 || !/^[0-9a-f]{40}$/.test(sha)) { console.error(`[local-ci] cannot resolve PR #${pr} head: ${head.stderr}`); process.exit(2); }
  const dir = path.join(os.tmpdir(), `ih35-local-ci-${pr}-${sha.slice(0, 8)}`);
  const fetch = sh(`git fetch -q origin refs/pull/${pr}/head && git worktree add -q --detach ${JSON.stringify(dir)} ${sha}`, ROOT);
  if (fetch.status !== 0) { console.error(`[local-ci] checkout failed: ${fetch.stderr}`); process.exit(2); }
  linkModules(dir);
  const logDir = path.join(dir, ".local-ci");
  fs.mkdirSync(logDir, { recursive: true });
  const env = { SEAT: process.env.SEAT ?? "CC-1", SKIP_LIVE_NETWORK_CHECKS: "true" };
  if (process.env.READONLY_DATABASE_URL) Object.assign(env, { DATABASE_URL: process.env.READONLY_DATABASE_URL, DATABASE_DIRECT_URL: process.env.READONLY_DATABASE_URL });

  console.log(`[local-ci] PR #${pr} @ ${sha.slice(0, 10)} in ${dir}`);
  postStatus(sha, "local-ci", "pending", "local CI running (GitHub Actions billing-locked)");
  const results = [];
  for (const step of STEPS) {
    const context = `local-ci/${step.name}`;
    if (step.gated && process.env[step.gated] !== "1") {
      results.push({ name: step.name, state: "skipped" });
      postStatus(sha, context, "success", `skipped — set ${step.gated}=1 (owner / Lead runs db:migrate)`);
      console.log(`  - ${step.name.padEnd(18)} SKIPPED (${step.gated} not set)`);
      continue;
    }
    postStatus(sha, context, "pending", "running");
    const t0 = Date.now();
    const r = sh(step.cmd, dir, env);
    const secs = Math.round((Date.now() - t0) / 1000);
    const log = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    fs.writeFileSync(path.join(logDir, `${step.name}.log`), log);
    let ok = r.status === 0;
    let tail = log.split("\n").find((l) => /FAIL —|rejected this branch|error TS|Error:/.test(l))?.trim() ?? log.trim().split("\n").filter(Boolean).slice(-1)[0] ?? "";
    if (!ok && step.compareToMain) {
      const prFails = failingTests(log);
      const mainFails = failingTests(mainBaseline(step, env));
      const added = [...prFails].filter((t) => !mainFails.has(t));
      fs.writeFileSync(path.join(logDir, `${step.name}.new-failures.txt`), added.join("\n"));
      ok = added.length === 0;
      tail = ok ? `${prFails.size} failure(s), all also failing on origin/main (ambient)` : `${added.length} NEW failure(s) vs main: ${added[0]}`;
    }
    results.push({ name: step.name, state: ok ? "success" : "failure", secs });
    postStatus(sha, context, ok ? "success" : "failure", `${ok ? "passed" : "FAILED"} in ${secs}s${tail && (!ok || step.compareToMain) ? ` — ${tail}` : ""}`);
    console.log(`  ${ok ? "✓" : "✗"} ${step.name.padEnd(18)} ${secs}s${ok ? "" : `  ${tail.slice(0, 160)}`}`);
  }
  const failed = results.filter((r) => r.state === "failure").map((r) => r.name);
  postStatus(sha, "local-ci", failed.length ? "failure" : "success", failed.length ? `failed: ${failed.join(", ")}` : `all ${results.filter((r) => r.state === "success").length} steps passed`);
  console.log(`[local-ci] ${failed.length ? `FAILED: ${failed.join(", ")}` : "PASS"} — logs in ${logDir}`);
  if (!KEEP) sh(`git worktree remove --force ${JSON.stringify(dir)}`, ROOT);
  process.exit(failed.length ? 1 : 0);
}

if (process.argv.includes("--selftest")) {
  const names = STEPS.map((s) => s.name);
  const ok = names.includes("static-guards") && names.includes("backend-unit") && STEPS.find((s) => s.name === "migrate-precommit")?.gated === "LOCAL_CI_MIGRATE";
  console.log(ok ? "local-ci-runner --selftest PASS (steps present; migrate step owner-gated)" : "local-ci-runner --selftest FAIL");
  process.exit(ok ? 0 : 1);
}
main();
