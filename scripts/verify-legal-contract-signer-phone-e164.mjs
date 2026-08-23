#!/usr/bin/env node
/**
 * verify-legal-contract-signer-phone-e164.mjs  (LEGAL-F5988)
 *
 * Root cause: apps/backend/src/legal/contracts.service.ts requires signer_phone to match
 * `/^\+\d{10,15}$/` (strict E.164), but mdata.drivers/customers/vendors phone columns are NOT
 * uniformly stored that way — the driver CSV bulk-import path (drivers-import.routes.ts
 * normalizePhone()) writes bare digits, bypassing the CRUD route's E.164 enforcement. Live-
 * reproduced 2026-08-22: picking driver "Isaac Carballo Roque" (phone "8307036834" on prod)
 * in the Unified Contract Creator auto-fills Signer phone with that raw value, and "Create &
 * send" then 400s at POST /api/v1/legal/contracts with a raw regex-pattern toast that names no
 * field — the operator never typed the value and has nothing actionable to fix.
 *
 * This guard makes the regression impossible to re-ship:
 *   1. UnifiedContractCreatorModal.tsx must import normalizePickedEntityPhoneToE164 and route
 *      every picked-entity phone (driver/customer/vendor) through it before setSignerPhone —
 *      never a raw `.phone` / `.office_phone` read.
 *   2. normalizePickedEntityPhoneToE164 itself must normalize the exact reproduced shape
 *      (bare 10-digit -> +1-prefixed E.164) and never hand back a value that fails the
 *      backend's own E.164 regex.
 *
 * Usage:
 *   node scripts/verify-legal-contract-signer-phone-e164.mjs            # scan
 *   node scripts/verify-legal-contract-signer-phone-e164.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const MODAL_FILE = "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx";
const HELPER_FILE = "apps/frontend/src/lib/phone-format.ts";

// The backend's own contract for POST /api/v1/legal/contracts signer_phone.
const BACKEND_E164_RE = /^\+\d{10,15}$/;

// A raw picked-entity phone landing straight in setSignerPhone(...) without the normalizer —
// the exact shape of the regression (`d.phone`, `vendor.phone`, `customer.phone ?? customer.office_phone`, etc).
const RAW_PHONE_ASSIGNMENT_RE =
  /setSignerPhone\(\s*(?!normalizePickedEntityPhoneToE164\()[a-zA-Z_$][\w$]*\.(phone|office_phone)\b/;

export function checkModalUsesNormalizer(src) {
  const offenders = [];
  if (!/import\s*\{[^}]*normalizePickedEntityPhoneToE164[^}]*\}\s*from\s*["'].*phone-format["']/.test(src)) {
    offenders.push(`${MODAL_FILE}: must import normalizePickedEntityPhoneToE164 from lib/phone-format`);
  }
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (RAW_PHONE_ASSIGNMENT_RE.test(line)) {
      offenders.push(
        `${MODAL_FILE}:${i + 1}: raw picked-entity phone into setSignerPhone — must wrap in normalizePickedEntityPhoneToE164(): ${line.trim()}`
      );
    }
  });
  return offenders;
}

// Load-and-check the real helper's behavior via dynamic import so this guard fails the moment the
// implementation regresses, not just when the modal stops calling it.
export async function checkHelperNormalizes(helperAbsPath) {
  const offenders = [];
  const mod = await import(`${helperAbsPath}?t=${Date.now()}`);
  const fn = mod.normalizePickedEntityPhoneToE164;
  if (typeof fn !== "function") {
    offenders.push(`${HELPER_FILE}: must export normalizePickedEntityPhoneToE164`);
    return offenders;
  }
  const cases = [
    ["8307036834", "+18307036834"], // the exact reproduced prod value
    ["+19565550822", "+19565550822"], // already valid — passthrough
    ["", ""],
    [null, ""],
  ];
  for (const [input, expected] of cases) {
    const got = fn(input);
    if (got !== expected) offenders.push(`${HELPER_FILE}: normalizePickedEntityPhoneToE164(${JSON.stringify(input)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
    if (got !== "" && !BACKEND_E164_RE.test(got)) {
      offenders.push(`${HELPER_FILE}: normalizePickedEntityPhoneToE164(${JSON.stringify(input)}) returned ${JSON.stringify(got)}, which fails the backend's own E.164 regex`);
    }
  }
  return offenders;
}

export async function run() {
  const offenders = [];
  const modalAbs = path.join(repoRoot, MODAL_FILE);
  offenders.push(...checkModalUsesNormalizer(fs.readFileSync(modalAbs, "utf8")));
  offenders.push(...(await checkHelperNormalizes(path.join(repoRoot, HELPER_FILE))));
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const badLine = 'setSignerPhone(d.phone ?? "");';
  const goodLine = "setSignerPhone(normalizePickedEntityPhoneToE164(d.phone));";
  const badSrc = `import { getDriver } from "../../../api/mdata";\n${badLine}\n`;
  const goodSrc = `import { normalizePickedEntityPhoneToE164 } from "../../../lib/phone-format";\n${goodLine}\n`;

  const badFails = checkModalUsesNormalizer(badSrc).length > 0;
  const goodPasses = checkModalUsesNormalizer(goodSrc).length === 0;

  if (badFails && goodPasses) {
    console.log("verify:legal-contract-signer-phone-e164 selftest OK");
    process.exit(0);
  }
  console.error("verify:legal-contract-signer-phone-e164 selftest FAILED", { badFails, goodPasses });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = await run();
  if (!ok) {
    console.error("verify:legal-contract-signer-phone-e164 FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:legal-contract-signer-phone-e164 OK — picked-entity signer phone always normalized to E.164 before submit");
}
