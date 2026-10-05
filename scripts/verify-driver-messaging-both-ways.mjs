#!/usr/bin/env node
/**
 * ROUND 313 E-30: driver messaging both ways on the ONE chat store. Outbound = delivery service; inbound = Samsara
 * replies posted as the driver into the load thread (else the driver_direct thread), idempotent per message.
 */
import { readFileSync } from "node:fs";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--selftest")) selftest();

const inb = readFileSync("apps/backend/src/integrations/samsara/messaging/driver-message-inbound.service.ts", "utf8");
const out = readFileSync("apps/backend/src/integrations/samsara/messaging/driver-message-delivery.service.ts", "utf8");
const idx = readFileSync("apps/backend/src/index.ts", "utf8");
const checks = [
  [/postMessage\(/.test(inb) && !/INSERT INTO chat\.messages/.test(inb), "inbound posts through chat postMessage (no second store)"],
  [/client_key: `samsara-msg:\$\{m\.samsaraDriverId\}:\$\{m\.sentAtMs\}`/.test(inb), "inbound is idempotent per Samsara message"],
  [/loadAtTimeSql\(/.test(inb) && /getOrCreateDriverDirectThread/.test(inb), "thread = load at reply time, else driver_direct"],
  [/loadDriverIdBySamsaraId/.test(inb), "driver resolved through the canonical Samsara map"],
  [/sendDriverMessage/.test(out), "outbound delivery still present"],
  [/initializeSamsaraDriverRepliesCron\(app\)/.test(idx), "reply poller registered"],
];
const fails = checks.filter(([ok]) => !ok).map(([, w]) => w);
if (fails.length) { console.error("verify-driver-messaging-both-ways: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-driver-messaging-both-ways: OK (${checks.length})`);

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one
// that MUST fail (a throwaway tree missing this guard's inputs — proves it fails closed,
// never a vacuous green).
function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {});
  reportSelftest("verify-driver-messaging-both-ways", [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
