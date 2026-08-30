#!/usr/bin/env node
/** @ratchet — preserves a scoreboard Required-column decision; never product or Live proof. */
/**
 * DISP-REQUIRED-SCENARIO-MAINT-INFLATION — scenario.maintenance = Maint WO process col.
 * Book Load / OCR / reserve / in-transit must not claim it without a WO create path.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQ = path.join(ROOT, "docs/specs/scoreboard/modules/dispatch.required.json");
const LABEL = "verify-dispatch-required-scenario-maint-honest";
const FORBIDDEN_IDS = ["secondary.book_load", "queues.in_transit", "planning.reserve", "docs.ocr"];

function load() {
  return JSON.parse(fs.readFileSync(REQ, "utf8"));
}

function offenders(doc) {
  return (doc.leaves || []).filter(
    (l) => FORBIDDEN_IDS.includes(l.id) && (l.required || []).includes("scenario.maintenance"),
  );
}

if (process.argv.includes("--selftest")) {
  const clone = structuredClone(load());
  const leaf = clone.leaves.find((l) => l.id === "docs.ocr");
  leaf.required = [...(leaf.required || []), "scenario.maintenance"];
  if (!offenders(clone).length) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const bad = offenders(load());
if (bad.length) {
  console.error(`${LABEL} FAIL:\n${bad.map((l) => ` - ${l.id}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Book Load/OCR/reserve/in-transit do not claim Maint WO scenario`);
