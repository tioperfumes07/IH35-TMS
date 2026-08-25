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
const HANDLER = path.join(ROOT, "apps/backend/src/outbox/handlers/driver-invite-email.handler.ts");
const REGISTRY = path.join(ROOT, "apps/backend/src/outbox/handlers/registry.ts");
const QUEUE = path.join(ROOT, "apps/backend/src/email/queue.service.ts");

function assertWired(label, src, re) {
  if (!re.test(src)) throw new Error(`${label}: missing ${re}`);
}

function checkSources({ modal, routes, handler, registry, queue }) {
  const errors = [];
  try {
    assertWired("drivers.routes send_invite default false", routes, /send_invite:\s*z\.boolean\(\)\.optional\(\)\.default\(false\)/);
    assertWired("drivers.routes gate send_invite === true", routes, /b\.send_invite\s*===\s*true/);
    assertWired("transactional email invite enqueue", routes, /enqueueOutboxEvent\(\s*client,\s*["']email\.driver_invite\.send["']/);
    if (/void\s+sendDriverInvite\([\s\S]{0,500}?\.catch\(\(\)\s*=>\s*undefined\)/.test(routes)) {
      errors.push("canonical create must not swallow a post-commit driver-invite email enqueue");
    }
    assertWired("driver invite email handler event", handler, /eventType\s*=\s*["']email\.driver_invite\.send["']/);
    assertWired("email insert shares outbox processor transaction", handler, /enqueueEmailWithClient\(ctx\.client/);
    assertWired("email queue selected-company RLS context", handler, /set_config\('app\.operating_company_id',\s*\$1::text,\s*true\)/);
    assertWired("driver invite email handler registered", registry, /new DriverInviteEmailHandler\(\)/);
    assertWired("client-scoped email queue primitive", queue, /export async function enqueueEmailWithClient/);
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
    handler: fs.readFileSync(HANDLER, "utf8"),
    registry: fs.readFileSync(REGISTRY, "utf8"),
    queue: fs.readFileSync(QUEUE, "utf8"),
  };
}

function selftest() {
  const production = readAll();
  const orig = production.modal;
  // Plant the pre-fix: create payload forces WhatsApp on Save.
  const broken = orig.replace(
    /await createMutation\.mutateAsync\(\{/,
    "await createMutation.mutateAsync({ send_invite: true,"
  );
  if (broken === orig) throw new Error("selftest: could not plant send_invite: true");
  const mutations = [
    { ...production, modal: broken },
    { ...production, routes: production.routes.replace('"email.driver_invite.send"', '"email.driver_invite.REMOVED"') },
    { ...production, handler: production.handler.replace("enqueueEmailWithClient(ctx.client", "enqueueEmailWithClient(otherClient") },
    { ...production, handler: production.handler.replace("app.operating_company_id", "app.REMOVED_company_id") },
    { ...production, registry: production.registry.replace("new DriverInviteEmailHandler()", "/* removed invite handler */") },
    { ...production, routes: `${production.routes}\nvoid sendDriverInvite({}).catch(() => undefined);` },
  ];
  const missed = mutations.filter((fixture) => checkSources(fixture).length === 0);
  if (missed.length) {
    throw new Error(`selftest: ${missed.length}/${mutations.length} planted defects did not fail the guard`);
  }
  console.log(`verify-driver-create-invite-not-on-save --selftest OK — ${mutations.length}/${mutations.length} defects rejected`);
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
