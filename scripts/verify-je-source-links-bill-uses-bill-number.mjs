#!/usr/bin/env node
/**
 * JE-SOURCE-LINKS-BILL-USES-WRONG-COLUMN — the JE source-link resolver
 * (journal-entries.service.ts) labeled bill-sourced journal entries from `accounting.bills.display_id`
 * alone, but that column is near-dead (12 of 16,298 rows populated live, 0.07%) — the real bill
 * identity is `bill_number` (15,750 of 16,298, 96.6%), the same convention every other bill-label
 * call site in this repo already uses. Reading display_id alone meant this resolver tombstoned
 * "Source — not visible" for essentially every bill-sourced JE, even though the href it builds from
 * source_transaction_id was already correct — a label bug, not a linkage bug.
 *
 * FAIL: either COALESCE reads `src_bill.display_id`/`link_bill.display_id` WITHOUT a `.bill_number`
 * fallback in the same expression (display_id-only).
 * PASS: both COALESCE expressions fall back to `.bill_number`.
 *
 * Self-test: node scripts/verify-je-source-links-bill-uses-bill-number.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-je-source-links-bill-uses-bill-number";
const FILE = "apps/backend/src/accounting/journal-entries.service.ts";

function failures(sources) {
  const out = [];
  const text = sources[FILE];

  const srcMatch = text.match(/COALESCE\(src_inv\.display_id,\s*src_bill\.display_id(,\s*src_bill\.bill_number)?[^)]*\)/);
  if (!srcMatch) {
    out.push(`${FILE}: source_transaction_display_id COALESCE expression not found — re-check this guard`);
  } else if (!srcMatch[1]) {
    out.push(`${FILE}: source_transaction_display_id reads src_bill.display_id with no src_bill.bill_number fallback — display_id is 0.07% populated live, this tombstones almost every bill-sourced JE label`);
  }

  const linkMatch = text.match(/COALESCE\(link_inv\.display_id,\s*link_bill\.display_id(,\s*link_bill\.bill_number)?\)/);
  if (!linkMatch) {
    out.push(`${FILE}: linked_object_display_id COALESCE expression not found — re-check this guard`);
  } else if (!linkMatch[1]) {
    out.push(`${FILE}: linked_object_display_id reads link_bill.display_id with no link_bill.bill_number fallback — same defect on the reverse-link side`);
  }

  return out;
}

const live = { [FILE]: fs.readFileSync(FILE, "utf8") };

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    {
      name: "source_transaction_display_id reverted to display_id-only",
      file: FILE,
      mutate: (text) =>
        text.replace(
          /COALESCE\(src_inv\.display_id, src_bill\.display_id, src_bill\.bill_number, ([^)]+)\)/,
          "COALESCE(src_inv.display_id, src_bill.display_id, $1)"
        ),
    },
    {
      name: "linked_object_display_id reverted to display_id-only",
      file: FILE,
      mutate: (text) =>
        text.replace(
          "COALESCE(link_inv.display_id, link_bill.display_id, link_bill.bill_number)",
          "COALESCE(link_inv.display_id, link_bill.display_id)"
        ),
    },
  ];
  const escaped = [];
  for (const { name, file, mutate } of mutations) {
    const mutated = mutate(live[file]);
    if (mutated === live[file]) {
      escaped.push(`${name}: mutation anchor missing`);
      continue;
    }
    const mutant = { ...live, [file]: mutated };
    if (failures(mutant).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(live);
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — JE source-link labels fall back to bill_number for bill-sourced entries (display_id alone is 0.07% populated live)`);
