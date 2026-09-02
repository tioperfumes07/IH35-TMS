#!/usr/bin/env node
/**
 * LV-DRIVER-CREATE-IS-NOT-A-WIZARD ratchet — CreateDriverModal must be a stepped wizard:
 *  1) data-testid=driver-create-wizard + Step N of 4 chrome
 *  2) Next / Back navigation (Save only on final step)
 *  3) DQ docs & drug-screen step with ack + file staging
 *  4) post-create upload via requestUploadUrl + confirmUpload
 *  5) identity step owns every backend-required create field (first/last/10-digit phone) and
 *     neither Next nor Save can hide those errors on step 4
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
    assertWired("requestUploadUrlFromFile", src, /requestUploadUrlFromFile\s*\(/);
    assertWired("confirmUpload", src, /confirmUpload\s*\(/);
    assertWired("pending docs", src, /pendingDocs/);
    assertWired("identity step readiness", src, /const identityStepReady = Boolean\([\s\S]*?form\.first_name\.trim\(\)[\s\S]*?form\.last_name\.trim\(\)[\s\S]*?normalizePhoneDigits\(form\.phone_input\)\.length === 10[\s\S]*?\);/);
    assertWired("required first-name label", src, /\["first_name", "First Name \*"\]/);
    assertWired("required last-name label", src, /\["last_name", "Last Name \*"\]/);
    assertWired("required phone label", src, /Phone \(10 digits\) \*/);
    assertWired("Next blocks incomplete identity", src, /disabled=\{wizardStep === 1 && !identityStepReady\}/);
    assertWired("Save blocks incomplete identity", src, /disabled=\{[\s\S]*?!identityStepReady \|\|[\s\S]*?!drugScreenAcknowledged/);
  } catch (e) {
    errors.push(String(e.message || e));
  }
  return errors;
}

function selftest() {
  const orig = fs.readFileSync(MODAL, "utf8");
  const broken = orig.replace(
    /normalizePhoneDigits\(form\.phone_input\)\.length === 10/,
    "true /* SELFTEST: blank phone escapes identity gate */"
  );
  if (broken === orig) throw new Error("selftest: could not plant defect");
  const errors = check(broken);
  if (errors.length === 0) throw new Error("selftest: planted defect did not fail");
  if (check(orig).length > 0) throw new Error("selftest: original source must remain good");
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
