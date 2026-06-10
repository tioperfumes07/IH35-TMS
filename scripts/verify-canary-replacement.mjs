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

// 4) Triggers are correct: PR gate on pull_request, post-deploy on push to main.
mustContain(".github/workflows/pr-preview-smoke.yml", "pull_request", "Layer 1 must trigger on pull_request");
mustContain(".github/workflows/prod-postdeploy-verify.yml", "push", "Layer 2 must trigger on push to main");

// 5) Neither replacement self-triggers a production deploy (Render auto-deploy owns that).
mustNotContain(".github/workflows/prod-postdeploy-verify.yml", "Promote to production",
  "post-deploy verify must not re-trigger a prod deploy");

// 6) Required-checks wiring: the dead canary must be removed and the new PR gate present,
//    wherever required checks are declared in this repo.
{
  const candidates = [
    ".github/workflows/required-checks.yml",
    ".github/branch-protection-config.json",
    "branch-protection-config.json",
  ].filter((rel) => fs.existsSync(path.join(ROOT, rel)));
  if (candidates.length === 0) {
    errors.push("Could not find a required-checks file (.github/workflows/required-checks.yml or branch-protection-config.json) to verify the gate wiring");
  } else {
    const joined = candidates.map((rel) => read(rel) || "").join("\n");
    if (/Canary Preview Smoke/.test(joined)) {
      errors.push(`A required-checks file still references "Canary Preview Smoke" (must be removed): ${candidates.join(", ")}`);
    }
    if (!/PR Preview Smoke/.test(joined)) {
      errors.push(`No required-checks file declares "PR Preview Smoke" as a required check: ${candidates.join(", ")}`);
    }
  }
}

// 7) package.json wires this very guard (so it actually runs in CI).
mustContain("package.json", "verify:canary-replacement", "package.json must expose the verify:canary-replacement script");

if (errors.length) {
  console.error(`[${LABEL}] FAIL`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`[${LABEL}] PASS - canary replaced by PR Preview Smoke + Production Post-Deploy Verify; health path correct; required-checks rewired`);
