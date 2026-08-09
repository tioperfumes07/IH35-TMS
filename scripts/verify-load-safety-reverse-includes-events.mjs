#!/usr/bin/env node
/**
 * FAIL-S1 REVERSE ratchet — the load drawer's "Safety records on this load" must list safety events.
 *
 * #5019 gave the Log Safety Event form a Related load picker, so new events carry
 * `related_load_id` (proven live: event 262f6d5e → load L-20260808-0085). But the reverse section
 * listed Accidents, Damage Reports, Trailer Interchanges and Cargo Claims and NOT safety events —
 * so the link existed in the database and appeared on no screen. §10a: a link is done only when it
 * drills BOTH ways.
 *
 * The reverse block is only real if the server can be asked the question, so this also pins the
 * `related_load_id` filter on the events-log route and its client. Dropping any one of the three
 * silently returns the whole company's events, or none — both look like "no bug" on screen.
 *
 * Static only — no DB, no network, no build. Runs in well under a second.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const SECTION = "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx";
const CLIENT = "apps/frontend/src/api/safety.ts";
const ROUTE = "apps/backend/src/safety/events/safety-events.routes.ts";

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

const read = (rel) => stripComments(readFileSync(join(repoRoot, rel), "utf8"));

const failures = [];

const section = read(SECTION);
if (!/listSafetyEventLog\s*\(/.test(section)) {
  failures.push(`${SECTION}: does not call listSafetyEventLog — the load drawer cannot show safety events at all.`);
}
if (!/related_load_id:\s*loadId/.test(section)) {
  failures.push(`${SECTION}: calls the events log without \`related_load_id: loadId\` — that lists every event in the company, not this load's.`);
}
if (!/load-safety-reverse-safety-events/.test(section)) {
  failures.push(`${SECTION}: the safety-events block lost its data-testid — the reverse block is no longer addressable in tests.`);
}

const client = read(CLIENT);
if (!/related_load_id\?:\s*string/.test(client) || !/qs\.set\(\s*["']related_load_id["']/.test(client)) {
  failures.push(`${CLIENT}: listSafetyEventLog must accept \`related_load_id\` AND put it on the query string.`);
}

const route = read(ROUTE);
if (!/related_load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(route)) {
  failures.push(`${ROUTE}: listQuerySchema must accept an optional \`related_load_id\` uuid.`);
}
if (!/e\.related_load_id\s*=\s*\$\$\{values\.length\}::uuid|e\.related_load_id = \$\$/.test(route) && !/related_load_id = \$\$\{values\.length\}/.test(route)) {
  if (!/filters\.push\([^)]*related_load_id/.test(route)) {
    failures.push(`${ROUTE}: the \`related_load_id\` query param is accepted but never filtered on — the endpoint would ignore it and return everything.`);
  }
}

if (failures.length > 0) {
  console.error("FAIL verify-load-safety-reverse-includes-events");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("PASS verify-load-safety-reverse-includes-events — load drawer lists this load's safety events, filtered server-side");
