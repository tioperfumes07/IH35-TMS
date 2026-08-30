#!/usr/bin/env node
/**
 * CERT-01 B4 — FW 6. leafRe=.* Built theater cannot render CERTIFIED.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { displayCertVerdict, evaluateFw6 } from "./certify-module.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cert-fw6-leaf-specific";
const RUNNER = path.join(ROOT, "scripts/certify-module.mjs");

function failures(src) {
  const out = [];
  if (!/evaluateFw6/.test(src)) out.push("certify-module.mjs must export evaluateFw6");
  if (!/httpMountVerdict/.test(src)) out.push("certify-module.mjs must export httpMountVerdict (B5/B6 execute, not evidence regex)");
  if (!/items\?\.fw6 === "FAIL"/.test(src)) {
    out.push("displayCertVerdict must refuse CERTIFIED when fw6 is FAIL");
  }
  if (!/items\?\.fw5 === "FAIL"/.test(src)) {
    out.push("displayCertVerdict must refuse CERTIFIED when fw5 is FAIL");
  }
  if (!/items\?\.fw_rev === "FAIL"/.test(src)) {
    out.push("displayCertVerdict must refuse CERTIFIED when fw_rev is FAIL");
  }
  if (/CERT_OVERRIDE|FORCE_CERTIFIED|IH35_CERT_FORCE/.test(src)) {
    out.push("no override flag");
  }
  return out;
}

const src = fs.readFileSync(RUNNER, "utf8");

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const theater = displayCertVerdict({ sha: "5c82530", verdict: "CERTIFIED", items: { fw6: "FAIL" } }, "5c82530");
  if (theater !== "INCOMPLETE") {
    console.error(`${LABEL} SELFTEST FAIL — CERTIFIED+fw6 FAIL displayed ${theater}`);
    process.exit(1);
  }
  const deadRoute = displayCertVerdict({ sha: "5c82530", verdict: "CERTIFIED", items: { fw5: "FAIL" } }, "5c82530");
  if (deadRoute !== "INCOMPLETE") {
    console.error(`${LABEL} SELFTEST FAIL — CERTIFIED+fw5 FAIL displayed ${deadRoute}`);
    process.exit(1);
  }
  if (evaluateFw6([{ file: "f", cols: ["load"], leafRe: ".*" }]).fw6 !== "FAIL") {
    console.error(`${LABEL} SELFTEST FAIL — leafRe=.* escaped`);
    process.exit(1);
  }
  if (evaluateFw6([{ file: "f", cols: ["load"], leafRe: "^queues\\.trip_pairing$" }]).fw6 !== "PASS") {
    console.error(`${LABEL} SELFTEST FAIL — exact leaf rejected`);
    process.exit(1);
  }
  const mutations = [
    {
      name: "fw6 FAIL no longer blocks CERTIFIED",
      mutate: (t) => t.replace('if (artifact?.items?.fw6 === "FAIL") return "INCOMPLETE";', ""),
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
    console.error(`${LABEL} SELFTEST FAIL certify-module\n${run.stdout}${run.stderr}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — FW6 theater blocked + runner 7/7`);
  process.exit(0);
}

const missing = failures(src);
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
const run = spawnSync(process.execPath, [RUNNER, "--selftest"], { encoding: "utf8" });
if (run.status !== 0) {
  console.error(`${LABEL} FAIL certify-module --selftest\n${run.stdout}${run.stderr}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — FW 6 leafRe=.* cannot CERTIFY`);
