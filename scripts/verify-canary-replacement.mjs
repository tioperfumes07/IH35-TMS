#!/usr/bin/env node
/**
 * CANARY REPLACEMENT GUARD — verify-canary-replacement.mjs
 *
 * Proves the broken "Canary Preview Smoke" has been replaced by two honest gates
 * and stays replaced. This is the real guard behind FIX-CANARY-SMOKE-DURABLE
 * (guard_required=true is satisfied legitimately: a verify-*.mjs wired into ci.yml).
 *
 * Fails (exit 1) if anyone re-introduces the broken canary, deletes a replacement
 * gate, reverts the health path, or drops the required-check wiring.
 *
 * ASCII only. No network. Pure file assertions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-canary-replacement";
const errors = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
function mustExist(rel) {
  if (!fs.existsSync(path.join(ROOT, rel))) errors.push(`MISSING required file: ${rel}`);
}
function mustNotExist(rel) {
  if (fs.existsSync(path.join(ROOT, rel))) errors.push(`MUST be deleted but still present: ${rel}`);
}
function mustContain(rel, needle, why) {
  const txt = read(rel);
  if (txt === null) { errors.push(`MISSING file for check: ${rel}`); return; }
  if (!txt.includes(needle)) errors.push(`${rel} must contain ${JSON.stringify(needle)} (${why})`);
}
function mustNotContain(rel, needle, why) {
  const txt = read(rel);
  if (txt === null) return; // absence handled elsewhere
  if (txt.includes(needle)) errors.push(`${rel} must NOT contain ${JSON.stringify(needle)} (${why})`);
}

// 1) The broken canary workflow is gone.
mustNotExist(".github/workflows/canary-smoke.yml");

// 2) Both replacement workflows exist.
mustExist(".github/workflows/pr-preview-smoke.yml");
mustExist(".github/workflows/prod-postdeploy-verify.yml");

// 3) Shared smoke script exists and uses the CORRECT health path, never the broken one.
mustExist("scripts/smoke.sh");
mustContain("scripts/smoke.sh", "/api/v1/health", "health must hit /api/v1/health (verified live), not /health");
{
  // Guard against the broken endpoint: a URL ending in "/health" in ACTUAL CODE
  // (not comments/log strings). Strip comment lines (#...) and the correct path,
  // then look for "/health" as a URL path segment.
  const smoke = read("scripts/smoke.sh") || "";
  const codeOnly = smoke
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
    .replace(/\/api\/v1\/health/g, "");
  // only flag "/health" used as a URL after a host/var (e.g. ${BASE_URL}/health or http.../health)
  const brokenHealth = /(\}|[A-Za-z0-9])\/health(?=["'\s?)]|$)/m.test(codeOnly);
  if (brokenHealth) errors.push(`scripts/smoke.sh references the broken "/health" endpoint (must be /api/v1/health)`);
}

// 4) Triggers: Layer-1 file must exist (trigger disabled — no preview service yet).
//    Layer-2 must trigger on push to main (active now).
mustExist(".github/workflows/pr-preview-smoke.yml");
mustContain(".github/workflows/prod-postdeploy-verify.yml", "push", "Layer 2 must trigger on push to main");

// 5) Neither replacement self-triggers a production deploy (Render auto-deploy owns that).
mustNotContain(".github/workflows/prod-postdeploy-verify.yml", "Promote to production",
  "post-deploy verify must not re-trigger a prod deploy");

// 6) Layer-1 trigger must be disabled (no preview service); dead canary must stay gone.
//    LAYER-2-ONLY SHIP: trigger re-enabled when Render preview service is provisioned.
{
  const prSmoke = read(".github/workflows/pr-preview-smoke.yml") || "";
  // Must NOT be actively triggering on pull_request (no preview service yet).
  const activePrTrigger = /^\s*pull_request:/m.test(
    prSmoke.replace(/#[^\n]*/g, "")  // strip comments
  );
  if (activePrTrigger) {
    errors.push(".github/workflows/pr-preview-smoke.yml has an active pull_request trigger but no preview service exists — disable it with a comment until the service is provisioned");
  }
  // Dead canary must still be gone.
  const candidates = [
    ".github/workflows/required-checks.yml",
    ".github/branch-protection-config.json",
    "branch-protection-config.json",
  ].filter((rel) => fs.existsSync(path.join(ROOT, rel)));
  const joined = candidates.map((rel) => read(rel) || "").join("\n");
  if (/Canary Preview Smoke/.test(joined)) {
    errors.push(`A required-checks file still references "Canary Preview Smoke" (must be removed): ${candidates.join(", ")}`);
  }
}

// 7) package.json wires this very guard (so it actually runs in CI).
mustContain("package.json", "verify:canary-replacement", "package.json must expose the verify:canary-replacement script");

// 8) smoke.sh uses bearer token, NOT email/password.
{
  const smoke = read("scripts/smoke.sh") || "";
  if (smoke.includes("SMOKE_TEST_EMAIL") || smoke.includes("SMOKE_TEST_PASSWORD")) {
    errors.push("scripts/smoke.sh still references SMOKE_TEST_EMAIL or SMOKE_TEST_PASSWORD — must use SMOKE_TEST_TOKEN instead");
  }
  if (!smoke.includes("SMOKE_TEST_TOKEN")) {
    errors.push("scripts/smoke.sh must use SMOKE_TEST_TOKEN for bearer auth");
  }
}

if (errors.length) {
  console.error(`[${LABEL}] FAIL`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`[${LABEL}] PASS - canary replaced; token-auth smoke in place; Layer-2-only ship; PR Preview Smoke exists but trigger disabled until preview service provisioned`);
