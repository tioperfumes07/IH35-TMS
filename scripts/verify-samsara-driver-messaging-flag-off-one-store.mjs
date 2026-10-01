#!/usr/bin/env node
/**
 * ROUND 306 E-30 — GUARD.
 * FAILS IF driver-message-delivery.service.ts:
 *   1. can send to Samsara without SAMSARA_DRIVER_MESSAGING_ENABLED=true;
 *   2. writes its own message table instead of riding chat.messages (one message store);
 *   3. sends to a driver with zero or several Samsara ids (guessed recipient);
 *   4. re-sends a message already delivered.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/integrations/samsara/messaging/driver-message-delivery.service.ts");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(raw) {
  const src = stripComments(raw);
  const p = [];
  if (!/process\.env\.SAMSARA_DRIVER_MESSAGING_ENABLED === "true"/.test(src) || !/if \(!samsaraDriverMessagingEnabled\(\) \|\| !sender\) return/.test(src)) p.push("Samsara driver messages can be sent without the flag.");
  if (/INSERT INTO (chat|mdata|messaging)\./.test(src)) p.push("delivery writes a message table of its own -- chat.messages is the one store.");
  if (!/if \(sids\.length === 1\) return \{ driver_id: d\.driver_id, samsara_driver_id: sids\[0\]!/.test(src)) p.push("a driver with zero or several Samsara ids can be messaged.");
  if (!/if \(prior\.rows\.length\) return \{ \.\.\.base, outcome: "already_delivered" \}/.test(src)) p.push("a delivered message can be re-sent.");
  return p;
}

function selftest() {
  const g = readFileSync(FILE, "utf8");
  const cases = [
    [g, false],
    [g.replace('process.env.SAMSARA_DRIVER_MESSAGING_ENABLED === "true"', 'process.env.SAMSARA_DRIVER_MESSAGING_ENABLED !== "false"'), true],
    [g + "\nconst x = `INSERT INTO chat.messages`;", true],
    [g.replace("if (sids.length === 1) return", "if (sids.length >= 1) return"), true],
    [g.replace('if (prior.rows.length) return { ...base, outcome: "already_delivered" }', ""), true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-samsara-driver-messaging-flag-off-one-store selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(FILE, "utf8"));
  console.log(p.length ? `verify-samsara-driver-messaging-flag-off-one-store FAILED:\n  - ${p.join("\n  - ")}` : "verify-samsara-driver-messaging-flag-off-one-store: OK -- flag-OFF, chat.messages is the one store, exactly-one-link recipients, no re-send.");
  process.exit(p.length ? 1 : 0);
}
