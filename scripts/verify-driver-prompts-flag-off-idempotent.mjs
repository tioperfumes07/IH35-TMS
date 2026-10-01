#!/usr/bin/env node
/**
 * ROUND 306 E-30 addition — GUARD. Templated driver prompts:
 *   1. post nothing unless DRIVER_PROMPTS_ENABLED=true;
 *   2. are idempotent per fence event (client_key prompt:<kind>:<event>);
 *   3. trigger only from the canonical fence events, and a fuel prompt needs a real stop (E-03 dwell threshold);
 *   4. chat posts name events.event_log.source (the NOT NULL column that silently broke every chat post).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SVC = resolve(ROOT, "apps/backend/src/integrations/samsara/messaging/driver-prompts.service.ts");
const CHAT = resolve(ROOT, "apps/backend/src/chat/chat.service.ts");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(svcRaw, chatRaw) {
  const s = stripComments(svcRaw), c = stripComments(chatRaw);
  const p = [];
  if (!/process\.env\.DRIVER_PROMPTS_ENABLED === "true"/.test(s) || !/if \(!driverPromptsEnabled\(\)\) return/.test(s)) p.push("prompts can post without DRIVER_PROMPTS_ENABLED.");
  if (!/client_key: `prompt:\$\{kind\}:\$\{e\.event_id\}`/.test(s)) p.push("prompts are no longer idempotent per fence event.");
  if (!/FROM geo\.geofence_events ge/.test(s)) p.push("prompts no longer trigger from the canonical fence events.");
  if (!/Number\(e\.dwell_minutes\) < STOP_MIN_DWELL_MINUTES/.test(s)) p.push("a fuel prompt no longer requires a real stop (E-03 dwell).");
  if (!/events\.log_event\(\$1, \$2, \$3, \$4, \$5, \$6, \$7::jsonb, \$8, \$9\)/.test(c)) p.push("chat posts no longer name events.event_log.source (every post fails).");
  return p;
}

function selftest() {
  const s = readFileSync(SVC, "utf8"), c = readFileSync(CHAT, "utf8");
  const cases = [
    [s, c, false],
    [s.replace('process.env.DRIVER_PROMPTS_ENABLED === "true"', "true"), c, true],
    [s.replace("Number(e.dwell_minutes) < STOP_MIN_DWELL_MINUTES", "false"), c, true],
    [s, c.replace("$7::jsonb, $8, $9)", "$7::jsonb, $8)"), true],
  ];
  return cases.every(([a, b, f]) => (check(a, b).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-driver-prompts-flag-off-idempotent selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(SVC, "utf8"), readFileSync(CHAT, "utf8"));
  console.log(p.length ? `verify-driver-prompts-flag-off-idempotent FAILED:\n  - ${p.join("\n  - ")}` : "verify-driver-prompts-flag-off-idempotent: OK -- flag-OFF, idempotent per fence event, real stops only, chat source named.");
  process.exit(p.length ? 1 : 0);
}
