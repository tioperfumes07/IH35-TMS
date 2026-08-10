#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx";
const LABEL = "verify-advance-detail-settlement-label";

function failures(source) {
  const errors = [];
  const expected = /label=\{entityLabel\(null,\s*row\.settlement_id\s*\?\s*String\(row\.settlement_id\)\s*:\s*null,\s*"Settlement"\)\}/;
  if (!expected.test(source)) errors.push("settlement link must use entityLabel with a Settlement fallback");
  if (/label=\{String\(row\.settlement_id\s*\?\?\s*"—"\)\}/.test(source)) errors.push("settlement link paints its raw id");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = '<EntityLink label={entityLabel(null, row.settlement_id ? String(row.settlement_id) : null, "Settlement")} />';
  if (failures(good).length) throw new Error(`${LABEL}: good fixture failed`);
  const raw = '<EntityLink label={String(row.settlement_id ?? "—")} />';
  if (failures(raw).length < 2) throw new Error(`${LABEL}: raw-id mutation was not fully rejected`);
  const missing = "<EntityLink />";
  if (!failures(missing).length) throw new Error(`${LABEL}: missing-label mutation survived`);
  console.log(`${LABEL}: selftest PASS (raw and missing label mutations caught)`);
} else {
  const errors = failures(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  if (errors.length) throw new Error(`${LABEL}: ${errors.join("; ")}`);
  console.log(`${LABEL}: PASS`);
}
