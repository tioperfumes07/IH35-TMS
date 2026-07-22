#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const p = resolve(import.meta.dirname, "../docs/trackers/DRIVER-PICKER-SYSTEM-AUDIT-2026-07-22.md");
const t = readFileSync(p, "utf8");
const failures = [];
if (!/DRIVER PICKER — SYSTEM-WIDE AUDIT/.test(t)) failures.push("missing title");
if (!/\|\s*\*\*TOTAL hits\*\*/.test(t)) failures.push("missing TOTAL hits row");
if (!/CreateDriverModal/.test(t)) failures.push("audit must mention CreateDriverModal");
if (failures.length) {
  console.error("FAIL verify-driver-picker-audit-present:", failures.join("; "));
  process.exit(1);
}
console.log("PASS verify-driver-picker-audit-present");
