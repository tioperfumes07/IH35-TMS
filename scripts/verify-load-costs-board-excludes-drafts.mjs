#!/usr/bin/env node
/**
 * Spec 09-04-2026-Claude-Coder-1-Load-Costs-Board-19-Columns.md §5.2 / §2.1: "Drafts never appear.
 * WHERE l.status::text <> 'draft'. The board is live loads only." Cancelled (voided) loads are hidden
 * by default but toggle-able (owner order 2026-09-04) -- draft has no such toggle, ever.
 */
import fs from "node:fs";
import { register } from 'tsx/esm/api';
register();
const { canonicalLoadCostsOpenClause } = await import('../apps/backend/src/dispatch/canonical-active-load-set.ts');
const normal = canonicalLoadCostsOpenClause('l',false);
const history = canonicalLoadCostsOpenClause('l',true);

const BACKEND = "apps/backend/src/accounting/load-costs-board.routes.ts";

function violations(backend, current = normal, voided = history) {
  const errors = [];
  if (!backend.includes('canonicalLoadCostsOpenClause("l", parsed.data.show_voided)')) errors.push('board does not mount the shared predicate');
  if (!current.includes("l.status <> 'draft'") || !voided.includes("l.status <> 'draft'")) errors.push("draft must be excluded in both normal and show_voided scopes");
  // The draft exclusion must not be inside the show_voided ternary -- it is unconditional, unlike cancelled.
  const showVoidedLine = backend.match(/\$\{parsed\.data\.show_voided[^}]*\}/);
  if (showVoidedLine && showVoidedLine[0].includes("draft")) errors.push("draft exclusion is gated behind show_voided -- it must be unconditional");
  if (!backend.includes("show_voided")) errors.push("no show_voided toggle for cancelled loads");
  if (!current.includes("l.status NOT IN ('cancelled','voided',")) errors.push("cancelled loads are not excluded by default");
  if (voided.includes("l.status NOT IN ('cancelled','voided',")) errors.push("show_voided does not allow cancelled loads");
  return errors;
}

function check(backend, current = normal, voided = history) {
  const errors = violations(backend, current, voided);
  if (errors.length) throw new Error(errors.join("; "));
}

const backend = fs.readFileSync(BACKEND, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    [backend, normal.replace("AND l.status <> 'draft'", ""), history],
    [backend, normal, history.replace("AND l.status <> 'draft'", "")],
    [backend, normal.replace("l.status NOT IN ('cancelled','voided',", "l.status NOT IN ("), history],
    [backend, normal, normal],
    [backend.replaceAll("show_voided", "")],
    [backend.replaceAll("canonicalLoadCostsOpenClause", "localPredicate")],
  ];
  for (const mutated of mutations) {
    try { check(...mutated); }
    catch { caught += 1; continue; }
    throw new Error("a drafts-exclusion mutation escaped detection");
  }
  check(backend);
  console.log(`PASS verify-load-costs-board-excludes-drafts --selftest (${caught}/${mutations.length})`);
} else {
  check(backend);
  console.log("PASS verify-load-costs-board-excludes-drafts (draft unconditional, cancelled default-hidden/toggle-able)");
}
