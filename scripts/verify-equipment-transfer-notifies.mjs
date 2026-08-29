#!/usr/bin/env node
/**
 * biz-flow-8-no-transfer-notifications / flow8-equipment-transfer-notifications
 *
 * Asserts the canonical GAP-37 equipment-transfer engine enqueues notifications:
 * - request.service.ts and dual-confirm.service.ts both call enqueueEquipmentTransferNotify
 * - notify.ts inserts into outbox.events (and optionally pwa.driver_notifications)
 * - trail handlers are registered for the three transfer event types
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-equipment-transfer-notifies";

const PATHS = {
  request: path.join(ROOT, "apps/backend/src/dispatch/equipment-transfer/request.service.ts"),
  dual: path.join(ROOT, "apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts"),
  notify: path.join(ROOT, "apps/backend/src/dispatch/equipment-transfer/notify.ts"),
  trail: path.join(ROOT, "apps/backend/src/outbox/handlers/trail-events.handler.ts"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function notificationIdentityFailures(notify) {
  const failures = [];
  if (!/INSERT\s+INTO\s+outbox\.events[\s\S]{0,180}RETURNING id::text/i.test(notify)) {
    failures.push("notify.ts must return the durable outbox identity");
  }
  if (!/if \(!outboxEvent\.rows\[0\]\?\.id\) throw new Error\("equipment_transfer_outbox_enqueue_failed"\)/.test(notify)) {
    failures.push("notify.ts must reject a zero-row outbox INSERT");
  }
  return failures;
}

function main() {
  const request = read(PATHS.request);
  const dual = read(PATHS.dual);
  const notify = read(PATHS.notify);
  const trail = read(PATHS.trail);
  const failures = [];

  if (!request.includes("enqueueEquipmentTransferNotify")) {
    failures.push("request.service.ts must call enqueueEquipmentTransferNotify");
  }
  if (!request.includes("dispatch.equipment_transfer.requested")) {
    failures.push("request.service.ts must enqueue dispatch.equipment_transfer.requested (to_driver)");
  }
  if (!request.includes("dispatch.equipment_transfer.rejected")) {
    failures.push("request.service.ts must enqueue dispatch.equipment_transfer.rejected on cancel/reject");
  }

  if (!dual.includes("enqueueEquipmentTransferNotify")) {
    failures.push("dual-confirm.service.ts must call enqueueEquipmentTransferNotify");
  }
  if (!dual.includes("dispatch.equipment_transfer.confirmed")) {
    failures.push("dual-confirm.service.ts must enqueue dispatch.equipment_transfer.confirmed");
  }

  if (!/INSERT\s+INTO\s+outbox\.events/i.test(notify)) {
    failures.push("notify.ts must INSERT INTO outbox.events");
  }
  failures.push(...notificationIdentityFailures(notify));
  if (!notify.includes("pwa.driver_notifications")) {
    failures.push("notify.ts must also write pwa.driver_notifications when available");
  }
  for (const eventType of [
    "dispatch.equipment_transfer.requested",
    "dispatch.equipment_transfer.confirmed",
    "dispatch.equipment_transfer.rejected",
  ]) {
    if (!notify.includes(eventType)) {
      failures.push(`notify.ts must declare event type ${eventType}`);
    }
    if (!trail.includes(`TrailEventHandler("${eventType}")`)) {
      failures.push(`trail-events.handler.ts must register TrailEventHandler for ${eventType}`);
    }
  }

  if (!notify.includes("outbox-handler-parity:")) {
    failures.push("notify.ts must annotate outbox-handler-parity for dynamic event_type");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  if (process.argv.includes("--selftest")) {
    const mutations = [
      notify.replace("RETURNING id::text", ""),
      notify.replace('if (!outboxEvent.rows[0]?.id) throw new Error("equipment_transfer_outbox_enqueue_failed");', ""),
    ];
    for (const [index, mutation] of mutations.entries()) {
      if (notificationIdentityFailures(mutation).length === 0) fail(`selftest mutation ${index + 1} escaped`);
    }
    console.log(`${LABEL} SELFTEST PASS — ${mutations.length} zero-row durability mutations caught`);
  }

  console.log(`${LABEL} PASS`);
}

main();
