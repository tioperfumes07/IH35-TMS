#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_EVENTS_PERMANENT_ROOT ?? process.cwd();
const migrations = [
  "db/migrations/0251_safety_accidents.sql",
  "db/migrations/0252_safety_citations.sql",
  "db/migrations/0253_safety_violations.sql",
  "db/migrations/0254_safety_roadside.sql",
  "db/migrations/0255_safety_fmcsa.sql",
].map((file) => path.resolve(ROOT, file));

function read(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const source = migrations.map((file) => read(file)).join("\n");
  const requiredTables = [
    "safety.accidents",
    "safety.citations",
    "safety.violations",
    "safety.roadside_inspections",
    "safety.fmcsa_events",
    "safety.event_documents",
  ];
  const failures = [];

  for (const tableName of requiredTables) {
    const shortName = tableName.split(".")[1];
    const startPattern = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${tableName.replace(".", "\\.")}\\s*\\(`, "m");
    const startMatch = source.match(startPattern);
    const startIndex = startMatch?.index ?? -1;
    const nextAlterIndex = source.indexOf(`ALTER TABLE ${tableName}`, startIndex);
    const endIndex = nextAlterIndex > startIndex ? nextAlterIndex : source.length;
    let tableDef = "";
    if (startIndex >= 0) {
      tableDef = source.slice(startIndex, endIndex);
    } else {
      const markerIndex = source.indexOf(tableName);
      const markerEnd = markerIndex >= 0 ? source.indexOf("\n\n", markerIndex) : -1;
      tableDef = markerIndex >= 0 ? source.slice(markerIndex, markerEnd > markerIndex ? markerEnd : source.length) : "";
    }
    if (!/voided_at/i.test(tableDef)) {
      failures.push(`missing_voided_at:${tableName}`);
    }
    if (!/voided_reason/i.test(tableDef)) {
      failures.push(`missing_voided_reason:${tableName}`);
    }
    if (!new RegExp(`prevent_${shortName}_delete`, "m").test(source)) {
      failures.push(`missing_delete_guard_trigger:${tableName}`);
    }
  }

  if (failures.length > 0) {
    console.error("verify:safety-events-permanent-record FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:safety-events-permanent-record OK");
}

main();
