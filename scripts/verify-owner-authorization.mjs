#!/usr/bin/env node
/** @independent-input origin/main — reads the AUTH block's own adding commit and its merge (git log -S / git show origin/main), not only the declaration file. */
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

if (process.argv.includes("--selftest")) {
  const NOW = Date.parse("2026-10-12T09:00:00Z");
  const auth = (id, lines) => `## ${id}\n${lines.join("\n")}\n`;
  const good = ["status: OPEN", "expires_at: 2026-10-13T00:00:00Z", "action: node scripts/ops/run.mts --apply"];
  const doc = [
    auth("AUTH-900", good),
    auth("AUTH-901", ["status: CONSUMED", ...good.slice(1)]),
    auth("AUTH-902", [good[0], "expires_at: 2026-10-11T00:00:00Z", good[2]]),
    auth("AUTH-903", [good[0], "expires_at: tomorrow", good[2]]),
    auth("AUTH-904", [good[0], good[2]]),
    auth("AUTH-905", good.slice(0, 2)),
  ].join("\n");
  const planted = [
    ["unknown AUTH id", evaluateAuthBlock(doc, "AUTH-999", NOW)],
    ["status not OPEN", evaluateAuthBlock(doc, "AUTH-901", NOW)],
    ["expired", evaluateAuthBlock(doc, "AUTH-902", NOW)],
    ["unparseable expires_at", evaluateAuthBlock(doc, "AUTH-903", NOW)],
    ["no expires_at", evaluateAuthBlock(doc, "AUTH-904", NOW)],
    ["no action", evaluateAuthBlock(doc, "AUTH-905", NOW)],
    ["action text differs", evaluateAuthBlock(doc, "AUTH-900", NOW, "node scripts/ops/other.mts --apply")],
    ["a later block's fields do not leak into an earlier one", evaluateAuthBlock(`${auth("AUTH-906", ["status: OPEN"])}\n${auth("AUTH-907", good.slice(1))}`, "AUTH-906", NOW)],
  ];
  const escaped = planted.filter(([, v]) => !v.reason).map(([n]) => n);
  const clean = [evaluateAuthBlock(doc, "AUTH-900", NOW), evaluateAuthBlock(doc, "AUTH-900", NOW, good[2].slice("action: ".length))];
  const cleanFailed = clean.filter((v) => v.reason);
  for (const n of escaped) console.error(`  ✗ planted violation escaped: ${n}`);
  for (const v of cleanFailed) console.error(`  ✗ clean OPEN block refused: ${v.reason}`);
  const caught = planted.length - escaped.length;
  if (escaped.length || cleanFailed.length) {
    console.error(`verify-owner-authorization SELFTEST: FAIL ${caught}/${planted.length}`);
    process.exit(1);
  }
  console.log(`verify-owner-authorization SELFTEST: ${caught}/${planted.length} planted violations caught; ${clean.length} clean inputs pass`);
  process.exit(0);
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

/**
 * Pure: reads the AUTH block out of the OWNER-AUTHORIZATIONS text and returns { reason } on the first
 * failed condition, or { expiresAt } when the block is OPEN, unexpired, has an action and (if given)
 * that action matches actualAction byte for byte.
 */
export function evaluateAuthBlock(fileText, authId, nowMs, actualAction = null) {
  // CodeQL js/regex-injection: authId is caller input (argv) — escape every metacharacter so it can only
  // ever match itself literally (the CLI also restricts it to AUTH-<digits>; the export takes any string).
  const authIdLiteral = String(authId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRe = new RegExp(
    `## ${authIdLiteral}\\n((?:(?!\\n## AUTH-)[\\s\\S])*)`,
    "m"
  );
  const m = fileText.match(blockRe);
  if (!m) return { reason: `${authId} does not exist in ${FILE_PATH} at origin/main.` };
  const block = m[1];
  const field = (name) => {
    const fm = block.match(new RegExp(`^${name}:\\s*(.*)$`, "m"));
    return fm ? fm[1].trim() : null;
  };
  const status = field("status");
  if (status !== "OPEN") return { reason: `${authId} status is ${JSON.stringify(status)}, not OPEN.` };
  const expiresAt = field("expires_at");
  if (!expiresAt) return { reason: `${authId} has no expires_at field.` };
  const expiresMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) return { reason: `${authId} expires_at ${JSON.stringify(expiresAt)} is not a valid ISO timestamp.` };
  if (nowMs >= expiresMs) return { reason: `${authId} expired at ${expiresAt} (now: ${new Date(nowMs).toISOString()}).` };
  const declaredAction = field("action");
  if (!declaredAction) return { reason: `${authId} has no action field.` };
  if (actualAction !== null && actualAction !== declaredAction.trim()) {
    return {
      reason:
        `${authId}'s action text does not match --action-file byte for byte.\n` +
        `  DECLARED: ${JSON.stringify(declaredAction)}\n` +
        `  ACTUAL:   ${JSON.stringify(actualAction)}`,
    };
  }
  return { expiresAt };
}

let actualAction = null;
if (actionFile) {
  try {
    actualAction = fs.readFileSync(actionFile, "utf8").trim();
  } catch (e) {
    fail(`could not read --action-file ${actionFile}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
const verdict = evaluateAuthBlock(fileAtMain, authId, Date.now(), actualAction);
if (verdict.reason) fail(verdict.reason);
const expiresAt = verdict.expiresAt;

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
