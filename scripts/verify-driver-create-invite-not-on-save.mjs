#!/usr/bin/env node
/**
 * LV-DRIVER-CREATE-AUTO-SENDS-WHATSAPP-INVITE ratchet —
 * Create Driver Save must NOT message WhatsApp. Invite is opt-in:
 *  1) backend create schema defaults send_invite=false; WhatsApp only when === true
 *  2) CreateDriverModal never submits send_invite: true on create
 *  3) post-create UI has invite-not-sent notice + explicit Send WhatsApp confirm
 *  4) success toast says invite was NOT sent yet
 *
 * --selftest plants send_invite: true in the modal submit payload and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODAL = path.join(ROOT, "apps/frontend/src/components/drivers/CreateDriverModal.tsx");
const ROUTES = path.join(ROOT, "apps/backend/src/mdata/drivers.routes.ts");

function assertWired(label, src, re) {
  if (!re.test(src)) throw new Error(`${label}: missing ${re}`);
}

function checkSources({ modal, routes }) {
  const errors = [];
  try {
    assertWired("drivers.routes send_invite default false", routes, /send_invite:\s*z\.boolean\(\)\.optional\(\)\.default\(false\)/);
    assertWired("drivers.routes gate send_invite === true", routes, /b\.send_invite\s*===\s*true/);
  } catch (e) {
    errors.push(String(e.message || e));
  }
  try {
    if (/send_invite\s*:\s*true/.test(modal)) {
      errors.push("CreateDriverModal must not submit send_invite: true on create");
    }
    assertWired("CreateDriverModal INVITE-NOT-ON-SAVE", modal, /INVITE-NOT-ON-SAVE/);
    assertWired("CreateDriverModal invite-not-sent-notice", modal, /data-testid=["']invite-not-sent-notice["']/);
    assertWired("CreateDriverModal send-invite-confirm", modal, /data-testid=["']send-invite-confirm["']/);
    assertWired("CreateDriverModal confirm dialog", modal, /Send a WhatsApp invite to/);
    assertWired("CreateDriverModal resendDriverInvite", modal, /resendDriverInvite\s*\(/);
    assertWired("CreateDriverModal no-invite toast", modal, /No invite sent yet/);
  } catch (e) {
    errors.push(String(e.message || e));
  }
  return errors;
}

function readAll() {
  return {
    modal: fs.readFileSync(MODAL, "utf8"),
    routes: fs.readFileSync(ROUTES, "utf8"),
  };
}

function selftest() {
  const orig = fs.readFileSync(MODAL, "utf8");
  // Plant the pre-fix: create payload forces WhatsApp on Save.
  const broken = orig.replace(
    /await createMutation\.mutateAsync\(\{/,
    "await createMutation.mutateAsync({ send_invite: true,"
  );
  if (broken === orig) throw new Error("selftest: could not plant send_invite: true");
  fs.writeFileSync(MODAL, broken);
  try {
    const errors = checkSources(readAll());
    if (errors.length === 0) throw new Error("selftest: planted defect did not fail the guard");
  } finally {
    fs.writeFileSync(MODAL, orig);
  }
  console.log("verify-driver-create-invite-not-on-save --selftest OK");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = checkSources(readAll());
  if (errors.length) {
    console.error("verify-driver-create-invite-not-on-save FAIL:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("verify-driver-create-invite-not-on-save OK");
}

main();
