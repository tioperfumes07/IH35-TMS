#!/usr/bin/env node
/**
 * verify-safety-event-log-occurred-at.mjs — S-06 guard (s-06-log-event-no-time-field)
 *
 * The Log Safety Event modal must let the officer set occurred_at for after-the-fact logging
 * (49 CFR 390.15). Backend POST /api/v1/safety/events-log already accepts optional occurred_at;
 * this guard locks the frontend wiring.
 *
 * Self-test: node scripts/verify-safety-event-log-occurred-at.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-event-log-occurred-at";

const FILES = {
  page: "apps/frontend/src/pages/safety/SafetyEventsPage.tsx",
  api: "apps/frontend/src/api/safety.ts",
  routes: "apps/backend/src/safety/events/safety-events.routes.ts",
};

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function assertGuard(sources) {
  const errors = [];
  const page = stripComments(sources.page);
  const api = stripComments(sources.api);
  const routes = stripComments(sources.routes);

  if (!/occurred_at:\s*string/.test(page)) {
    errors.push(`${FILES.page}: EventDraft must include occurred_at: string`);
  }
  if (!/type="datetime-local"/.test(page)) {
    errors.push(`${FILES.page}: Log modal must expose a datetime-local input for occurred_at`);
  }
  if (!/data-testid="safety-event-occurred-at"/.test(page)) {
    errors.push(`${FILES.page}: occurred_at input must use data-testid="safety-event-occurred-at"`);
  }
  if (!/Time of occurrence/.test(page)) {
    errors.push(`${FILES.page}: occurred_at field must be labeled "Time of occurrence"`);
  }
  if (!/occurred_at:\s*draft\.occurred_at/.test(page)) {
    errors.push(`${FILES.page}: create mutation payload must pass occurred_at: draft.occurred_at`);
  }
  if (!/toISOString\(\)/.test(page)) {
    errors.push(`${FILES.page}: occurred_at must be converted to ISO (toISOString) before POST`);
  }

  if (!/occurred_at\?:\s*string/.test(api)) {
    errors.push(`${FILES.api}: createSafetyEvent body must accept optional occurred_at`);
  }

  if (!/occurred_at:\s*z\.string\(\)\.datetime\(\)\.optional\(\)/.test(routes)) {
    errors.push(`${FILES.routes}: createEventSchema must accept optional occurred_at (z.string().datetime())`);
  }
  if (!/COALESCE\(\$10::timestamptz,\s*now\(\)\)/.test(routes)) {
    errors.push(`${FILES.routes}: INSERT must COALESCE client occurred_at with now()`);
  }

  return errors;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function selftest() {
  const good = {
    page: `
      type EventDraft = { occurred_at: string; title: string; };
      function fromDatetimeLocalValue(local: string): string { return new Date(local).toISOString(); }
      occurred_at: draft.occurred_at,
      <label>Time of occurrence</label>
      <input type="datetime-local" data-testid="safety-event-occurred-at" />
    `,
    api: `occurred_at?: string`,
    routes: `
      occurred_at: z.string().datetime().optional(),
      COALESCE($10::timestamptz, now())
    `,
  };
  if (assertGuard(good).length) {
    console.error(`[${LABEL}] --selftest FAIL: good fixture rejected`, assertGuard(good));
    process.exit(1);
  }

  const bad = { ...good, page: good.page.replace('type="datetime-local"', 'type="text"') };
  const fail = assertGuard(bad);
  if (!fail.some((e) => e.includes("datetime-local"))) {
    console.error(`[${LABEL}] --selftest FAIL: bad fixture not rejected`, fail);
    process.exit(1);
  }

  console.log(`[${LABEL}] --selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertGuard(Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, read(f)])));
  if (errors.length) {
    console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Log Safety Event modal wires user-set occurred_at to POST /events-log`);
}

main();
