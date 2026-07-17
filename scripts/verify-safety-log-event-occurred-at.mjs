#!/usr/bin/env node
/**
 * S-06 guard — Log Safety Event modal must let operators set occurred_at (49 CFR 390.15).
 *
 * Self-test: node scripts/verify-safety-log-event-occurred-at.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-log-event-occurred-at";
const PAGE = "apps/frontend/src/pages/safety/SafetyEventsPage.tsx";
const API = "apps/frontend/src/api/safety.ts";
const BACKEND = "apps/backend/src/safety/events/safety-events.routes.ts";

export function assertGuard(sources) {
  const errors = [];
  const page = sources.page;
  const api = sources.api;
  const backend = sources.backend;

  if (!/occurred_at:\s*string/.test(page)) {
    errors.push(`${PAGE}: EventDraft must include occurred_at`);
  }
  if (!/type="datetime-local"/.test(page)) {
    errors.push(`${PAGE}: Log modal must expose datetime-local for time of occurrence`);
  }
  if (!/data-testid="safety-event-occurred-at"/.test(page)) {
    errors.push(`${PAGE}: occurred_at input must use data-testid safety-event-occurred-at`);
  }
  if (!/occurred_at:/.test(page) || !/createSafetyEvent\(payload\)/.test(page)) {
    errors.push(`${PAGE}: create payload must pass occurred_at to createSafetyEvent`);
  }
  if (!/toISOString\(\)/.test(page)) {
    errors.push(`${PAGE}: occurred_at must be sent as ISO datetime (toISOString)`);
  }
  if (!/Time of occurrence/.test(page)) {
    errors.push(`${PAGE}: label must read "Time of occurrence"`);
  }

  if (!/occurred_at\?:\s*string/.test(api)) {
    errors.push(`${API}: createSafetyEvent body must accept optional occurred_at`);
  }

  if (!/occurred_at:\s*z\.string\(\)\.datetime\(\)\.optional\(\)/.test(backend)) {
    errors.push(`${BACKEND}: create schema must accept optional occurred_at datetime`);
  }

  return errors;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function selftest() {
  const good = {
    page: `
      type EventDraft = { occurred_at: string; title: string; };
      occurred_at: draft.occurred_at.trim() ? new Date(draft.occurred_at).toISOString() : undefined,
      createSafetyEvent(payload);
      type="datetime-local" data-testid="safety-event-occurred-at"
      Time of occurrence
    `,
    api: `occurred_at?: string`,
    backend: `occurred_at: z.string().datetime().optional(),`,
  };
  const bad = { ...good, page: good.page.replace("datetime-local", "text") };
  const goodErrors = assertGuard(good);
  const badErrors = assertGuard(bad);
  if (goodErrors.length !== 0) {
    console.error(`${LABEL} selftest: expected good sources to pass`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length === 0) {
    console.error(`${LABEL} selftest: expected bad sources to fail`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = assertGuard({
    page: read(PAGE),
    api: read(API),
    backend: read(BACKEND),
  });
  if (errors.length > 0) {
    console.error(`[${LABEL}] FAIL`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — Log Safety Event modal wires occurred_at to createSafetyEvent`);
}

main();
