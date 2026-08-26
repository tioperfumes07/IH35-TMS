#!/usr/bin/env node
/** SAFETY-F6486 — 425C Audit staged enum filters use shared Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/pages/safety/audit-425c/Audit425cPage.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");

function assertContract(source) {
  if (/<select\b/.test(source)) throw new Error("native select returned to Audit425cPage");
  for (const id of ["audit-425c-section-filter", "audit-425c-action-filter"]) {
    if (!source.includes(`htmlFor="${id}"`) || !source.includes(`id="${id}"`) || !source.includes(`dataTestId="${id}"`)) {
      throw new Error(`missing associated/testable 425C filter ${id}`);
    }
  }
  for (const token of [
    "useStagedListFilters({",
    "onApply: setApplied",
    "section: next as Form425cSectionId",
    "action: next",
    "applied.action && row.event_type !== applied.action",
    "applied.section",
    "humanizeEnumLabel(value)",
  ]) if (!source.includes(token)) throw new Error(`missing 425C staged filter contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const planted = diskSource.replace("onApply: setApplied", "onApply: () => undefined");
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, SAFETY_F6486_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted Apply no-op stayed green");
  console.log("verify-safety-audit-425c-filter-comboboxes --selftest PASS");
  process.exit(0);
}

assertContract(process.env.SAFETY_F6486_PLANTED_SOURCE ?? diskSource);
console.log("verify-safety-audit-425c-filter-comboboxes PASS — staged section/action predicates and Apply preserved");
