#!/usr/bin/env node
/**
 * Hard-deny floor for Claude Code (.claude/settings.json).
 *
 * Deny outranks bypassPermissions — these Bash globs must stay present so every
 * Claude Code session (including unattended) cannot force-push, delete remote
 * branches, rm -rf, or drop/truncate via shell. Prod-SQL safety remains the
 * migration firewall + rehearse→apply (not this list). Do not add app-level ops.
 *
 * Guard fails if any floor entry is missing (narrowing without a deliberate PR).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-claude-settings-hard-deny";
const SETTINGS = path.join(ROOT, ".claude", "settings.json");

/** Minimum deny set — supersets OK; removing any entry FAILS. */
export const HARD_DENY_FLOOR = Object.freeze([
  "Bash(rm -rf *)",
  "Bash(git push --force*)",
  "Bash(git push -f *)",
  "Bash(git push * --delete*)",
  "Bash(git push * :*)",
  "Bash(git branch -D *)",
  "Bash(dropdb*)",
  "Bash(psql*DROP *)",
  "Bash(psql*TRUNCATE *)",
]);

export function analyseSettings(rawText) {
  const problems = [];
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    return [`${SETTINGS}: invalid JSON — ${e.message}`];
  }
  const deny = parsed?.permissions?.deny;
  if (!Array.isArray(deny)) {
    problems.push(`${SETTINGS}: permissions.deny must be an array (hard-deny floor)`);
    return problems;
  }
  const set = new Set(deny.map(String));
  for (const entry of HARD_DENY_FLOOR) {
    if (!set.has(entry)) {
      problems.push(
        `${SETTINGS}: missing deny floor entry ${JSON.stringify(entry)} — ` +
          `narrowing the hard-deny floor requires an explicit PR (deny outranks bypassPermissions)`,
      );
    }
  }
  return problems;
}

export function collectProblems(root = ROOT) {
  const settingsPath = path.join(root, ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) {
    return [`missing ${settingsPath} — hard-deny floor must be committed`];
  }
  return analyseSettings(fs.readFileSync(settingsPath, "utf8"));
}

function selftest() {
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };
  const good = JSON.stringify({ permissions: { deny: [...HARD_DENY_FLOOR, "Bash(extra *)"] } });
  t("full floor passes", analyseSettings(good).length === 0);
  const missing = JSON.stringify({
    permissions: { deny: HARD_DENY_FLOOR.filter((e) => e !== "Bash(git push --force*)") },
  });
  t("narrowing fails", analyseSettings(missing).some((p) => p.includes("git push --force")));
  t("no deny fails", analyseSettings("{}").length >= 1);
  t("invalid json fails", analyseSettings("{").length >= 1);
  return bad;
}

if (process.argv.includes("--selftest")) {
  const n = selftest();
  console.log(n === 0 ? `${LABEL} SELFTEST PASS` : `${LABEL} SELFTEST FAILED (${n})`);
  process.exit(n === 0 ? 0 : 1);
}

const problems = collectProblems();
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — ${HARD_DENY_FLOOR.length} hard-deny floor entries present in .claude/settings.json`);
