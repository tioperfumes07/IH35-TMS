#!/usr/bin/env node
/**
 * TOOL-F03 companion — feature PRs must not edit CLAIMED-NUMBERS.json.
 *
 * GitHub cannot run merge=json-union; every CLAIMED touch conflicts every sibling PR.
 * Uniqueness = verify-steps directory; lane band = verify-verify-step-lane-band;
 * registry step 1599 reports drift only.
 *
 * Allowlist: branch name starts with chore/claimed-regen OR commit subject contains CLAIMED-REGEN.
 */
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-claimed-numbers-edits";
const TARGET = "scripts/verify-steps/CLAIMED-NUMBERS.json";

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function assertNoClaimedEdits({ changedFiles, branch, commitSubjects }) {
  const errs = [];
  if (!changedFiles?.includes(TARGET)) return errs;
  const branchOk = typeof branch === "string" && branch.startsWith("chore/claimed-regen");
  const subjectOk = (commitSubjects || []).some((s) => /\bCLAIMED-REGEN\b/.test(s));
  if (branchOk || subjectOk) return errs;
  errs.push(
    `${LABEL}: feature PR edits ${TARGET}. Filename is the claim (TOOL-F03). ` +
      `Use Cursor EVEN / Claude ODD step files only. Regen registry on branch chore/claimed-regen* ` +
      `or with commit subject CLAIMED-REGEN.`,
  );
  return errs;
}

function selftest() {
  const bad = assertNoClaimedEdits({
    changedFiles: [TARGET],
    branch: "fix/saf-b31",
    commitSubjects: ["fix(safety): export honesty"],
  });
  if (bad.length !== 1) {
    console.error(`${LABEL}: selftest FAIL — feature edit must be caught`);
    process.exit(1);
  }
  const okBranch = assertNoClaimedEdits({
    changedFiles: [TARGET],
    branch: "chore/claimed-regen-2026-07-31",
    commitSubjects: ["chore: sync"],
  });
  if (okBranch.length) {
    console.error(`${LABEL}: selftest FAIL — chore/claimed-regen must pass`);
    process.exit(1);
  }
  const okSubject = assertNoClaimedEdits({
    changedFiles: [TARGET],
    branch: "fix/anything",
    commitSubjects: ["CLAIMED-REGEN: sync registry from disk"],
  });
  if (okSubject.length) {
    console.error(`${LABEL}: selftest FAIL — CLAIMED-REGEN subject must pass`);
    process.exit(1);
  }
  const clean = assertNoClaimedEdits({
    changedFiles: ["scripts/verify-steps/1906-verify-no-claimed-numbers-edits.mjs"],
    branch: "fix/tool-f03",
    commitSubjects: ["fix(ci): TOOL-F03"],
  });
  if (clean.length) {
    console.error(`${LABEL}: selftest FAIL — no CLAIMED touch must pass`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  let changed = [];
  try {
    changed = sh("git diff --name-only origin/main...HEAD").split("\n").filter(Boolean);
  } catch {
    changed = sh("git diff --name-only main...HEAD").split("\n").filter(Boolean);
  }
  let branch = "";
  try {
    branch = sh("git rev-parse --abbrev-ref HEAD");
  } catch {
    branch = "";
  }
  let subjects = [];
  try {
    subjects = sh("git log --format=%s origin/main..HEAD").split("\n").filter(Boolean);
  } catch {
    subjects = [];
  }
  const errs = assertNoClaimedEdits({ changedFiles: changed, branch, commitSubjects: subjects });
  if (errs.length) {
    for (const e of errs) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — ${TARGET} not edited on this branch (or allowlisted regen)`);
}

main();
