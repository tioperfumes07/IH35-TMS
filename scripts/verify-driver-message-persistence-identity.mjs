#!/usr/bin/env node
import fs from "node:fs";

const files = {
  service: "apps/backend/src/drivers/messages.service.ts",
  pwa: "apps/backend/src/drivers/messages.routes.ts",
  office: "apps/backend/src/mdata/driver-messages.routes.ts",
  test: "apps/backend/src/drivers/__tests__/messages.persistence.test.ts",
};
const sources = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function verify(s) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(s.service.includes("class DriverMessagePersistenceError"), "typed persistence error missing");
  need(s.service.includes("requireDriverMessageRow(res.rows as Array<{ id: string }>, \"create\")"), "PWA reply identity check missing");
  need(s.service.includes("RETURNING id::text") && s.service.includes("requireDriverMessageRow(res.rows, \"delivery_status\")"), "terminal delivery status identity check missing");
  need((s.service.match(/updateDriverMessageDeliveryStatus\(client/g) || []).length === 4, "all four terminal status branches must use the checked writer");
  need(s.office.includes("const inserted = requireDriverMessageRow("), "office creator identity check missing");
  need(s.office.includes("resource_id: inserted.id"), "office audit must use the checked identity");
  need(s.office.includes("err instanceof DriverMessagePersistenceError") && s.office.includes("reply.code(409)"), "office typed conflict mapping missing");
  need(s.pwa.includes("err instanceof DriverMessagePersistenceError") && s.pwa.includes("reply.code(409)"), "PWA typed conflict mapping missing");
  need(s.office.includes('rateLimit: { max: 30, timeWindow: "1 minute" }'), "office creator rate limit missing");
  need(s.pwa.includes('rateLimit: { max: 30, timeWindow: "1 minute" }'), "PWA creator rate limit missing");
  need(s.test.includes("changes no row") && s.test.includes("loses its identity"), "behavioral persistence tests missing");
  return failures;
}

const failures = verify(sources);
if (failures.length) {
  console.error(`[verify-driver-message-persistence-identity] FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["service", "class DriverMessagePersistenceError", "class RemovedPersistenceError"],
    ["service", 'requireDriverMessageRow(res.rows as Array<{ id: string }>, "create")', "res.rows[0]"],
    ["service", 'requireDriverMessageRow(res.rows, "delivery_status")', "res.rows[0]"],
    ["service", "updateDriverMessageDeliveryStatus(client", "client.query("],
    ["office", "const inserted = requireDriverMessageRow(", "const inserted = res.rows[0] && ("],
    ["office", "resource_id: inserted.id", "resource_id: null"],
    ["office", "err instanceof DriverMessagePersistenceError", "false"],
    ["pwa", "err instanceof DriverMessagePersistenceError", "false"],
    ["office", 'rateLimit: { max: 30, timeWindow: "1 minute" }', "rateLimit: undefined"],
    ["pwa", 'rateLimit: { max: 30, timeWindow: "1 minute" }', "rateLimit: undefined"],
    ["test", "changes no row", "unchecked status"],
  ];
  for (const [key, needle, replacement] of mutations) {
    const mutated = { ...sources, [key]: sources[key].replace(needle, replacement) };
    if (verify(mutated).length === 0) {
      console.error(`[verify-driver-message-persistence-identity] SELFTEST FAIL: ${key}:${needle}`);
      process.exit(1);
    }
  }
  console.log(`[verify-driver-message-persistence-identity] SELFTEST PASS (${mutations.length}/${mutations.length})`);
}

console.log("[verify-driver-message-persistence-identity] PASS (office + PWA create/status identity)");
