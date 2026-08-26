#!/usr/bin/env node
/** SAFETY-F6485 — Certificate Expiry filters use shared Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/pages/safety/expiry-tracking/ExpiryDashboard.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");

function assertContract(source) {
  if (/<select\b/.test(source)) throw new Error("native select returned to ExpiryDashboard");
  for (const id of ["cert-expiry-cert-type", "cert-expiry-severity"]) {
    if (!source.includes(`htmlFor="${id}"`) || !source.includes(`id="${id}"`) || !source.includes(`dataTestId="${id}"`)) {
      throw new Error(`missing associated/testable expiry filter ${id}`);
    }
  }
  for (const token of [
    'setCertType(next as "all" | CertType)',
    'setSeverity(next as "all" | CertSeverity)',
    'row.cert_type === certType',
    'row.severity === severity',
    'options={CERT_OPTIONS}',
    'options={SEVERITY_OPTIONS}',
  ]) if (!source.includes(token)) throw new Error(`missing Certificate Expiry filter contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const planted = diskSource.replace("row.severity === severity", "row.severity === certType");
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, SAFETY_F6485_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted severity predicate miswire stayed green");
  console.log("verify-safety-cert-expiry-filter-comboboxes --selftest PASS");
  process.exit(0);
}

assertContract(process.env.SAFETY_F6485_PLANTED_SOURCE ?? diskSource);
console.log("verify-safety-cert-expiry-filter-comboboxes PASS — type/severity predicates and shared chrome preserved");
