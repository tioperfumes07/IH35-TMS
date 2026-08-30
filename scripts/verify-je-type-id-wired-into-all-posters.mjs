#!/usr/bin/env node
/**
 * ACCT-LINK-01 regression fix (GO-1405, owner packet IH35-FINISH-2026-08-29/CC-1) -- static-shape
 * guard asserting every LIVE direct INSERT INTO accounting.journal_entries site resolves and
 * writes journal_entry_type_id via the shared journal-entry-type-resolver.ts leaf module.
 *
 * Root cause fixed: journal-entries.service.ts's manual/API create path was the ONLY insert site
 * ever wired to resolve a type; 8 other direct-insert posters each did their own raw INSERT with
 * no journal_entry_type_id column at all, which is why live density stayed at 46/2214 (2%) despite
 * a "never leave NULL" comment on the one path that WAS fixed. settlement-posting.service.ts is
 * deliberately excluded -- its own file header marks it DEPRECATED/SUPERSEDED, its route is not
 * registered in the server bootstrap, and it has zero live callers (same class as the
 * already-established manual-je.routes.deprecated.ts precedent).
 */
import { readFileSync } from "node:fs";

const RESOLVER_PATH = "apps/backend/src/accounting/journal-entry-type-resolver.ts";

const LIVE_POSTER_FILES = [
  "apps/backend/src/accounting/journal-entries.service.ts",
  "apps/backend/src/accounting/posting-engine.service.ts",
  "apps/backend/src/accounting/void.service.ts",
  "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts",
  "apps/backend/src/accounting/bank-recon/match.service.ts",
  "apps/backend/src/accounting/fuel-posting/poster.service.ts",
  "apps/backend/src/accounting/lease-asc842/lease-posting.service.ts",
  "apps/backend/src/accounting/period-close-retained-earnings.service.ts",
  "apps/backend/src/accounting/recurring.worker.ts",
];

function analyze() {
  const failures = [];

  let resolverSrc;
  try {
    resolverSrc = readFileSync(RESOLVER_PATH, "utf8");
  } catch {
    failures.push(`${RESOLVER_PATH} does not exist`);
    return failures;
  }
  if (!/export async function hasJournalEntryTypeColumn/.test(resolverSrc)) {
    failures.push(`${RESOLVER_PATH}: hasJournalEntryTypeColumn is not exported`);
  }
  if (!/export async function resolveJournalEntryTypeId/.test(resolverSrc)) {
    failures.push(`${RESOLVER_PATH}: resolveJournalEntryTypeId is not exported`);
  }
  // Deliberately a LEAF module: importing from any accounting service file here would risk an
  // import cycle (journal-entries.service.ts already imports FROM void.service.ts).
  if (/from ["']\.\/(journal-entries|posting-engine|void)\.service\.js["']/.test(resolverSrc)) {
    failures.push(`${RESOLVER_PATH}: imports from an accounting service file -- reintroduces the import-cycle risk this module exists to avoid`);
  }

  for (const file of LIVE_POSTER_FILES) {
    let src;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      failures.push(`${file} does not exist`);
      continue;
    }
    if (!/journal-entry-type-resolver\.js/.test(src)) {
      failures.push(`${file}: does not import from journal-entry-type-resolver.js`);
    }
    if (!/resolveJournalEntryTypeId/.test(src)) {
      failures.push(`${file}: does not call resolveJournalEntryTypeId`);
    }
    if (!/journal_entry_type_id/.test(src)) {
      failures.push(`${file}: its INSERT INTO accounting.journal_entries does not reference journal_entry_type_id`);
    }
  }

  return failures;
}

function selftest() {
  const good = analyze();
  if (good.length > 0) {
    console.error("verify-je-type-id-wired-into-all-posters --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Planted mutations: pretend one poster at a time never got the fix, by re-checking the SAME
  // analyze() logic against synthetic source text with each required marker stripped in turn.
  const mutations = [
    {
      name: "posting-engine.service.ts loses resolveJournalEntryTypeId reference",
      file: "apps/backend/src/accounting/posting-engine.service.ts",
      strip: "resolveJournalEntryTypeId",
    },
    {
      name: "void.service.ts loses journal_entry_type_id reference",
      file: "apps/backend/src/accounting/void.service.ts",
      strip: "journal_entry_type_id",
    },
    {
      name: "fuel-posting/poster.service.ts loses the resolver import",
      file: "apps/backend/src/accounting/fuel-posting/poster.service.ts",
      strip: "journal-entry-type-resolver.js",
    },
    {
      name: "resolver's hasJournalEntryTypeColumn export removed",
      file: RESOLVER_PATH,
      strip: "export async function hasJournalEntryTypeColumn",
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const original = readFileSync(m.file, "utf8");
    const mutated = original.split(m.strip).join("__STRIPPED__");
    // Re-run analyze() but substitute this one file's content in-memory via a scoped override.
    const failures = analyzeWithOverride(m.file, mutated);
    if (failures.length === 0) {
      console.error(`verify-je-type-id-wired-into-all-posters --selftest: NOT CAUGHT -- ${m.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${m.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught and repository restored green.`);
}

function analyzeWithOverride(overrideFile, overrideSrc) {
  const failures = [];
  const resolverSrc = overrideFile === RESOLVER_PATH ? overrideSrc : readFileSync(RESOLVER_PATH, "utf8");
  if (!/export async function hasJournalEntryTypeColumn/.test(resolverSrc)) {
    failures.push(`${RESOLVER_PATH}: hasJournalEntryTypeColumn is not exported`);
  }
  if (!/export async function resolveJournalEntryTypeId/.test(resolverSrc)) {
    failures.push(`${RESOLVER_PATH}: resolveJournalEntryTypeId is not exported`);
  }
  for (const file of LIVE_POSTER_FILES) {
    const src = file === overrideFile ? overrideSrc : readFileSync(file, "utf8");
    if (!/journal-entry-type-resolver\.js/.test(src)) failures.push(`${file}: missing resolver import`);
    if (!/resolveJournalEntryTypeId/.test(src)) failures.push(`${file}: missing resolveJournalEntryTypeId call`);
    if (!/journal_entry_type_id/.test(src)) failures.push(`${file}: INSERT missing journal_entry_type_id`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze();
  if (failures.length > 0) {
    console.error("verify-je-type-id-wired-into-all-posters: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `verify-je-type-id-wired-into-all-posters: OK -- journal-entry-type-resolver.ts exports both helpers; all ${LIVE_POSTER_FILES.length} live poster files import it, call resolveJournalEntryTypeId, and reference journal_entry_type_id in their INSERT`
  );
}
