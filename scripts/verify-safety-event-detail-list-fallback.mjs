#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/safety/SafetyEventsPage.tsx";
const BACKEND = "apps/backend/src/safety/safety.routes.ts";
const source = fs.readFileSync(FILE, "utf8");
const backend = fs.readFileSync(BACKEND, "utf8");

function verify(text, backendText = backend) {
  const requirements = [
    /const selectedEvent = useMemo\(/,
    /detailQuery\.data \?\? allRows\.find\(\(row\) => String\(row\.id\) === selectedEventId\) \?\? null/,
    /renderSubject\(selectedEvent\)/,
    /selectedEvent\?\.related_load_id/,
    /id=\{selectedEvent\.related_load_id\}/,
  ];
  for (const requirement of requirements) {
    if (!requirement.test(text)) throw new Error(`missing ${requirement}`);
  }
  if (/Title:<\/span> \{detailQuery\.data/.test(text)) {
    throw new Error("detail drawer still renders directly from the async-only detail query");
  }
  if (!/app\.get\("\/api\/v1\/safety\/events\/:id"/.test(backendText)) {
    throw new Error("mounted safety event detail route is missing");
  }
  if (/views\.safety_events_with_driver[\s\S]{0,500}?\.catch\s*\(/.test(backendText)) {
    throw new Error("event detail SQL failure is still converted to false not-found");
  }
}

if (process.argv.includes("--selftest")) {
  verify(source, backend);
  let caught = false;
  try {
    verify(source.replace("detailQuery.data ?? allRows.find", "detailQuery.data"));
  } catch {
    caught = true;
  }
  if (!caught) throw new Error("planted removal of the list fallback was not caught");
  caught = false;
  try {
    verify(source, backend.replace("        );\n      return res.rows[0] ?? null;", "        ).catch(() => ({ rows: [] }));\n      return res.rows[0] ?? null;"));
  } catch {
    caught = true;
  }
  if (!caught) throw new Error("planted backend catch swallow was not caught");
  console.log("verify-safety-event-detail-list-fallback SELFTEST PASS — 2/2 mutations caught");
  process.exit(0);
}

verify(source);
console.log("verify-safety-event-detail-list-fallback PASS — populated list rows keep the detail drawer meaningful while the exact read settles");
