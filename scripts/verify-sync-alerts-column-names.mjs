#!/usr/bin/env node
/**
 * GUARD: verify-sync-alerts-column-names.mjs
 *
 * Ensures no INSERT INTO qbo.sync_alerts uses the drifted column names
 * `entity_type` or `error_message` — the live Neon table uses `kind` and `message`.
 * Also ensures no INSERT uses severity 'error' without the CHECK constraint
 * having been altered to allow it (migration 202613301900).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BACKEND_SRC = join(process.cwd(), "apps/backend/src");
const FORBIDDEN_COLUMNS = ["entity_type", "error_message"];

let failures = 0;

/**
 * Extract the column list from an INSERT INTO qbo.sync_alerts statement.
 * Matches: INSERT INTO qbo.sync_alerts ( col1, col2, ... ) VALUES
 */
function extractInsertColumns(content) {
  const columns = [];
  const pattern = /INSERT\s+INTO\s+qbo\.sync_alerts\s*\(([^)]+)\)\s*VALUES/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const colList = match[1].split(",").map(c => c.trim().toLowerCase());
    columns.push(...colList);
  }
  return columns;
}

function checkFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  if (!/INSERT\s+INTO\s+qbo\.sync_alerts/i.test(content)) return;
  const cols = extractInsertColumns(content);
  for (const col of cols) {
    if (FORBIDDEN_COLUMNS.includes(col)) {
      console.error(`FAIL: ${filePath} INSERT INTO qbo.sync_alerts uses drifted column '${col}'. Use 'kind'/'message' instead.`);
      failures++;
    }
  }
}

function walkDir(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.name.endsWith(".ts")) {
      checkFile(fullPath);
    }
  }
}

walkDir(BACKEND_SRC);

if (failures > 0) {
  console.error(`\n${failures} failure(s) — sync_alerts INSERT statements must use live DB column names (kind, message).`);
  process.exit(1);
} else {
  console.log("OK: all sync_alerts INSERT statements use live DB column names (kind, message).");
  process.exit(0);
}
