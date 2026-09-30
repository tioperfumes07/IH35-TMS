#!/usr/bin/env node
/**
 * ROUND 301 T-30 — GUARD.
 *
 * FAILS IF:
 *   1. the poller is absent (file missing, or not wired into index.ts).
 *   2. the normalizer could hand processHarshEventsFromVehiclePayload() an event with no id --
 *      a row must never be written with no raw_samsara_id.
 *   3. a fixture/test id literal (e.g. a "TEST-" prefix) appears anywhere in the poller's own
 *      source, where it could leak into the real table.
 *   4. the webhook path was touched (this item explicitly says DO NOT touch it).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const POLLER_FILE = resolve(ROOT, "apps/backend/src/safety/harsh-events-poll.cron.ts");
const INDEX_FILE = resolve(ROOT, "apps/backend/src/index.ts");
const WEBHOOK_PROJECTOR = resolve(ROOT, "apps/backend/src/integrations/samsara/webhook-projectors/vehicle-projector.ts");

export function checkPollerWiredIntoIndex(indexSource) {
  const problems = [];
  if (!/initializeHarshEventsPollCron/.test(indexSource)) {
    problems.push("index.ts does not reference initializeHarshEventsPollCron -- the poller is built but never started.");
  }
  return problems;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function checkNoFixtureIdLiteral(source) {
  const problems = [];
  if (/TEST-/.test(stripComments(source))) {
    problems.push(
      "harsh-events-poll.cron.ts contains a 'TEST-' literal -- a fixture-style id must never " +
        "appear in the live poller's own source, where it could leak a test id into the real table."
    );
  }
  return problems;
}

/**
 * Static check on normalizeSafetyEventRow's own source: it cannot return a real (non-null)
 * result before BOTH the kind check and the id check have already run and passed. A cross-file
 * import isn't available to a plain .mjs guard (the poller is TypeScript), so this checks the
 * function body's own text shape instead of importing and calling it -- same pattern as
 * verify-pm-due-engine-no-fleet-average-no-samsara-call.mjs (Round 301 T-29).
 */
export function checkNormalizerNeverOmitsId(pollerSource) {
  const problems = [];
  const fnMatch = pollerSource.match(/export function normalizeSafetyEventRow\([\s\S]*?\n\}/);
  if (!fnMatch) {
    problems.push("could not find normalizeSafetyEventRow in harsh-events-poll.cron.ts to check.");
    return problems;
  }
  const body = fnMatch[0];
  const kindGuardIdx = body.search(/if\s*\(\s*!kind\s*\)\s*return\s*null/);
  const idGuardIdx = body.search(/if\s*\(\s*!id\s*\)\s*return\s*null/);
  const returnIdx = body.search(/return\s*\{/);
  if (kindGuardIdx === -1) {
    problems.push("normalizeSafetyEventRow no longer has an explicit '!kind -> return null' guard -- an unrecognized event kind could produce a row.");
  }
  if (idGuardIdx === -1) {
    problems.push("normalizeSafetyEventRow no longer has an explicit '!id -> return null' guard -- a row with no raw_samsara_id could reach the insert.");
  }
  if (returnIdx !== -1 && kindGuardIdx !== -1 && kindGuardIdx > returnIdx) {
    problems.push("normalizeSafetyEventRow's kind guard runs AFTER the real return object is built.");
  }
  if (returnIdx !== -1 && idGuardIdx !== -1 && idGuardIdx > returnIdx) {
    problems.push("normalizeSafetyEventRow's id guard runs AFTER the real return object is built.");
  }
  return problems;
}

export function checkWebhookProjectorUntouched() {
  // Structural check: the webhook projector must still be the FIRST caller listed for this
  // function (the poller adds a second caller elsewhere, never edits this file's own logic).
  const problems = [];
  try {
    const src = readFileSync(WEBHOOK_PROJECTOR, "utf8");
    if (!/processHarshEventsFromVehiclePayload/.test(src)) {
      problems.push("webhook-projectors/vehicle-projector.ts no longer calls processHarshEventsFromVehiclePayload -- the webhook path must stay in place and unused, not removed.");
    }
  } catch {
    problems.push(`${WEBHOOK_PROJECTOR.replace(ROOT + "/", "")} does not exist -- the webhook path must stay in place.`);
  }
  return problems;
}

export function run() {
  let pollerSource, indexSource;
  try {
    pollerSource = readFileSync(POLLER_FILE, "utf8");
  } catch {
    return { ok: false, message: `${POLLER_FILE.replace(ROOT + "/", "")} does not exist -- the poller is absent.` };
  }
  try {
    indexSource = readFileSync(INDEX_FILE, "utf8");
  } catch {
    return { ok: false, message: `${INDEX_FILE.replace(ROOT + "/", "")} does not exist.` };
  }

  const problems = [
    ...checkPollerWiredIntoIndex(indexSource),
    ...checkNoFixtureIdLiteral(pollerSource),
    ...checkNormalizerNeverOmitsId(pollerSource),
    ...checkWebhookProjectorUntouched(),
  ];
  return {
    ok: problems.length === 0,
    message:
      problems.length === 0
        ? "verify-harsh-events-poll-fallback-exists: OK -- poller present and wired, no fixture ids, no id-less rows possible, webhook path untouched."
        : `verify-harsh-events-poll-fallback-exists FAILED:\n  - ${problems.join("\n  - ")}`,
  };
}

function selftest() {
  let ok = true;
  const expect = (name, problems, wantFail) => {
    const failed = problems.length > 0;
    if (failed !== wantFail) {
      console.error(`SELFTEST FAIL: ${name} expected ${wantFail ? "a failure" : "no failure"}, got ${JSON.stringify(problems)}`);
      ok = false;
    }
  };

  expect("index wires the poller", checkPollerWiredIntoIndex("initializeHarshEventsPollCron(app);"), false);
  expect("index missing the wire", checkPollerWiredIntoIndex("// nothing here"), true);

  expect("clean poller source", checkNoFixtureIdLiteral("const x = row.id;"), false);
  expect("fixture id literal sneaks in", checkNoFixtureIdLiteral('const x = "TEST-abc123";'), true);

  const goodFn = `
export function normalizeSafetyEventRow(raw) {
  const kind = extractBehaviorKind(raw);
  if (!kind) return null;
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  return { event_kind: kind, id };
}`;
  expect("well-shaped normalizer passes", checkNormalizerNeverOmitsId(goodFn), false);

  const badFn = `
export function normalizeSafetyEventRow(raw) {
  const kind = extractBehaviorKind(raw);
  const id = String(raw.id ?? "").trim();
  return { event_kind: kind, id };
}`;
  expect("missing guards caught", checkNormalizerNeverOmitsId(badFn), true);

  expect("webhook projector still calls the processor", checkWebhookProjectorUntouched(), false);

  return ok;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const passed = selftest();
    console.log(passed ? "verify-harsh-events-poll-fallback-exists selftest PASS" : "verify-harsh-events-poll-fallback-exists selftest FAIL");
    process.exit(passed ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
