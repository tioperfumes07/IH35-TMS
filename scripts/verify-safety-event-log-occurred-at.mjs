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
  dateTimePicker: "apps/frontend/src/components/forms/DateTimePicker.tsx",
};

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function assertGuard(sources) {
  const errors = [];
  const page = stripComments(sources.page);
  const api = stripComments(sources.api);
  const routes = stripComments(sources.routes);
  const dateTimePicker = stripComments(sources.dateTimePicker);

  if (!/occurred_at:\s*string/.test(page)) {
    errors.push(`${FILES.page}: EventDraft must include occurred_at: string`);
  }
  // C3 (2026-07-25): this assertion used to require a native `type="datetime-local"` input. That was
  // a PROXY for the real requirement — "the officer can set a date AND time for occurred_at". C3
  // replaced every native datetime-local with the shared <DateTimePicker>, so pinning the native
  // control would now pin a defect. The assertion is RETARGETED at the canonical component, not
  // relaxed: it still requires a date+time field, and the two clauses below make it strictly
  // TIGHTER than before by also requiring the real import and forbidding a regression back to the
  // native control.
  if (!/<DateTimePicker\b/.test(page)) {
    errors.push(`${FILES.page}: Log modal must expose a date+time field for occurred_at (shared <DateTimePicker>)`);
  }
  if (!/from\s+"[^"]*forms\/DateTimePicker"/.test(page)) {
    errors.push(`${FILES.page}: <DateTimePicker> must be imported from components/forms/DateTimePicker`);
  }
  // Reverse ratchet — the native control must never come back (verify-step 1553 enforces this
  // app-wide; asserted here too so this modal cannot regress in isolation).
  if (/type="datetime-local"/.test(page)) {
    errors.push(`${FILES.page}: native type="datetime-local" is banned — use the shared <DateTimePicker> (C3)`);
  }
  if (!/data-testid="safety-event-occurred-at"/.test(page)) {
    errors.push(`${FILES.page}: occurred_at input must use data-testid="safety-event-occurred-at"`);
  }
  if (!/Time of occurrence/.test(page)) {
    errors.push(`${FILES.page}: occurred_at field must be labeled "Time of occurrence"`);
  }
  if (!/occurred_at:\s*(?:input\.)?draft\.occurred_at/.test(page)) {
    errors.push(`${FILES.page}: create mutation payload must pass the active draft occurred_at`);
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

  if (!/function\s+onDoc\(e:\s*PointerEvent\)/.test(dateTimePicker)) {
    errors.push(`${FILES.dateTimePicker}: outside-dismiss handler must accept PointerEvent`);
  }
  if (!/document\.addEventListener\("pointerdown",\s*onDoc\)/.test(dateTimePicker)) {
    errors.push(`${FILES.dateTimePicker}: open picker must close on pointerdown outside (mouse/touch/pen)`);
  }
  if (!/document\.removeEventListener\("pointerdown",\s*onDoc\)/.test(dateTimePicker)) {
    errors.push(`${FILES.dateTimePicker}: pointerdown outside listener must be removed on cleanup`);
  }
  if (/document\.(?:add|remove)EventListener\("mousedown",\s*onDoc\)/.test(dateTimePicker)) {
    errors.push(`${FILES.dateTimePicker}: mouse-only outside-dismiss regression is forbidden`);
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
      import { DateTimePicker } from "../../components/forms/DateTimePicker";
      <label>Time of occurrence</label>
      <DateTimePicker data-testid="safety-event-occurred-at" />
    `,
    api: `occurred_at?: string`,
    routes: `
      occurred_at: z.string().datetime().optional(),
      COALESCE($10::timestamptz, now())
    `,
    dateTimePicker: `
      function onDoc(e: PointerEvent) { if (ref.current) setOpen(false); }
      document.addEventListener("pointerdown", onDoc);
      document.removeEventListener("pointerdown", onDoc);
    `,
  };
  if (assertGuard(good).length) {
    console.error(`[${LABEL}] --selftest FAIL: good fixture rejected`, assertGuard(good));
    process.exit(1);
  }

  // Bad fixture 1: the date+time field is gone entirely.
  const bad = { ...good, page: good.page.replace("<DateTimePicker", "<input type=\"text\"") };
  const fail = assertGuard(bad);
  if (!fail.some((e) => e.includes("date+time field"))) {
    console.error(`[${LABEL}] --selftest FAIL: missing DateTimePicker not rejected`, fail);
    process.exit(1);
  }

  // Bad fixture 2: regressed back to the native control (reverse ratchet must fire).
  const regressed = { ...good, page: `${good.page}\n<input type="datetime-local" />` };
  const regressedErrors = assertGuard(regressed);
  if (!regressedErrors.some((e) => e.includes('native type="datetime-local" is banned'))) {
    console.error(`[${LABEL}] --selftest FAIL: native-control regression not rejected`, regressedErrors);
    process.exit(1);
  }

  // Bad fixture 3: component used but not imported.
  const unimported = { ...good, page: good.page.replace('import { DateTimePicker } from "../../components/forms/DateTimePicker";', "") };
  if (!assertGuard(unimported).some((e) => e.includes("must be imported"))) {
    console.error(`[${LABEL}] --selftest FAIL: missing import not rejected`);
    process.exit(1);
  }

  // Bad fixture 4: a mouse-only listener misses touch and pen interactions.
  const mouseOnly = {
    ...good,
    dateTimePicker: good.dateTimePicker
      .replace("PointerEvent", "MouseEvent")
      .replaceAll("pointerdown", "mousedown"),
  };
  const mouseOnlyErrors = assertGuard(mouseOnly);
  if (!mouseOnlyErrors.some((e) => e.includes("PointerEvent")) ||
      !mouseOnlyErrors.some((e) => e.includes("mouse-only"))) {
    console.error(`[${LABEL}] --selftest FAIL: mouse-only outside-dismiss regression not rejected`, mouseOnlyErrors);
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
