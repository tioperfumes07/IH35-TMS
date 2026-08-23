#!/usr/bin/env node
/**
 * GUARD: ORPH-003 — vendor "payment method on file" must come from the structured
 * mdata.vendor_payment_methods table (migration 202613110000), never from a notes-text heuristic
 * again, and the table must never grow a raw full account/routing-number column.
 *
 * ROOT CAUSE this guard freezes shut: apps/frontend/src/pages/Vendors.tsx's old buildAchDisplay()
 * rendered "ACH on file" purely by string-matching the word "ach" anywhere in vendor.notes free
 * text — no structured record existed anywhere in the schema. A vendor whose notes happened to
 * mention "ach" for an unrelated reason (e.g. "reach out before Friday") would false-positive; a
 * vendor with a real ACH method on file but no matching notes text would false-negative. The repo's
 * own audit named this exact defect shape and prescribed the fix:
 * docs/specs/CURSOR-AUDIT-2026-07-15/modules/15-CUSTOMERS-VENDORS.md §5 item 5 — "Replace notes
 * heuristic with structured payment-method records (or explicit 'not on file') before any Bill Pay
 * automation."
 *
 * THREE checks:
 *   (a) no frontend file re-introduces a `.includes("ach")` (or similar) check chained off a
 *       vendor `notes` field — the exact regression shape of the original defect;
 *   (b) the structured read path (listVendorPaymentMethods) is actually wired into both the
 *       Vendors.tsx quick-view AND the VendorDetail.tsx management UI — a guard that only checked
 *       "the heuristic is gone" would pass on a vendor page that silently dropped the feature too;
 *   (c) the migration's mdata.vendor_payment_methods table never grows a raw account_number /
 *       routing_number column — the account_mask security posture (masked last-4 only, mirroring
 *       banking.bank_accounts) must hold even as the table evolves.
 *
 * Run:  node scripts/verify-vendor-payment-methods-structured-not-notes-heuristic.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND_SRC = path.join(root, "apps/frontend/src");
const MIGRATIONS_DIR = path.join(root, "db/migrations");
const LABEL = "verify-vendor-payment-methods-structured-not-notes-heuristic";

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, exts, out);
    } else if (exts.some((ext) => e.name.endsWith(ext)) && !e.name.includes(".test.")) {
      out.push(p);
    }
  }
  return out;
}

/** (a) notes-text "ach" heuristic regression: a `notes`-derived expression feeding `.includes("ach")`. */
export function findNotesHeuristicRegressions(src) {
  const bad = [];
  // Looks for a `notes` token, then (within a bounded window, tolerant of chained calls/newlines)
  // an `.includes("ach")` / `.includes('ach')` call — case-insensitive on the literal, since the
  // original defect lower-cased first. Bounded window keeps this from crossing into an unrelated,
  // later `.includes("ach")` call that has nothing to do with vendor notes.
  const re = /notes[\s\S]{0,150}?\.includes\(\s*["']ach["']\s*\)/gi;
  for (const m of src.matchAll(re)) {
    bad.push(`notes-text "ach" heuristic regression: ${JSON.stringify(m[0].slice(0, 80))}`);
  }
  return bad;
}

/** (b) the structured read path must actually be wired into the vendor UI, not just exist unused. */
export function checkStructuredWiring({ vendorsTsxSrc, vendorDetailTsxSrc, sectionExists }) {
  const problems = [];
  if (vendorsTsxSrc !== null && !/listVendorPaymentMethods/.test(vendorsTsxSrc)) {
    problems.push("apps/frontend/src/pages/Vendors.tsx no longer calls listVendorPaymentMethods (structured read path not wired)");
  }
  if (vendorDetailTsxSrc !== null && !/VendorPaymentMethodsSection/.test(vendorDetailTsxSrc)) {
    problems.push("apps/frontend/src/pages/VendorDetail.tsx no longer renders VendorPaymentMethodsSection (management UI not wired)");
  }
  if (sectionExists === false) {
    problems.push("apps/frontend/src/pages/vendors/VendorPaymentMethodsSection.tsx is missing");
  }
  return problems;
}

/** (c) the migration's CREATE TABLE block must never carry a raw full account/routing-number column. */
export function findRawAccountNumberColumns(migrationSrc) {
  const bad = [];
  const tableMatch = /CREATE TABLE[\s\S]*?mdata\.vendor_payment_methods\s*\(([\s\S]*?)\n[ \t]*\)\s*;/i.exec(migrationSrc);
  if (!tableMatch) return bad; // absence is covered by the separate "migration exists" check below
  const body = tableMatch[1];
  for (const banned of [/\baccount_number\b/i, /\brouting_number\b/i, /\bbank_account_number\b/i]) {
    if (banned.test(body)) {
      bad.push(`mdata.vendor_payment_methods CREATE TABLE carries a raw ${banned.source} column — masked account_mask only, per the banking.bank_accounts security posture this table mirrors`);
    }
  }
  return bad;
}

export function collectProblems({ frontendSources, migrationSrc, vendorsTsxSrc, vendorDetailTsxSrc, sectionExists }) {
  const problems = [];
  for (const { file, src } of frontendSources) {
    for (const issue of findNotesHeuristicRegressions(src)) problems.push(`${file}: ${issue}`);
  }
  for (const issue of checkStructuredWiring({ vendorsTsxSrc, vendorDetailTsxSrc, sectionExists })) {
    problems.push(issue);
  }
  if (migrationSrc === null) {
    problems.push("no db/migrations/*.sql defines mdata.vendor_payment_methods — structured table missing");
  } else {
    for (const issue of findRawAccountNumberColumns(migrationSrc)) problems.push(issue);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  // (a) the defect verbatim (this guard's own former source, before the fix).
  const badHeuristic = `
    function buildAchDisplay(vendor) {
      const text = parseVendorNotes(vendor.notes).publicNotes.toLowerCase();
      if (text.includes("ach")) return "ACH on file";
      return "—";
    }
  `;
  if (findNotesHeuristicRegressions(badHeuristic).length !== 1) {
    failures.push("the original buildAchDisplay() heuristic verbatim was NOT caught");
  }

  // (a) the real fix shape must never false-positive.
  const goodDisplay = `
    function formatPaymentMethodDisplay(methods, isLoading) {
      const active = (methods ?? []).filter((m) => !m.deactivated_at);
      if (active.length === 0) return "Not on file";
      const primary = active.find((m) => m.is_primary) ?? active[0];
      return primary.method_type === "ach" ? "ACH on file" : "Other on file";
    }
  `;
  if (findNotesHeuristicRegressions(goodDisplay).length !== 0) {
    failures.push("the structured formatPaymentMethodDisplay() fix was FALSE-POSITIVE flagged");
  }

  // (a) an UNRELATED later .includes("ach") far away from any `notes` token must not false-positive
  // just because the file also happens to contain the word `notes` somewhere much earlier.
  const filler = "x".repeat(400);
  const unrelated = `
    const notes = customer.notes;
    // ${filler}
    const isMachine = someOtherToken.includes("ach");
  `;
  if (findNotesHeuristicRegressions(unrelated).length !== 0) {
    failures.push("an unrelated distant .includes(\"ach\") was false-positive flagged (window too wide)");
  }

  // (b) wiring checks.
  if (checkStructuredWiring({ vendorsTsxSrc: "no reference here", vendorDetailTsxSrc: "has VendorPaymentMethodsSection", sectionExists: true }).length !== 1) {
    failures.push("missing listVendorPaymentMethods wiring in Vendors.tsx was not caught");
  }
  if (checkStructuredWiring({ vendorsTsxSrc: "listVendorPaymentMethods(x)", vendorDetailTsxSrc: "no reference", sectionExists: true }).length !== 1) {
    failures.push("missing VendorPaymentMethodsSection wiring in VendorDetail.tsx was not caught");
  }
  if (checkStructuredWiring({ vendorsTsxSrc: "listVendorPaymentMethods(x)", vendorDetailTsxSrc: "<VendorPaymentMethodsSection />", sectionExists: true }).length !== 0) {
    failures.push("fully-wired shape was false-positive flagged");
  }
  if (checkStructuredWiring({ vendorsTsxSrc: "listVendorPaymentMethods(x)", vendorDetailTsxSrc: "<VendorPaymentMethodsSection />", sectionExists: false }).length !== 1) {
    failures.push("a deleted VendorPaymentMethodsSection.tsx file was not caught");
  }

  // (c) raw column checks.
  const rawColumnMigration = `
    CREATE TABLE IF NOT EXISTS mdata.vendor_payment_methods (
      id uuid PRIMARY KEY,
      account_number text,
      routing_number text
    );
  `;
  if (findRawAccountNumberColumns(rawColumnMigration).length !== 2) {
    failures.push("raw account_number/routing_number columns were NOT caught");
  }
  const maskedMigration = `
    CREATE TABLE IF NOT EXISTS mdata.vendor_payment_methods (
      id uuid PRIMARY KEY,
      account_mask text CHECK (account_mask IS NULL OR (length(account_mask) <= 4 AND account_mask !~ '^\\d{5,}$'))
    );
  `;
  if (findRawAccountNumberColumns(maskedMigration).length !== 0) {
    failures.push("the correct masked-only shape was false-positive flagged");
  }

  // End-to-end.
  const e2eProblems = collectProblems({
    frontendSources: [{ file: "x.tsx", src: badHeuristic }],
    migrationSrc: rawColumnMigration,
    vendorsTsxSrc: "no reference",
    vendorDetailTsxSrc: "no reference",
    sectionExists: false,
  });
  if (e2eProblems.length !== 6) {
    failures.push(`collectProblems end-to-end expected 6 problems (1 heuristic + 2 wiring + 1 missing-section + 2 raw columns), got ${e2eProblems.length}`);
  }
  const e2eClean = collectProblems({
    frontendSources: [{ file: "x.tsx", src: goodDisplay }],
    migrationSrc: maskedMigration,
    vendorsTsxSrc: "listVendorPaymentMethods(x)",
    vendorDetailTsxSrc: "<VendorPaymentMethodsSection />",
    sectionExists: true,
  });
  if (e2eClean.length !== 0) failures.push(`collectProblems end-to-end clean state flagged ${e2eClean.length} problem(s)`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — heuristic regression caught, fix shape never false-positive, wide-window ` +
      `false-positive avoided, wiring checks (Vendors.tsx / VendorDetail.tsx / section file) all catch ` +
      `their own defect, raw-column check catches + clears correctly, end-to-end red + green.`
  );
  process.exit(0);
}

const frontendFiles = walk(FRONTEND_SRC, [".ts", ".tsx"]);
const frontendSources = frontendFiles.map((p) => ({ file: path.relative(root, p), src: fs.readFileSync(p, "utf8") }));

const migrationFiles = fs.existsSync(MIGRATIONS_DIR)
  ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"))
  : [];
let migrationSrc = null;
for (const f of migrationFiles) {
  const src = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
  if (/CREATE TABLE[\s\S]*?mdata\.vendor_payment_methods/i.test(src)) {
    migrationSrc = src;
    break;
  }
}

const vendorsTsxPath = path.join(FRONTEND_SRC, "pages/Vendors.tsx");
const vendorDetailTsxPath = path.join(FRONTEND_SRC, "pages/VendorDetail.tsx");
const sectionPath = path.join(FRONTEND_SRC, "pages/vendors/VendorPaymentMethodsSection.tsx");
const vendorsTsxSrc = fs.existsSync(vendorsTsxPath) ? fs.readFileSync(vendorsTsxPath, "utf8") : null;
const vendorDetailTsxSrc = fs.existsSync(vendorDetailTsxPath) ? fs.readFileSync(vendorDetailTsxPath, "utf8") : null;
const sectionExists = fs.existsSync(sectionPath);

const problems = collectProblems({ frontendSources, migrationSrc, vendorsTsxSrc, vendorDetailTsxSrc, sectionExists });
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — no notes-text heuristic regression, structured payment-methods UI fully wired, no raw account/routing-number column.`);
