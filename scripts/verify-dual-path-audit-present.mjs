#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const p = resolve(import.meta.dirname, "../docs/trackers/DUAL-PATH-OLD-VS-NEW-DESIGN-AUDIT-2026-07-22.md");
const failures = [];

let t = "";
try {
  t = readFileSync(p, "utf8");
} catch {
  console.error("FAIL verify-dual-path-audit-present: missing docs/trackers/DUAL-PATH-OLD-VS-NEW-DESIGN-AUDIT-2026-07-22.md");
  process.exit(1);
}

if (!/DUAL-PATH \/ OLD vs NEW DESIGN/.test(t)) failures.push("missing title");
if (!/OLD design/.test(t)) failures.push("missing 'OLD design' header");
if (!/NEW design/.test(t)) failures.push("missing 'NEW design' header");
if (!/What operators see TODAY/.test(t)) failures.push("missing 'What operators see TODAY' header");
if (!/TOP 10/i.test(t)) failures.push("missing ranked TOP 10 fix-now list");
if (!/DUAL_PATH_OLD_ACTIVE/.test(t)) failures.push("missing DUAL_PATH_OLD_ACTIVE class");
if (!/ORPHAN_NEW/.test(t)) failures.push("missing ORPHAN_NEW class");
if (!/COMING_SOON_STUB/.test(t)) failures.push("missing COMING_SOON_STUB class");

if (failures.length) {
  console.error("FAIL verify-dual-path-audit-present:", failures.join("; "));
  process.exit(1);
}
console.log("PASS verify-dual-path-audit-present");
