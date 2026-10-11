#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting","docs"],"cols":["connectivity"],"leaves":["related_party_loan_advance_note"],"task":"ACCT-F433-PARTY-LEDGER-RPL-ADVANCE-NOTE","vertical":"class-sweep"}
 * 18366 — ROUND 443.22-2c related-party loan advance note on every funding advance.
 *
 * Asserts: migration adds note_file_id/note_html + widens docs.file_links; create path mints
 * a note for direction=in non-repayment advances; docs entity types include related_party_loan
 * (+ facility); FE register shows Note column; owner template exists beside the engine.
 *
 * Run: node scripts/verify-related-party-loan-advance-note-document.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-related-party-loan-advance-note-document";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  migration: "db/migrations/202615461200_related_party_loan_advance_note.sql",
  noteSvc: "apps/backend/src/accounting/related-party-loan-posting/advance-note.service.ts",
  createEntry: "apps/backend/src/accounting/related-party-loan-posting/create-entry.service.ts",
  routes: "apps/backend/src/accounting/related-party-loan-posting/routes.ts",
  filesRoutes: "apps/backend/src/docs/files.routes.ts",
  entityLabels: "apps/backend/src/docs/entity-labels.ts",
  feApi: "apps/frontend/src/api/related-party-loans.ts",
  feDocs: "apps/frontend/src/api/docs.ts",
  fePage: "apps/frontend/src/pages/accounting/loans/LoansAdvancesPage.tsx",
  template: "docs/bus/RELATED-PARTY-LOAN-ADVANCE-NOTE-TEMPLATE.md",
};

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function fail(errors) {
  console.error(`${LABEL} FAILED:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

export function staticProblems(srcs) {
  const errors = [];
  const {
    migration,
    noteSvc,
    createEntry,
    routes,
    filesRoutes,
    entityLabels,
    feApi,
    feDocs,
    fePage,
    template,
  } = srcs;

  // F1 — migration columns + file_links widen
  if (!migration.includes("note_file_id") || !migration.includes("note_html")) {
    errors.push("F1: migration must add note_file_id and note_html on related_party_loan_entries");
  }
  if (!migration.includes("'related_party_loan'") || !migration.includes("'related_party_loan_facility'")) {
    errors.push("F1: migration must widen docs.file_links for related_party_loan + facility");
  }
  if (!migration.includes("REFERENCES docs.files(id)")) {
    errors.push("F1: note_file_id must FK to docs.files");
  }

  // F2 — note service mints HTML + links both ways
  if (!noteSvc.includes("export function advanceRequiresNote") || !noteSvc.includes("export async function mintRelatedPartyLoanAdvanceNote")) {
    errors.push("F2: advance-note.service must export advanceRequiresNote + mintRelatedPartyLoanAdvanceNote");
  }
  if (!noteSvc.includes("buildAdvanceNoteHtml") || !noteSvc.includes("Related-Party Loan Advance Note")) {
    errors.push("F2: note service must build owner-readable advance note HTML");
  }
  if (!noteSvc.includes('entityType: "related_party_loan"') && !noteSvc.includes('"related_party_loan"')) {
    errors.push("F2: note service must link docs.file_links entity_type related_party_loan");
  }
  if (!noteSvc.includes("related_party_loan_facility")) {
    errors.push("F2: note service must also link the facility");
  }
  if (!noteSvc.includes("SET note_file_id") || !noteSvc.includes("note_html")) {
    errors.push("F2: mint must stamp note_file_id + note_html on the entry");
  }
  if (!noteSvc.includes('documentKind === "repayment"') || !noteSvc.includes('direction === "in"')) {
    errors.push("F2: advanceRequiresNote must skip repayments and require direction=in");
  }

  // F3 — create-entry.service mints note inside the create transaction; list surfaces note fields
  if (!createEntry.includes("mintRelatedPartyLoanAdvanceNote") || !createEntry.includes("advanceRequiresNote")) {
    errors.push("F3: create-entry.service must call advanceRequiresNote + mintRelatedPartyLoanAdvanceNote");
  }
  if (!routes.includes("note_file_id") || !routes.includes("has_note")) {
    errors.push("F3: list/create must surface note_file_id / has_note");
  }

  // F4 — docs widen (routes + labels + FE)
  for (const [name, src] of [
    ["files.routes", filesRoutes],
    ["entity-labels", entityLabels],
    ["fe docs FileEntityType", feDocs],
  ]) {
    if (!src.includes("related_party_loan") || !src.includes("related_party_loan_facility")) {
      errors.push(`F4: ${name} must include related_party_loan + related_party_loan_facility`);
    }
  }
  if (!filesRoutes.includes('entityType === "related_party_loan"') || !filesRoutes.includes('entityType === "related_party_loan_facility"')) {
    errors.push("F4: ensureLinkEntityExists must branch for both related-party loan entity types");
  }

  // F5 — FE register Note column + typed fields
  if (!feApi.includes("note_file_id") || !feApi.includes("has_note")) {
    errors.push("F5: RelatedPartyLoanRow must carry note_file_id + has_note");
  }
  if (!fePage.includes('key: "note"') || !fePage.includes("Advance note")) {
    errors.push("F5: LoansAdvancesPage must show a Note column for the advance document");
  }

  // F6 — owner template beside the engine
  if (!template.includes("ROUND 443.22-2c") || !template.includes("advance-note.service.ts")) {
    errors.push("F6: owner template must name ROUND 443.22-2c and the advance-note service");
  }
  if (!noteSvc.includes("RELATED-PARTY-LOAN-ADVANCE-NOTE-TEMPLATE.md")) {
    errors.push("F6: note service must cite the owner template path");
  }

  return errors;
}

function selftest() {
  const good = {
    migration: "note_file_id note_html 'related_party_loan' 'related_party_loan_facility' REFERENCES docs.files(id)",
    noteSvc:
      'export function advanceRequiresNote export async function mintRelatedPartyLoanAdvanceNote buildAdvanceNoteHtml Related-Party Loan Advance Note "related_party_loan" related_party_loan_facility SET note_file_id note_html documentKind === "repayment" direction === "in" RELATED-PARTY-LOAN-ADVANCE-NOTE-TEMPLATE.md',
    createEntry: "mintRelatedPartyLoanAdvanceNote advanceRequiresNote",
    routes: "note_file_id has_note",
    filesRoutes:
      'related_party_loan related_party_loan_facility entityType === "related_party_loan" entityType === "related_party_loan_facility"',
    entityLabels: "related_party_loan related_party_loan_facility",
    feApi: "note_file_id has_note",
    feDocs: "related_party_loan related_party_loan_facility",
    fePage: 'key: "note" Advance note',
    template: "ROUND 443.22-2c advance-note.service.ts",
  };
  const bad = staticProblems({
    migration: "nope",
    noteSvc: "nope",
    createEntry: "nope",
    routes: "nope",
    filesRoutes: "nope",
    entityLabels: "nope",
    feApi: "nope",
    feDocs: "nope",
    fePage: "nope",
    template: "nope",
  });
  if (staticProblems(good).length !== 0) {
    console.error(`${LABEL} selftest FAILED: good fixture should pass`);
    process.exit(1);
  }
  if (bad.length < 6) {
    console.error(`${LABEL} selftest FAILED: bad fixture should collect multiple errors (got ${bad.length})`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  for (const [k, rel] of Object.entries(FILES)) {
    if (!existsSync(join(ROOT, rel))) fail([`missing file (${k}): ${rel}`]);
  }
  const srcs = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  // 443.75: the create writer moved to create-entry.service.ts (443.22-2e); the route delegates to it.
  srcs.routes = `${srcs.routes}\n${read("apps/backend/src/accounting/related-party-loan-posting/create-entry.service.ts")}`;
  const errors = staticProblems(srcs);
  if (errors.length) fail(errors);
  console.log(`${LABEL} PASS`);
}

main();
