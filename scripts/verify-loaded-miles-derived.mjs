#!/usr/bin/env node
/**
 * CC-3 queue 2g (2026-10-02): mdata.loads.loaded_miles is DERIVED — shortest miles when > 0, else practical
 * (loadedMilesFor in dispatch/book-load.service.ts). It used to be written only at booking, so every later miles edit
 * (update-load, owner-lock re-rate) left it stale for break-even, relationship scoring, retention and batch pay.
 * Fails when a backend file writes miles_shortest / miles_practical (SQL SET or the update-load field map) without
 * recomputing loaded_miles in the same place. Static, < 1 s.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync("git", ["grep", "-l", "-E", "miles_(shortest|practical)[[:space:]]*=[[:space:]]*[$]|\"miles_(shortest|practical)\"", "--", "apps/backend/src", ":!*.test.ts"], { encoding: "utf8" })
  .trim().split("\n").filter(Boolean);
const fails = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (!/loaded_miles/.test(src) && !/loadedMilesFor\(/.test(src)) fails.push(`${f}: writes miles_shortest / miles_practical but never recomputes loaded_miles (use loadedMilesFor)`);
}
const upd = readFileSync("apps/backend/src/dispatch/update-load.service.ts", "utf8");
if (!/add\("loaded_miles", loadedMilesFor\(/.test(upd)) fails.push("update-load.service.ts: a miles edit must recompute loaded_miles via loadedMilesFor");
const book = readFileSync("apps/backend/src/dispatch/book-load.service.ts", "utf8");
if (!/export function loadedMilesFor\(/.test(book)) fails.push("book-load.service.ts: loadedMilesFor (the one loaded-miles rule) is missing");
if (fails.length) { console.error("verify-loaded-miles-derived: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-loaded-miles-derived: OK — ${files.length} miles writer file(s) all recompute loaded_miles with the one rule`);
