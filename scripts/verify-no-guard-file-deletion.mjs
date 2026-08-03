#!/usr/bin/env node
/**
 * GUARD: branch must not delete scripts/verify-*.mjs or verify-steps that exist on origin/main.
 *
 * WHY (2026-08-02): Cursor soft-reset onto a newer main after other PRs merged, then recommitted.
 * The index silently staged DELETIONS of those PRs' verify-steps (2038, 2068, …). That is how
 * "refresh evidence" almost shipped a revert of other agents' guards.
 *
 * Escape hatch: tip commit message contains INTENTIONAL_GUARD_RETIRE: <path rationale>
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-guard-file-deletion";
const SELFTEST = process.argv.includes("--selftest");

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

function deletedGuardPaths() {
  let base = "origin/main";
  try {
    sh("git rev-parse --verify origin/main");
  } catch {
    return [];
  }
  const out = sh(`git diff --name-status ${base}...HEAD`);
  const deleted = [];
  for (const line of out.split("\n").filter(Boolean)) {
    const [status, ...rest] = line.split(/\s+/);
    const file = rest[rest.length - 1];
    if (status !== "D" && !status.startsWith("D")) continue;
    if (
      /^scripts\/verify-[^/]+\.mjs$/.test(file) ||
      /^scripts\/verify-steps\/\d+-.*\.mjs$/.test(file)
    ) {
      deleted.push(file);
    }
  }
  return deleted;
}

export function assertNoGuardDeletion(opts = {}) {
  const problems = [];
  const tipBody = opts.tipBody ?? (() => {
    try {
      return sh("git log -1 --format=%B");
    } catch {
      return "";
    }
  })();
  const deleted = opts.deleted ?? deletedGuardPaths();
  if (!deleted.length) return problems;
  if (/INTENTIONAL_GUARD_RETIRE\s*:/i.test(tipBody)) return problems;
  problems.push(
    `Branch deletes guard file(s) present on origin/main: ${deleted.join(", ")}. ` +
      `This is the soft-reset-onto-newer-main defect class (Rule 30). Cherry-pick your fix onto ` +
      `origin/main instead. If retiring a guard on purpose, put INTENTIONAL_GUARD_RETIRE: <why> in the tip commit.`,
  );
  return problems;
}

if (SELFTEST) {
  const failures = [];
  const a = assertNoGuardDeletion({
    deleted: ["scripts/verify-steps/2068-verify-safety-b29-typeahead-remaining.mjs"],
    tipBody: "fix(x): oops\nROOT CAUSE: y\n",
  });
  if (!a.some((p) => p.includes("soft-reset"))) {
    failures.push(`expected catch, got: ${a.join(" | ") || "none"}`);
  }
  const b = assertNoGuardDeletion({
    deleted: ["scripts/verify-steps/2068-verify-safety-b29-typeahead-remaining.mjs"],
    tipBody: "chore: retire\nINTENTIONAL_GUARD_RETIRE: superseded by 2080\n",
  });
  if (b.length) failures.push(`escape hatch false positive: ${b.join(" | ")}`);
  const c = assertNoGuardDeletion({ deleted: [], tipBody: "ok" });
  if (c.length) failures.push(`empty delete false positive: ${c.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertNoGuardDeletion();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — no verify-* / verify-steps deletions vs origin/main`);
process.exit(0);
