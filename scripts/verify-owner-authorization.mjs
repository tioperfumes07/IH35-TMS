#!/usr/bin/env node
// ROUND 133 (owner law, P0): "A production write is authorized ONLY by an OPEN, unexpired
// AUTH-<NNN> on main. Verify with scripts/verify-owner-authorization.mjs before you run it."
//
// Usage: node scripts/verify-owner-authorization.mjs AUTH-007 [--action-file <path>]
//   Exit 0 only if ALL hold. Any failure exits 1 and prints which condition failed.
//   Never prompts, never infers, never accepts a --force.
//
// DISCLOSED LIMITATION, not silently glossed over (found while building this, not assumed away):
// this check reads the AUTH block's own merge commit and confirms it was merged under the
// configured OWNER_GITHUB_LOGIN. In THIS repository, every coder seat (CC-1/CC-2/CC-3) merges
// under the SAME shared `gh` credential as the repo owner (verified live: `gh api user` and
// `repos/.../pulls/<n>`'s own `merged_by.login` show `tioperfumes07` for every PR checked,
// including ones a coder seat merged itself) -- there is no GitHub-identity signal in this
// environment that distinguishes "the owner personally merged this" from "a coder seat merged
// this under the owner's shared credential." This check still runs (so a future environment with
// a real distinct owner identity gets real protection immediately, and so this stays honest about
// what it verifies rather than silently dropping the check), but it is NOT the load-bearing part
// of this system today. The load-bearing part is: the AUTH text must exist as a byte-for-byte,
// permanent, reviewable, append-only artifact ON MAIN before any seat may act on it -- turning "a
// relayed chat instruction, gone the moment the conversation scrolls" into "a written commit
// anyone can audit after the fact," which is real protection even without identity verification.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OWNER_GITHUB_LOGIN = "tioperfumes07";
const REPO = "tioperfumes07/IH35-TMS";
const FILE_PATH = "docs/bus/OWNER-AUTHORIZATIONS.md";

function fail(reason) {
  console.error(`verify-owner-authorization: FAIL — ${reason}`);
  process.exit(1);
}

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const authId = process.argv[2];
if (!authId || !/^AUTH-\d+$/.test(authId)) {
  fail(`first argument must be an AUTH-<NNN> id (got ${JSON.stringify(authId ?? null)}).`);
}

const actionFileIdx = process.argv.indexOf("--action-file");
const actionFile = actionFileIdx >= 0 ? process.argv[actionFileIdx + 1] : null;

// Fetch FROM main, never the local working copy, never a branch, never a paste.
try {
  run(`git fetch origin main --quiet`);
} catch (e) {
  fail(`could not fetch origin main: ${e instanceof Error ? e.message : String(e)}`);
}

let fileAtMain;
try {
  fileAtMain = run(`git show origin/main:${FILE_PATH}`);
} catch (e) {
  fail(`${FILE_PATH} does not exist at origin/main (${e instanceof Error ? e.message : String(e)}).`);
}

const blockRe = new RegExp(
  `## ${authId}\\n((?:(?!\\n## AUTH-)[\\s\\S])*)`,
  "m"
);
const m = fileAtMain.match(blockRe);
if (!m) {
  fail(`${authId} does not exist in ${FILE_PATH} at origin/main.`);
}
const block = m[1];

function field(name) {
  const fm = block.match(new RegExp(`^${name}:\\s*(.*)$`, "m"));
  return fm ? fm[1].trim() : null;
}

const status = field("status");
if (status !== "OPEN") {
  fail(`${authId} status is ${JSON.stringify(status)}, not OPEN.`);
}

const expiresAt = field("expires_at");
if (!expiresAt) fail(`${authId} has no expires_at field.`);
const expiresMs = Date.parse(expiresAt);
if (Number.isNaN(expiresMs)) fail(`${authId} expires_at ${JSON.stringify(expiresAt)} is not a valid ISO timestamp.`);
if (Date.now() >= expiresMs) {
  fail(`${authId} expired at ${expiresAt} (now: ${new Date().toISOString()}).`);
}

const declaredAction = field("action");
if (!declaredAction) fail(`${authId} has no action field.`);

if (actionFile) {
  let actualAction;
  try {
    actualAction = fs.readFileSync(actionFile, "utf8").trim();
  } catch (e) {
    fail(`could not read --action-file ${actionFile}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (actualAction !== declaredAction.trim()) {
    fail(
      `${authId}'s action text does not match --action-file byte for byte.\n` +
        `  DECLARED: ${JSON.stringify(declaredAction)}\n` +
        `  ACTUAL:   ${JSON.stringify(actualAction)}`
    );
  }
}

// Which commit introduced the "## <authId>" heading line, and who merged the PR that landed it.
let blameLine;
try {
  blameLine = run(`git log --follow --diff-filter=A -S"## ${authId}" --format=%H -- ${FILE_PATH}`).trim().split("\n").pop();
  if (!blameLine) {
    // The block may have been added in a commit that also modified the file (not a pure add) --
    // fall back to the nearest commit that introduced this exact heading text.
    blameLine = run(`git log -S"## ${authId}" --format=%H -- ${FILE_PATH}`).trim().split("\n").pop();
  }
} catch (e) {
  fail(`could not locate the commit that introduced ${authId}: ${e instanceof Error ? e.message : String(e)}`);
}
if (!blameLine) fail(`could not locate the commit that introduced ${authId} in ${FILE_PATH}'s history.`);

let mergedBy = null;
try {
  const prNumberMatch = run(`gh pr list --repo ${REPO} --state merged --search "${blameLine}" --json number --jq '.[0].number'`).trim();
  if (prNumberMatch) {
    mergedBy = run(`gh api repos/${REPO}/pulls/${prNumberMatch} --jq '.merged_by.login'`).trim();
  }
} catch {
  // gh lookup is best-effort context, not a hard requirement -- see the disclosed limitation above.
}
if (mergedBy && mergedBy !== OWNER_GITHUB_LOGIN) {
  fail(`${authId}'s introducing PR was merged by ${JSON.stringify(mergedBy)}, not the configured owner login ${JSON.stringify(OWNER_GITHUB_LOGIN)}.`);
}

console.log(`verify-owner-authorization: OK — ${authId} is OPEN, unexpired (expires ${expiresAt}), on origin/main at commit ${blameLine}${actionFile ? ", action text matches byte for byte" : ""}.`);
if (!mergedBy) {
  console.log(`  NOTE: could not independently confirm the merging identity via gh (see the disclosed limitation in this script's own header for why that check is not load-bearing in this environment).`);
}
process.exit(0);
