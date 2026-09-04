#!/usr/bin/env node
/**
 * Spec 09-04-2026-Claude-Coder-1-Load-Costs-Board-19-Columns.md §5.2 / §2.1: "Drafts never appear.
 * WHERE l.status::text <> 'draft'. The board is live loads only." Cancelled (voided) loads are hidden
 * by default but toggle-able (owner order 2026-09-04) -- draft has no such toggle, ever.
 */
import fs from "node:fs";

const BACKEND = "apps/backend/src/accounting/load-costs-board.routes.ts";

function violations(backend) {
  const errors = [];
  if (!/AND l\.status <> 'draft'/.test(backend)) errors.push("no unconditional status <> 'draft' predicate in the board's WHERE clause");
  // The draft exclusion must not be inside the show_voided ternary -- it is unconditional, unlike cancelled.
  const showVoidedLine = backend.match(/\$\{parsed\.data\.show_voided[^}]*\}/);
  if (showVoidedLine && showVoidedLine[0].includes("draft")) errors.push("draft exclusion is gated behind show_voided -- it must be unconditional");
  if (!backend.includes("show_voided")) errors.push("no show_voided toggle for cancelled loads");
  if (!backend.includes("AND l.status <> 'cancelled'")) errors.push("cancelled loads are not excluded by default");
  return errors;
}

function check(backend) {
  const errors = violations(backend);
  if (errors.length) throw new Error(errors.join("; "));
}

const backend = fs.readFileSync(BACKEND, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    backend.replace("AND l.status <> 'draft'", ""),
    backend.replace("AND l.status <> 'cancelled'", "TRUE"),
    backend.replaceAll("show_voided", ""),
  ];
  for (const mutated of mutations) {
    try { check(mutated); }
    catch { caught += 1; continue; }
    throw new Error("a drafts-exclusion mutation escaped detection");
  }
  check(backend);
  console.log(`PASS verify-load-costs-board-excludes-drafts --selftest (${caught}/${mutations.length})`);
} else {
  check(backend);
  console.log("PASS verify-load-costs-board-excludes-drafts (draft unconditional, cancelled default-hidden/toggle-able)");
}
