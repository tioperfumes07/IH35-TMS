#!/usr/bin/env node
/**
 * FAIL-B3 — Book + dispatch must insert status=dispatched when a crew is present.
 *
 * Pre-fix: book-load.service.ts resolved statusForInsert via toMdataStatus(input.status)
 * while the route defaulted status to assigned_not_dispatched, so save_mode=book_dispatch
 * left the row pre-dispatch (and only fired an outbox event named "dispatched").
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET = path.join(ROOT, "apps/backend/src/dispatch/book-load.service.ts");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function checkSource(src) {
  assert(src.includes("FAIL-B3"), "FAIL-B3: service must document FAIL-B3 at the statusForInsert fix");
  assert(
    /save_mode === ["']book_dispatch["']\s*&&\s*hasCrew/.test(src),
    "FAIL-B3: missing book_dispatch && hasCrew branch in statusForInsert"
  );
  const after = src.split(/save_mode === ["']book_dispatch["']\s*&&\s*hasCrew/)[1] ?? "";
  assert(
    /^\s*\n?\s*\?\s*["']dispatched["']/.test(after) || /\?\s*["']dispatched["']/.test(after.slice(0, 80)),
    "FAIL-B3: book_dispatch+hasCrew must choose status 'dispatched'"
  );
}

function selftest() {
  const good = `
    // FAIL-B3
    const statusForInsert =
      input.save_mode === "draft"
        ? "draft"
        : input.save_mode === "book_dispatch" && hasCrew
          ? "dispatched"
          : toMdataStatus(input.status);
  `;
  const bad = `
    const statusForInsert =
      input.save_mode === "draft"
        ? "draft"
        : !hasCrew && input.status === "assigned_not_dispatched"
          ? "unassigned"
          : toMdataStatus(input.status);
  `;
  let failed = false;
  try {
    checkSource(bad);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: pre-fix source must FAIL");
  checkSource(good);
  console.log("verify-book-dispatch-sets-dispatched --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  checkSource(fs.readFileSync(TARGET, "utf8"));
  console.log("verify-book-dispatch-sets-dispatched PASS");
}
