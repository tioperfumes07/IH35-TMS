#!/usr/bin/env node
/**
 * HEALTH-NO-SHA-01 — GET /api/v1/healthz MUST expose commit SHA + build timestamp.
 *
 * WHY
 * Deep health used to return only `{ ok, checks }` with no build identity. Seats polling
 * `/api/v1/healthz` (not `/healthz/shallow`) could not tell which commit was serving — every
 * "is it live yet" question for sort / settlements / bulk void became unanswerable. CC-1's
 * Codex re-entry bar requires confirming the deployed build via the health endpoint.
 *
 * `/healthz/shallow` already carried `version` (7-char). Full `/healthz` must carry the same
 * identity: `version`, `git_sha`, `built_at` via `healthzBuildIdentity()`.
 *
 * CI: verify-step 10206 (auto-discovered by verify:pre-commit / locked-guards step runner —
 * named workflow surface for "healthz must expose the SHA").
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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function healthzShaErrors(src) {
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
  if (!/export function healthzBuildIdentity\s*\(/.test(src)) {
    failures.push(`${HEALTH} — must export healthzBuildIdentity()`);
  }
  if (!/git_sha:\s*resolveBackendGitSha\(\)/.test(src)) {
    failures.push(`${HEALTH} — healthzBuildIdentity must set git_sha: resolveBackendGitSha()`);
  }
  if (!/built_at:\s*resolveBuildTimestamp\(\)/.test(src)) {
    failures.push(`${HEALTH} — healthzBuildIdentity must set built_at: resolveBuildTimestamp()`);
  }
  // Deep /healthz send must spread identity (not checks-only).
  if (!/app\.get\(\s*["']\/api\/v1\/healthz["']/.test(src)) {
    failures.push(`${HEALTH} — must register GET /api/v1/healthz`);
  }
  const deepHandler = src.slice(src.search(/app\.get\(\s*["']\/api\/v1\/healthz["']/));
  const deepBody = deepHandler.slice(0, deepHandler.search(/app\.get\(|$/) || deepHandler.length);
  // Isolate to the deep route: after /healthz/shallow and /readyz the last get is deep healthz.
  // Prefer: reply.send / .send({ includes ...healthzBuildIdentity()
  if (!/\.\.\.healthzBuildIdentity\(\)/.test(src)) {
    failures.push(`${HEALTH} — must spread ...healthzBuildIdentity() into health responses`);
  }
  // Count spreads — shallow + deep both require identity (HEALTH-NO-SHA-01 + lead shallow law).
  const spreads = [...src.matchAll(/\.\.\.healthzBuildIdentity\(\)/g)];
  if (spreads.length < 2) {
    failures.push(
      `${HEALTH} — both /healthz/shallow and /healthz must spread healthzBuildIdentity() (found ${spreads.length})`,
    );
  }
  // Deep payload must still include checks (identity is additive, not a replacement).
  if (!/checks/.test(deepBody) && !/\bchecks\b/.test(src)) {
    failures.push(`${HEALTH} — deep /healthz must still return checks`);
  }
  // Forbid the pre-fix checks-only shape on the deep route send.
  if (/\.send\(\s*\{\s*ok:\s*overallOk,\s*checks\s*\}\s*\)/.test(src)) {
    failures.push(`${HEALTH} — deep /healthz must not send checks-only { ok, checks } (HEALTH-NO-SHA-01)`);
  }
  return failures;
}

function selftest() {
  const good = `
    export function resolveBackendGitSha() { return "abc"; }
    export function resolveBuildTimestamp() { return "2026-09-01T00:00:00.000Z"; }
    export function healthzBuildIdentity() {
      return { version: "abcdef1", git_sha: resolveBackendGitSha(), built_at: resolveBuildTimestamp() };
    }
    app.get("/api/v1/healthz/shallow", async () => ({ ok: true, ...healthzBuildIdentity() }));
    app.get("/api/v1/healthz", async (_req, reply) => {
      return reply.code(200).send({ ok: true, ...healthzBuildIdentity(), checks: [] });
    });
  `;
  const planted = [
    ["missing git_sha helper", good.replace("export function resolveBackendGitSha", "function resolveBackendGitSha"), "resolveBackendGitSha"],
    ["missing built_at helper", good.replace("export function resolveBuildTimestamp", "function resolveBuildTimestamp"), "resolveBuildTimestamp"],
    ["checks-only deep send", good.replace("...healthzBuildIdentity(), checks: []", "checks: []").replace(
      "app.get(\"/api/v1/healthz/shallow\", async () => ({ ok: true, ...healthzBuildIdentity() }));",
      "app.get(\"/api/v1/healthz/shallow\", async () => ({ ok: true }));",
    ), "healthzBuildIdentity"],
    ["pre-fix checks-only shape", good + `\n    reply.send({ ok: overallOk, checks });\n`, "checks-only"],
  ];
  const goodErrors = healthzShaErrors(good);
  const missed = planted.filter(([, fixture, needle]) => !healthzShaErrors(fixture).some((f) => f.includes(needle)));
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

const failures = healthzShaErrors(read(HEALTH));
if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} — OK (deep + shallow healthz expose version/git_sha/built_at)`);
process.exit(0);
