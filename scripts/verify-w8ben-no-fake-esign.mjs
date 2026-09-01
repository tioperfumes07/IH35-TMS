#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver","connectivity"],"leaves":["drivers.modal.w8ben"],"task":"WIR-04-W8BEN-NO-FAKE-ESIGN","vertical":"wiring-honesty"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODAL = "apps/frontend/src/components/drivers/W8BenModal.tsx";
const SECTION = "apps/frontend/src/components/driver-profile/W8BenSection.tsx";
const BLOCKED_COPY = "no attorney-approved W-8BEN template (Codex)";
const POSITIVE_FAKE_ESIGN = [
  /import[\s\S]{0,120}legal-sign/i,
  /completePublicLegalSign/,
  /getPublicLegalSignDetails/,
  /signature canvas/i,
  /OTP verification/i,
  /verified_at/,
  /wire.*LegalSign/i,
  /uses LegalSign/i,
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function failures(modal = read(MODAL), section = read(SECTION)) {
  const out = [];
  for (const rel of [MODAL, SECTION]) {
    const source = rel === MODAL ? modal : section;
    if (!source.includes('data-testid="w8ben-esign-blocked"')) {
      out.push(`${rel}: missing w8ben-esign-blocked banner`);
    }
    if (!source.includes(BLOCKED_COPY)) {
      out.push(`${rel}: missing attorney-approved template blocked copy`);
    }
    if (!/field data/i.test(source)) {
      out.push(`${rel}: missing field-data-only honesty copy`);
    }
    for (const pattern of POSITIVE_FAKE_ESIGN) {
      if (pattern.test(source)) out.push(`${rel}: forbidden fake e-sign reference ${pattern}`);
    }
  }
  if (!/createDriverW8ben\(input\.driverId, input\.companyId, input\.body\)/.test(modal)) {
    out.push(`${MODAL}: missing canonical field-data save writer`);
  }
  if (!/Save field data/.test(modal)) {
    out.push(`${MODAL}: submit button must say Save field data`);
  }
  if (/Certification signature name/.test(modal)) {
    out.push(`${MODAL}: certification label still claims signature`);
  }
  return out;
}

function selftest() {
  const modalPath = path.join(ROOT, MODAL);
  const original = read(MODAL);
  try {
    fs.writeFileSync(modalPath, original.replace(BLOCKED_COPY, "template pending"));
    const red = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT });
    if (red.status === 0) throw new Error("removed blocked copy did not redden guard");
  } finally {
    fs.writeFileSync(modalPath, original);
  }
  console.log("verify-w8ben-no-fake-esign --selftest PASS — blocked-banner removal reddened guard");
}

function run() {
  const missing = failures();
  if (missing.length) {
    console.error("verify-w8ben-no-fake-esign FAIL —", missing.join("; "));
    process.exit(1);
  }
  console.log("verify-w8ben-no-fake-esign PASS — W-8BEN shows blocked e-sign honesty; field-data save only");
}

if (process.argv.includes("--selftest")) selftest();
else run();
