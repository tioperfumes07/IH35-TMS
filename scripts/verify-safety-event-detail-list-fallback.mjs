#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/safety/SafetyEventsPage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function verify(text) {
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
}

if (process.argv.includes("--selftest")) {
  verify(source);
  let caught = false;
  try {
    verify(source.replace("detailQuery.data ?? allRows.find", "detailQuery.data"));
  } catch {
    caught = true;
  }
  if (!caught) throw new Error("planted removal of the list fallback was not caught");
  console.log("verify-safety-event-detail-list-fallback SELFTEST PASS");
  process.exit(0);
}

verify(source);
console.log("verify-safety-event-detail-list-fallback PASS — populated list rows keep the detail drawer meaningful while the exact read settles");
