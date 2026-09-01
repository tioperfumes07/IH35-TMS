#!/usr/bin/env node
/**
 * HEALTH-NO-SHA-01 — GET /api/v1/healthz MUST expose commit SHA + build timestamp + branch.
 *
 * WHY
 * Deep health used to return only `{ ok, checks }` with no build identity. Seats polling
 * `/api/v1/healthz` (not `/healthz/shallow`) could not tell which commit was serving — every
 * "is it live yet" question for sort / settlements / bulk void became unanswerable. Codex
 * re-entry condition 5 ("deployed health SHA") is impossible without these fields.
 *
 * Required identity keys (via healthzBuildIdentity on BOTH /healthz and /healthz/shallow):
 *   version | commit (short) · git_sha (full) · built_at · git_branch
 *
 * CI: verify-step 10206 (auto-discovered by verify:pre-commit / locked-guards) AND
 *     .github/workflows/healthz-exposes-sha.yml (named workflow: healthz must expose the SHA).
 *
 *   node scripts/verify-healthz-exposes-sha.mjs
 *   node scripts/verify-healthz-exposes-sha.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-healthz-exposes-sha";
const HEALTH = "apps/backend/src/health/health.routes.ts";
const WORKFLOW = ".github/workflows/healthz-exposes-sha.yml";

function read(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

export function healthzShaErrors(src, workflowSrc) {
  const failures = [];
  if (!src) {
    failures.push(`${HEALTH} — MISSING`);
    return failures;
  }
  if (!/export function resolveBackendGitSha\s*\(/.test(src)) {
    failures.push(`${HEALTH} — must export resolveBackendGitSha()`);
  }
  if (!/export function resolveBuildTimestamp\s*\(/.test(src)) {
    failures.push(`${HEALTH} — must export resolveBuildTimestamp()`);
  }
  if (!/export function resolveBuildRef\s*\(/.test(src)) {
    failures.push(`${HEALTH} — must export resolveBuildRef() (branch/tag)`);
  }
  if (!/export function healthzBuildIdentity\s*\(/.test(src)) {
    failures.push(`${HEALTH} — must export healthzBuildIdentity()`);
  }
  if (!/git_sha/.test(src) || !/resolveBackendGitSha\(\)/.test(src)) {
    failures.push(`${HEALTH} — healthzBuildIdentity must expose git_sha from resolveBackendGitSha()`);
  }
  if (!/built_at:\s*resolveBuildTimestamp\(\)/.test(src)) {
    failures.push(`${HEALTH} — healthzBuildIdentity must set built_at: resolveBuildTimestamp()`);
  }
  if (!/git_branch:\s*resolveBuildRef\(\)/.test(src)) {
    failures.push(`${HEALTH} — healthzBuildIdentity must set git_branch: resolveBuildRef()`);
  }
  if (!/\bcommit:\s*resolveBackendVersion\(\)/.test(src) && !/\bcommit:/.test(src)) {
    failures.push(`${HEALTH} — healthzBuildIdentity must expose commit (short SHA)`);
  }
  if (!/app\.get\(\s*["']\/api\/v1\/healthz["']/.test(src)) {
    failures.push(`${HEALTH} — must register GET /api/v1/healthz`);
  }
  if (!/\.\.\.healthzBuildIdentity\(\)/.test(src)) {
    failures.push(`${HEALTH} — must spread ...healthzBuildIdentity() into health responses`);
  }
  const spreads = [...src.matchAll(/\.\.\.healthzBuildIdentity\(\)/g)];
  if (spreads.length < 2) {
    failures.push(
      `${HEALTH} — both /healthz/shallow and /healthz must spread healthzBuildIdentity() (found ${spreads.length})`,
    );
  }
  if (/\.send\(\s*\{\s*ok:\s*overallOk,\s*checks\s*\}\s*\)/.test(src)) {
    failures.push(`${HEALTH} — deep /healthz must not send checks-only { ok, checks } (HEALTH-NO-SHA-01)`);
  }

  if (!workflowSrc) {
    failures.push(`${WORKFLOW} — MISSING (named CI workflow: healthz must expose the SHA)`);
  } else {
    if (!/verify-healthz-exposes-sha\.mjs/.test(workflowSrc)) {
      failures.push(`${WORKFLOW} — must run scripts/verify-healthz-exposes-sha.mjs`);
    }
    if (!/healthz must expose the SHA/i.test(workflowSrc) && !/HEALTH-NO-SHA/.test(workflowSrc)) {
      failures.push(`${WORKFLOW} — must name HEALTH-NO-SHA / healthz must expose the SHA`);
    }
  }
  return failures;
}

function selftest() {
  const good = `
    export function resolveBackendGitSha() { return "abc"; }
    export function resolveBuildTimestamp() { return "2026-09-01T00:00:00.000Z"; }
    export function resolveBuildRef() { return "main"; }
    export function healthzBuildIdentity() {
      const git_sha = resolveBackendGitSha();
      return {
        version: "abcdef1",
        git_sha,
        commit: resolveBackendVersion(),
        built_at: resolveBuildTimestamp(),
        git_branch: resolveBuildRef(),
      };
    }
    app.get("/api/v1/healthz/shallow", async () => ({ ok: true, ...healthzBuildIdentity() }));
    app.get("/api/v1/healthz", async (_req, reply) => {
      return reply.code(200).send({ ok: true, ...healthzBuildIdentity(), checks: [] });
    });
  `;
  const goodWf = `
    name: healthz must expose the SHA
    # HEALTH-NO-SHA-01
    run: node scripts/verify-healthz-exposes-sha.mjs
  `;
  const planted = [
    ["missing git_sha helper", good.replace("export function resolveBackendGitSha", "function resolveBackendGitSha"), "resolveBackendGitSha"],
    ["missing built_at helper", good.replace("export function resolveBuildTimestamp", "function resolveBuildTimestamp"), "resolveBuildTimestamp"],
    ["missing branch helper", good.replace("export function resolveBuildRef", "function resolveBuildRef"), "resolveBuildRef"],
    ["checks-only deep send", good.replace("...healthzBuildIdentity(), checks: []", "checks: []").replace(
      "app.get(\"/api/v1/healthz/shallow\", async () => ({ ok: true, ...healthzBuildIdentity() }));",
      "app.get(\"/api/v1/healthz/shallow\", async () => ({ ok: true }));",
    ), "healthzBuildIdentity"],
    ["pre-fix checks-only shape", good + `\n    reply.send({ ok: overallOk, checks });\n`, "checks-only"],
    ["missing workflow", good, null, "MISSING"],
  ];
  const goodErrors = healthzShaErrors(good, goodWf);
  const missed = planted.filter((row) => {
    const [, fixture, needle, wfNeedle] = row;
    const errs = healthzShaErrors(fixture, wfNeedle === "MISSING" ? null : goodWf);
    const want = wfNeedle === "MISSING" ? "MISSING" : needle;
    return !errs.some((f) => f.includes(want));
  });
  if (goodErrors.length || missed.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const e of goodErrors) console.error(`  good rejected: ${e}`);
    for (const [name] of missed) console.error(`  planted not caught: ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${planted.length} planted)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = healthzShaErrors(read(HEALTH), read(WORKFLOW));
if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} — OK (deep + shallow healthz expose version/commit/git_sha/built_at/git_branch)`);
process.exit(0);
