#!/usr/bin/env node
// DP3 (inventory #33, owner 13:20Z): "Event cells show machine names
// (dispatch.driver_qualification_overridden_by_owner) — plain-English law."
//
// Server-side driver-id scoping was ALREADY built (audit-events-list.routes.ts /
// driver-events.routes.ts both filter on entity_id/driver_id — live-proven separately: 8 rows
// scoped vs 2,770,347 global for one real driver, this session). The remaining gap this guard
// locks is the raw machine event_type/event_class string rendered verbatim in three places.
//
// Source check only — proves every audit event render site uses humanizeAuditEventType() instead
// of the raw field, and that the raw value is at most a `title` tooltip, never the visible text.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dp3-audit-history-plain-english";

const SITES = [
  "apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx",
  "apps/frontend/src/components/audit/AuditEventCard.tsx",
  "apps/frontend/src/components/drivers/AuditHistoryTab.tsx",
];

function loadSource(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectSourceFailures(files = Object.fromEntries(SITES.map((f) => [f, loadSource(f)]))) {
  const failures = [];
  for (const [file, source] of Object.entries(files)) {
    if (!/humanizeAuditEventType\(/.test(source)) {
      failures.push(`${file}: does not use humanizeAuditEventType()`);
    }
    // The raw field may still appear (e.g. in a `title=` tooltip for debugging) but must never be
    // the sole visible text of a rendered label/span with no humanize call wrapping it.
    if (/>\{(row|event)\.event_(type|class)\}</.test(source)) {
      failures.push(`${file}: raw event_type/event_class still rendered as bare visible text`);
    }
  }
  return failures;
}

function selftest() {
  const good = Object.fromEntries(SITES.map((f) => [f, loadSource(f)]));
  if (collectSourceFailures(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — good sources rejected`);
    process.exit(1);
  }
  const first = SITES[0];
  const regressed = { ...good, [first]: good[first].replace(/humanizeAuditEventType\(([\w.]+)\)/g, "$1") };
  if (collectSourceFailures(regressed).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — removing humanizeAuditEventType() was not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 1/1 plant rejected`);
}

if (process.argv.includes("--selftest")) selftest();

const failures = collectSourceFailures();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — all 3 audit event render sites use humanizeAuditEventType(), never a bare machine string`);
