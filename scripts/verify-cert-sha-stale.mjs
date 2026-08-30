#!/usr/bin/env node
/**
 * CERT-01 B1 — STALE rule must be mechanical.
 * FAIL: certify-module.mjs missing displayCertVerdict, allows CERTIFIED when SHAs
 * diverge, or ships an override flag.
 * PASS: --selftest 4/4 and source forbids override.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cert-sha-stale";
const RUNNER = path.join(ROOT, "scripts/certify-module.mjs");

function failures(src) {
  const out = [];
  if (!/export function displayCertVerdict/.test(src)) {
    out.push("certify-module.mjs must export displayCertVerdict");
  }
  if (!/return "STALE"/.test(src)) {
    out.push("displayCertVerdict must return STALE when cert.sha !== live healthz version");
  }
  if (/CERT_OVERRIDE|FORCE_CERTIFIED|skipStale|IH35_CERT_FORCE/.test(src)) {
    out.push("certify-module.mjs must not ship an override flag that keeps CERTIFIED on a stale SHA");
  }
  if (!/norm\(cert\.sha\)|normalizeSha\(artifact\?\.sha\)/.test(src)) {
    out.push("STALE compare must use cert.sha against live healthz version");
  }
  return out;
}

const src = fs.readFileSync(RUNNER, "utf8");

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    {
      name: "STALE return removed",
      mutate: (t) => t.replaceAll('return "STALE"', 'return "CERTIFIED"'),
    },
    {
      name: "override flag added",
      mutate: (t) =>
        t.replace(
          "export function displayCertVerdict(artifact, liveVersion) {",
          'export function displayCertVerdict(artifact, liveVersion, CERT_OVERRIDE = true) {\n  if (CERT_OVERRIDE) return "CERTIFIED";',
        ),
    },
  ];
  const escaped = [];
  for (const { name, mutate } of mutations) {
    const mutated = mutate(src);
    if (mutated === src) {
      escaped.push(`${name}: mutation anchor missing`);
      continue;
    }
    if (failures(mutated).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  const run = spawnSync(process.execPath, [RUNNER, "--selftest"], { encoding: "utf8" });
  if (run.status !== 0) {
    console.error(`${LABEL} SELFTEST FAIL — certify-module --selftest\n${run.stdout}${run.stderr}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted + runner 4/4`);
  process.exit(0);
}

const missing = failures(src);
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
const run = spawnSync(process.execPath, [RUNNER, "--selftest"], { encoding: "utf8", cwd: ROOT });
if (run.status !== 0) {
  console.error(`${LABEL} FAIL certify-module --selftest\n${run.stdout}${run.stderr}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — cert.sha !== live healthz → STALE, no override`);
