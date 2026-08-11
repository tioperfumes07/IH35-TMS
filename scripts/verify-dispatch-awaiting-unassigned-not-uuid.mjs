import { readFileSync } from "node:fs";

const SRC = "apps/frontend/src/pages/dispatch/DispatchBoard.tsx";
const source = readFileSync(SRC, "utf8");

const fail = [];

if (!source.includes('load.id.startsWith("unit:")')) {
  fail.push(`${SRC}: renderLoadNumberCell must reject synthetic "unit:" keys before calling entityLabel`);
}

if (!source.includes("<span className={className}>Unassigned</span>")) {
  fail.push(`${SRC}: awaiting-assignment rows must render "Unassigned", not an EntityLink`);
}

// Ensure the synthetic-key handling is inside renderLoadNumberCell, not somewhere else.
const fnMatch = source.match(/function renderLoadNumberCell\([\s\S]*?\n\}/);
if (!fnMatch || !fnMatch[0].includes('load.id.startsWith("unit:")')) {
  fail.push(`${SRC}: synthetic-key guard must live inside renderLoadNumberCell`);
}

if (fail.length > 0) {
  for (const msg of fail) console.error(`FAIL: ${msg}`);
  process.exit(1);
}
console.log("PASS: awaiting-assignment Load # renders Unassigned, never a synthetic unit: UUID");
