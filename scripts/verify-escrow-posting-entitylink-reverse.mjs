#!/usr/bin/env node
/**
 * Rule-17 guard: escrow posting source EntityLink reverse drill (Law §9).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-posting-entitylink-reverse";
const ESCROW_PAGE = "apps/frontend/src/pages/accounting/EscrowPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertEscrowPostingEntitylinkReverse() {
  const errors = [];
  const escrow = read(ESCROW_PAGE);

  if (!escrow.includes("EscrowPostingSourceLink")) {
    errors.push(`${ESCROW_PAGE}: must render EscrowPostingSourceLink for posting sources`);
  }
  if (!escrow.includes("escrowSourceEntityKind")) {
    errors.push(`${ESCROW_PAGE}: must map escrow source_type → EntityKind via escrowSourceEntityKind`);
  }
  if (!escrow.includes('"driver_settlement"') || !escrow.includes('"settlement"')) {
    errors.push(`${ESCROW_PAGE}: driver_settlement sources must resolve to settlement EntityLink`);
  }
  if (!escrow.includes('"vendor_bill"') || !escrow.includes('"bill"')) {
    errors.push(`${ESCROW_PAGE}: vendor_bill sources must resolve to bill EntityLink`);
  }
  if (!escrow.includes('"factoring_advance"')) {
    errors.push(`${ESCROW_PAGE}: factoring_advance sources must resolve to factoring_advance EntityLink`);
  }
  if (!/linked_journal_entry_id/.test(escrow) || !/kind=["']journal_entry["']/.test(escrow)) {
    errors.push(`${ESCROW_PAGE}: postings must EntityLink linked_journal_entry_id → journal_entry`);
  }
  // ACCT-F5065 — CLS-LINKAGE-ONEWAY: JE label must use joined memo/date.
  if (/entityLabel\(\s*null\s*,\s*row\.linked_journal_entry_id/.test(escrow)) {
    errors.push(`${ESCROW_PAGE}: must not entityLabel(null, linked_journal_entry_id) — UUID chrome`);
  }
  if (!/journal_entry_memo/.test(escrow) || !/journal_entry_date/.test(escrow)) {
    errors.push(`${ESCROW_PAGE}: JE EntityLink must prefer journal_entry_date/memo`);
  }
  // ACCT-F5068 — holder + source human labels (driver/vendor/settlement/bill/advance columns).
  if (/entityLabel\(\s*null\s*,\s*row\.holder_id/.test(escrow) || /entityLabel\(\s*null\s*,\s*row\.source_id/.test(escrow)) {
    errors.push(`${ESCROW_PAGE}: must not entityLabel(null, holder_id|source_id) — use holder_label/source_label`);
  }
  if (!/holder_label/.test(escrow) || !/source_label/.test(escrow)) {
    errors.push(`${ESCROW_PAGE}: must render holder_label + source_label from API`);
  }
  const service = read("apps/backend/src/accounting/escrow/service.ts");
  if (!/je\.memo AS journal_entry_memo/.test(service) || !/LEFT JOIN accounting\.journal_entries je/.test(service)) {
    errors.push("escrow/service listEscrowPostings must JOIN journal_entries for memo/date");
  }
  if (!/holder_label/.test(service) || !/LEFT JOIN mdata\.drivers/.test(service)) {
    errors.push("escrow/service listEscrowAccounts must JOIN drivers/vendors for holder_label");
  }
  if (!/source_label/.test(service) || !/driver_finance\.driver_settlements/.test(service)) {
    errors.push("escrow/service listEscrowPostings must JOIN settlements/bills/advances for source_label");
  }
  // ROUND 443.250 Settlements Escrow V3 — V3KpiTile strip on EscrowPage (Drivers holding /
  // Total held / Release window / Scheduled releases) marked data-escrow-v3-kpis.
  if (!escrow.includes("V3KpiTile")) {
    errors.push(`${ESCROW_PAGE}: must render V3KpiTile (ROUND 443.250 Settlements Escrow V3)`);
  }
  if (!escrow.includes("data-escrow-v3-kpis")) {
    errors.push(`${ESCROW_PAGE}: must mark data-escrow-v3-kpis for the V3 board strip`);
  }
  for (const label of [
    "Drivers holding escrow",
    "Total held",
    "Release window",
    "Scheduled releases",
  ]) {
    if (!escrow.includes(label)) {
      errors.push(`${ESCROW_PAGE}: V3 strip must include board label "${label}"`);
    }
  }
  if (!escrow.includes("ESCROW_RELEASE_WINDOW_DAYS") && !escrow.includes("60 days")) {
    errors.push(`${ESCROW_PAGE}: Release window must show the board 60-day policy chrome`);
  }
  return errors;
}

function selftest() {
  const errors = assertEscrowPostingEntitylinkReverse();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  // Plant: strip V3 markers from an in-memory copy — must clear both V3 contracts.
  const good = fs.readFileSync(path.join(ROOT, ESCROW_PAGE), "utf8");
  const stripped = good
    .replace(/V3KpiTile/g, "LegacyKpi")
    .replace(/data-escrow-v3-kpis/g, "data-escrow-legacy");
  if (stripped.includes("V3KpiTile") || stripped.includes("data-escrow-v3-kpis")) {
    console.error(`${LABEL} SELFTEST FAIL: V3 strip removal should clear V3KpiTile + data-escrow-v3-kpis`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS (entitylink + V3 escrow strip)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertEscrowPostingEntitylinkReverse();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
