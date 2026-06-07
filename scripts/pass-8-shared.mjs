#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

export const PASS8_COUNTS = {
  modules: 19,
  workflows: 65,
  error_codes: 261,
  must_clauses: 515,
  locked_invariants: 31,
  integration_health: 1,
  financial_integrity: 1,
};

export const PASS8_ARTIFACTS = {
  json: path.join(ROOT, "docs/audits/PASS-8-PRE-PROD-SMOKE-RESULTS.json"),
  md: path.join(ROOT, "docs/audits/PASS-8-PRE-PROD-SMOKE-RESULTS.md"),
};

export function loadText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

export function toKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function statusFromFindings(failures) {
  return failures.length === 0 ? "PASS" : "FAIL";
}

export function recommendationFromAreas(areas) {
  return areas.every((a) => a.status === "PASS") ? "GO_RECOMMENDED" : "NO_GO_RECOMMENDED";
}

export function emitStepResult(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

export function ensureAuditDir() {
  fs.mkdirSync(path.join(ROOT, "docs/audits"), { recursive: true });
}

export function nowIso() {
  return new Date().toISOString();
}
