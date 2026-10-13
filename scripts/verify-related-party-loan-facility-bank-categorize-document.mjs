#!/usr/bin/env node
/**
 * 18362 — ROUND 443.22-2b Option 1 related-party LOC facility register.
 *
 * Asserts: migration plants facilities + entry/bank columns; create path ensures one facility per
 * person; Finance → Loans lists facilities with rollups; bank feed does NOT silently mint a loan
 * (443.22: user confirms every time via the Loan action / wizard — letter 2a).
 *
 * Run: node scripts/verify-related-party-loan-facility-bank-categorize-document.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-related-party-loan-facility-bank-categorize-document";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  migration: "db/migrations/202615441200_related_party_loan_facility_loc.sql",
  facilitySvc: "apps/backend/src/accounting/related-party-loan-posting/facility.service.ts",
  createEntry: "apps/backend/src/accounting/related-party-loan-posting/create-entry.service.ts",
  routes: "apps/backend/src/accounting/related-party-loan-posting/routes.ts",
  feApi: "apps/frontend/src/api/related-party-loans.ts",
  fePage: "apps/frontend/src/pages/accounting/loans/LoansAdvancesPage.tsx",
  glPost: "apps/backend/src/banking/bank-feed-gl-posting.service.ts",
  linkage: "scripts/verify-transaction-linkage-law.mjs",
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
  const { migration, facilitySvc, createEntry, routes, feApi, fePage, glPost, linkage } = srcs;

  // M1 — migration plants facility table + entry columns + reverse pointer + bank-line restates
  if (!migration.includes("related_party_loan_facilities")) {
    errors.push("M1: migration missing accounting.related_party_loan_facilities");
  }
  if (!migration.includes("uq_rpl_facilities_live_account")) {
    errors.push("M1: migration missing unique live facility per (company, account)");
  }
  if (!migration.includes("matched_related_party_loan_id")) {
    errors.push("M1: migration missing banking.bank_transactions.matched_related_party_loan_id");
  }
  if (!migration.includes("document_kind") || !migration.includes("bank_funding")) {
    errors.push("M1: migration missing document_kind / bank_funding target_type widen");
  }
  if (!migration.includes("facility_id") || !migration.includes("display_id")) {
    errors.push("M1: migration missing entry facility_id / display_id");
  }
  if (!migration.includes("bank_line_match_pointers") || !migration.includes("bank_line_dead_link")) {
    errors.push("M1: migration must restate bank_line_match_pointers + bank_line_dead_link with the new pointer");
  }

  // S1 — facility service: ensure + list rollups + display id
  if (!facilitySvc.includes("export async function ensureRelatedPartyLoanFacility")) {
    errors.push("S1: missing ensureRelatedPartyLoanFacility");
  }
  if (!facilitySvc.includes("ON CONFLICT (operating_company_id, account_id)")) {
    errors.push("S1: ensure must upsert on (company, account) — one facility per person");
  }
  if (!facilitySvc.includes("export async function listRelatedPartyLoanFacilities")) {
    errors.push("S1: missing listRelatedPartyLoanFacilities");
  }
  if (!facilitySvc.includes("principal_advanced_cents") || !facilitySvc.includes("open_balance_cents")) {
    errors.push("S1: facility list must roll up advanced / open balance");
  }
  if (!facilitySvc.includes("allocateRelatedPartyLoanDisplayId") || !facilitySvc.includes("RPL-")) {
    errors.push("S1: missing RPL-YYYY-NNNN display id allocator");
  }

  // S2 — routes: facilities GET; create-entry.service attaches facility + display_id
  if (!routes.includes("/api/v1/accounting/related-party-loan-facilities")) {
    errors.push("S2: missing GET related-party-loan-facilities");
  }
  if (!createEntry.includes("ensureRelatedPartyLoanFacility") || !createEntry.includes("facility_id")) {
    errors.push("S2: create path must ensure facility and write facility_id");
  }
  if (!createEntry.includes("allocateRelatedPartyLoanDisplayId") || !createEntry.includes("document_kind")) {
    errors.push("S2: create path must mint display_id and document_kind");
  }

  // S3 — FE: facilities register on Loans & Advances
  if (!feApi.includes("listRelatedPartyLoanFacilities") || !feApi.includes("RelatedPartyLoanFacilityRow")) {
    errors.push("S3: FE API missing facilities list client");
  }
  if (!fePage.includes("listRelatedPartyLoanFacilities") || !fePage.includes("related-party-loan-facilities-register")) {
    errors.push("S3: LoansAdvancesPage must render the facilities register");
  }
  if (!fePage.includes("Open balance") || !fePage.includes("Accrued interest")) {
    errors.push("S3: facilities table must show open balance and accrued interest");
  }

  // S4 — 443.22: never silent-mint from bank categorize (confirm every time via Loan wizard)
  if (glPost.includes("ensureRelatedPartyLoanDocumentFromBankCategorize")) {
    errors.push("S4: bank-feed-gl-posting must NOT silent-mint loans — 443.22 confirms via Loan action");
  }
  if (existsSync(join(ROOT, "apps/backend/src/banking/related-party-loan-from-bank.service.ts"))) {
    const fromBank = read("apps/backend/src/banking/related-party-loan-from-bank.service.ts");
    if (fromBank.includes("ensureRelatedPartyLoanDocumentFromBankCategorize") && glPost.includes("from-bank")) {
      errors.push("S4: silent from-bank categorize mint is forbidden under 443.22");
    }
  }

  // S5 — linkage law classifies facilities (STEP 1 already merged; keep locked)
  if (!linkage.includes("related_party_loan_facilities") || !linkage.includes("NOT_TRANSACTIONAL")) {
    errors.push("S5: verify-transaction-linkage-law must classify related_party_loan_facilities NOT_TRANSACTIONAL");
  }

  return errors;
}

function selftest() {
  const good = {
    migration: read(FILES.migration),
    facilitySvc: read(FILES.facilitySvc),
    createEntry: read(FILES.createEntry),
    routes: read(FILES.routes),
    feApi: read(FILES.feApi),
    fePage: read(FILES.fePage),
    glPost: read(FILES.glPost),
    linkage: read(FILES.linkage),
  };
  const ok = staticProblems(good);
  if (ok.length) fail(["selftest expected PASS on live tree:", ...ok]);

  const broken = {
    ...good,
    facilitySvc: good.facilitySvc.replace("ensureRelatedPartyLoanFacility", "ensureX"),
  };
  const bad = staticProblems(broken);
  if (!bad.some((e) => e.startsWith("S1:"))) {
    fail(["selftest expected S1 failure when ensureRelatedPartyLoanFacility is stripped"]);
  }
  console.log(`${LABEL} selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  for (const rel of Object.values(FILES)) {
    if (!existsSync(join(ROOT, rel))) fail([`missing required file ${rel}`]);
  }
  const srcs = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const errors = staticProblems(srcs);
  if (errors.length) fail(errors);
  console.log(`${LABEL} OK`);
}

main();
