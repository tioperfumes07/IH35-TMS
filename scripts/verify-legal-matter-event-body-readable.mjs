#!/usr/bin/env node
/**
 * verify-legal-matter-event-body-readable.mjs (LEGAL-F6335, verify-step 6420)
 *
 * Root cause: `formatLegalMatterEventBody` in LegalMatterDetailPage.tsx documented its own
 * contract as "other system events keep a readable summary (never raw JSON UI)" but the
 * implementation only special-cased the `note` field and fell through to bare
 * `JSON.stringify(body)` for every real backend system event (matter_created, matter_updated,
 * matter_closed, document_uploaded, deadline_added, deadline_completed — confirmed via
 * apps/backend/src/legal/matters.service.ts appendMatterEvent callers). Live-confirmed on
 * matter CASCADE-LM-88970's timeline tab: the "matter_created" event rendered literal
 * `{"matter_number":"CASCADE-LM-88970"}` on the page.
 *
 * Fix: added a per-event-type summarizer map covering all 6 known backend system event types,
 * and replaced the JSON.stringify fallback with a plain-English "Recorded <event_type>." label
 * so an unrecognized future event_type still never renders raw JSON.
 *
 * Usage:
 *   node scripts/verify-legal-matter-event-body-readable.mjs            # scan
 *   node scripts/verify-legal-matter-event-body-readable.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const TARGET = "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx";

const KNOWN_EVENT_TYPES = [
  "matter_created",
  "matter_updated",
  "matter_closed",
  "document_uploaded",
  "deadline_added",
  "deadline_completed",
];

export function checkLegalMatterEventBodyReadable(src) {
  const offenders = [];
  const fnMatch = /export function formatLegalMatterEventBody[\s\S]*?\n}\n/.exec(src);
  if (!fnMatch) {
    offenders.push("formatLegalMatterEventBody not found in " + TARGET);
    return offenders;
  }
  const fn = fnMatch[0];
  if (/JSON\.stringify\(body\)/.test(fn)) {
    offenders.push("formatLegalMatterEventBody still falls through to JSON.stringify(body) — raw JSON can render in the UI.");
  }
  // The summarizer map (declared just above the function) must cover all known backend event types.
  const mapMatch = /LEGAL_MATTER_EVENT_SUMMARIZERS[\s\S]*?=\s*\{([\s\S]*?)\n\};/.exec(src);
  const mapBody = mapMatch ? mapMatch[1] : "";
  for (const type of KNOWN_EVENT_TYPES) {
    if (!mapBody.includes(type)) {
      offenders.push(`LEGAL_MATTER_EVENT_SUMMARIZERS is missing a readable-summary branch for event_type "${type}".`);
    }
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, TARGET), "utf8");
  const offenders = checkLegalMatterEventBodyReadable(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const LEGAL_MATTER_EVENT_SUMMARIZERS = {
      matter_created: () => "x",
    };

    export function formatLegalMatterEventBody(ev) {
      const body = ev.event_body;
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const note = body.note;
        if (typeof note === "string" && note.trim()) return note.trim();
      }
      if (typeof body === "string" && body.trim()) return body.trim();
      if (body == null) return "—";
      try {
        return JSON.stringify(body);
      } catch {
        return "—";
      }
    }
  `;
  const buggyOffenders = checkLegalMatterEventBodyReadable(buggy);

  const src = fs.readFileSync(path.join(repoRoot, TARGET), "utf8");
  const fixedOffenders = checkLegalMatterEventBodyReadable(src);

  if (buggyOffenders.length >= 1 && fixedOffenders.length === 0) {
    console.log("verify-legal-matter-event-body-readable selftest OK");
    process.exit(0);
  }
  console.error("verify-legal-matter-event-body-readable selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-legal-matter-event-body-readable FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-legal-matter-event-body-readable OK — all 6 known legal-matter system event types render a readable summary, never raw JSON",
  );
}
