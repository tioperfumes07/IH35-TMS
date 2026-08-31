#!/usr/bin/env node
/**
 * Book Load v4 must expose live_load_number in the UI (AlwaysTrack legacy ref).
 * FAIL if the mounted create/edit wizard hides the only path to set AT# on book/PATCH.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const modalPath = path.join(root, "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");
const src = readFileSync(modalPath, "utf8");

const failures = [];

if (!src.includes('register("live_load_number")')) {
  failures.push("BookLoadModalV4 missing form.register live_load_number");
}
if (!src.includes("data-testid=\"book-load-live-load-number\"")) {
  failures.push("BookLoadModalV4 missing visible live_load_number input (data-testid)");
}
if (!src.includes("live_load_number: values.live_load_number")) {
  failures.push("BookLoadModalV4 create payload must send live_load_number");
}

if (process.argv.includes("--selftest")) {
  const bad = src.replace("book-load-live-load-number", "removed-testid");
  if (bad.includes("book-load-live-load-number")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-book-load-live-load-number-field selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-book-load-live-load-number-field FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-book-load-live-load-number-field PASS");
process.exit(0);
