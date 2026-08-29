#!/usr/bin/env node
/**
 * verify-safety-log-event-dot-fields.mjs — S-07 guard (s-07-log-event-missing-dot-fields)
 *
 * Log Safety Event must capture FMCSA 390.15 DOT fields using prod column names on
 * safety.safety_events (location_text, injury_count, fatality_count, tow_away_required,
 * dot_reportable, police_report_number). occurred_at is owned by s-06 / PR #2630 — not checked here.
 *
 * Create-payload match: `col:` then optional `Number(` then optional prefix (`input.`) then `draft.col`.
 * Do not require a bare `draft.col` literal — SafetyEventsPage wires via `input.draft`.
 *
 * Self-test: node scripts/verify-safety-log-event-dot-fields.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-log-event-dot-fields";

const DOT_COLUMNS = [
  "location_text",
  "injury_count",
  "fatality_count",
  "tow_away_required",
  "dot_reportable",
  "police_report_number",
];

const FILES = {
  migration: "db/migrations/202607582000_safety_events_dot_fields.sql",
  page: "apps/frontend/src/pages/safety/SafetyEventsPage.tsx",
  api: "apps/frontend/src/api/safety.ts",
  routes: "apps/backend/src/safety/events/safety-events.routes.ts",
};

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Create payload may use `draft.col` or `input.draft.col` (company-lifecycle wrapper). */
export function payloadWiresDraftCol(page, col) {
  return new RegExp(`${col}:\\s*(?:Number\\()?[\\w.]*draft\\.${col}\\b`).test(page);
}

export function assertGuard(sources) {
  const errors = [];
  const migration = sources.migration;
  const page = stripComments(sources.page);
  const api = stripComments(sources.api);
  const routes = stripComments(sources.routes);

  for (const col of DOT_COLUMNS) {
    if (!migration.includes(col)) {
      errors.push(`${FILES.migration}: migration must ADD ${col}`);
    }
  }

  for (const col of DOT_COLUMNS) {
    if (!new RegExp(`${col}:\\s*string`).test(page) && !new RegExp(`${col}:\\s*number`).test(page) && !new RegExp(`${col}:\\s*boolean`).test(page)) {
      errors.push(`${FILES.page}: EventDraft must include ${col}`);
    }
    if (!new RegExp(`data-testid="safety-event-${col.replace(/_/g, "-")}"`).test(page)) {
      errors.push(`${FILES.page}: DOT field ${col} must use data-testid="safety-event-${col.replace(/_/g, "-")}"`);
    }
    if (!payloadWiresDraftCol(page, col)) {
      errors.push(`${FILES.page}: create payload must pass ${col} from draft`);
    }
  }

  if (!/Location/.test(page)) {
    errors.push(`${FILES.page}: location_text input must be labeled with Location`);
  }
  if (!/Police report/i.test(page)) {
    errors.push(`${FILES.page}: police_report_number input must mention Police report`);
  }
  if (!/DOT reportable/i.test(page)) {
    errors.push(`${FILES.page}: dot_reportable checkbox must mention DOT reportable`);
  }

  for (const col of DOT_COLUMNS) {
    if (!api.includes(col)) {
      errors.push(`${FILES.api}: createSafetyEvent / SafetyEventLogRow must include ${col}`);
    }
    if (!routes.includes(col)) {
      errors.push(`${FILES.routes}: createEventSchema / INSERT must include ${col}`);
    }
  }

  if (!/INSERT INTO safety\.safety_events/.test(routes)) {
    errors.push(`${FILES.routes}: POST must INSERT into safety.safety_events`);
  }

  return errors;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function selftest() {
  const good = {
    migration: DOT_COLUMNS.join("\n"),
    page: `
      type EventDraft = {
        location_text: string;
        injury_count: number;
        fatality_count: number;
        tow_away_required: boolean;
        dot_reportable: boolean;
        police_report_number: string;
      };
      location_text: draft.location_text,
      injury_count: Number(draft.injury_count),
      fatality_count: draft.fatality_count,
      tow_away_required: draft.tow_away_required,
      dot_reportable: draft.dot_reportable,
      police_report_number: draft.police_report_number,
      <label>Location</label>
      <input data-testid="safety-event-location-text" />
      <input data-testid="safety-event-injury-count" />
      <input data-testid="safety-event-fatality-count" />
      <input data-testid="safety-event-tow-away-required" />
      <input data-testid="safety-event-dot-reportable" />
      <input data-testid="safety-event-police-report-number" />
      Police report number
      DOT reportable
    `,
    api: DOT_COLUMNS.join(" "),
    routes: `
      ${DOT_COLUMNS.join(", ")}
      INSERT INTO safety.safety_events
    `,
  };

  if (assertGuard(good).length) {
    console.error(`[${LABEL}] --selftest FAIL: good fixture rejected`, assertGuard(good));
    process.exit(1);
  }

  const prefixed = {
    ...good,
    page: good.page
      .replace("location_text: draft.location_text,", "location_text: input.draft.location_text.trim() || undefined,")
      .replace("injury_count: Number(draft.injury_count),", "injury_count: Number(input.draft.injury_count) || 0,")
      .replace("fatality_count: draft.fatality_count,", "fatality_count: Number(input.draft.fatality_count) || 0,")
      .replace("tow_away_required: draft.tow_away_required,", "tow_away_required: input.draft.tow_away_required,")
      .replace("dot_reportable: draft.dot_reportable,", "dot_reportable: input.draft.dot_reportable,")
      .replace("police_report_number: draft.police_report_number,", "police_report_number: input.draft.police_report_number.trim() || undefined,"),
  };
  if (assertGuard(prefixed).length) {
    console.error(`[${LABEL}] --selftest FAIL: input.draft fixture rejected`, assertGuard(prefixed));
    process.exit(1);
  }

  const planted = {
    ...prefixed,
    page: prefixed.page.replace(
      /location_text: input\.draft\.location_text\.trim\(\) \|\| undefined,/,
      ""
    ),
  };
  const plantFail = assertGuard(planted);
  if (!plantFail.some((e) => e.includes("create payload must pass location_text"))) {
    console.error(`[${LABEL}] --selftest FAIL: planted payload omission not rejected`, plantFail);
    process.exit(1);
  }

  const bad = { ...good, page: good.page.replace("location_text:", "loc:") };
  const fail = assertGuard(bad);
  if (!fail.some((e) => e.includes("location_text"))) {
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
  console.log(`[${LABEL}] OK — Log Safety Event modal wires DOT fields to POST /events-log`);
}

main();
