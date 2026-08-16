#!/usr/bin/env node
/**
 * LV-DRIVER-CREATE-IS-NOT-A-WIZARD ratchet — CreateDriverModal must be a stepped wizard:
 *  1) data-testid=driver-create-wizard + Step N of 4 chrome
 *  2) Next / Back navigation (Save only on final step)
 *  3) DQ docs & drug-screen step with ack + file staging
 *  4) post-create upload via requestUploadUrl + confirmUpload
 *
 * --selftest strips the wizard testid and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODAL = path.join(ROOT, "apps/frontend/src/components/drivers/CreateDriverModal.tsx");

function assertWired(label, src, re) {
  if (!re.test(src)) throw new Error(`${label}: missing ${re}`);
}

function check(src) {
  const errors = [];
  try {
    assertWired("wizard root", src, /data-testid=["']driver-create-wizard["']/);
    assertWired("step chrome", src, /Step \{wizardStep\} of/);
    assertWired("DRIVER_CREATE_WIZARD_STEPS", src, /DRIVER_CREATE_WIZARD_STEPS/);
    assertWired("Next", src, /data-testid=["']driver-create-wizard-next["']/);
    assertWired("Back", src, /data-testid=["']driver-create-wizard-back["']/);
    assertWired("DQ step", src, /data-testid=["']driver-create-dq-step["']/);
    assertWired("drug ack", src, /data-testid=["']driver-create-drug-screen-ack["']/);
    assertWired("Save gated on drug ack", src, /!drugScreenAcknowledged/);
    assertWired("requestUploadUrl", src, /requestUploadUrl\s*\(/);
    assertWired("confirmUpload", src, /confirmUpload\s*\(/);
    assertWired("pending docs", src, /pendingDocs/);
  } catch (e) {
    errors.push(String(e.message || e));
  }
  return errors;
}

function selftest() {
  const orig = fs.readFileSync(MODAL, "utf8");
  const broken = orig.replace(/data-testid=["']driver-create-wizard["']/, 'data-testid="driver-create-flat"');
  if (broken === orig) throw new Error("selftest: could not plant defect");
  fs.writeFileSync(MODAL, broken);
  try {
    const errors = check(fs.readFileSync(MODAL, "utf8"));
    if (errors.length === 0) throw new Error("selftest: planted defect did not fail");
  } finally {
    fs.writeFileSync(MODAL, orig);
  }
  console.log("verify-driver-create-is-wizard --selftest OK");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = check(fs.readFileSync(MODAL, "utf8"));
  if (errors.length) {
    console.error("verify-driver-create-is-wizard FAIL:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("verify-driver-create-is-wizard OK");
}

main();
