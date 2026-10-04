#!/usr/bin/env node
/**
 * F425C-PROFILES-BANK-ACCOUNTS-NO-REMOVE — Profiles & Defaults Bank Accounts gained a + Create
 * control (F425C-PROFILES-BANK-CREATE-DEAD) but rows could then only be blanked, never removed.
 * A user who clicks + Create too many times, or fat-fingers a duplicate, has no way to delete the
 * row — it persists in the saved profile forever.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-profiles-bank-accounts-remove";
const PAGE = "apps/frontend/src/pages/form425c/tabs/ProfilesTab.tsx";

export function collectProblems(src) {
  const problems = [];
  if (!src.includes("bankAccounts: [...draft.bankAccounts, { id: \"\", label: \"\", number: \"\" }]")) {
    problems.push(`${PAGE}: Bank Accounts must still + Create a new row (F425C-PROFILES-BANK-CREATE-DEAD regression)`);
  }
  if (!src.includes("bankAccounts.filter((_, i) => i !== idx)")) {
    problems.push(`${PAGE}: Bank Accounts rows must have a real Remove control — a created row must not be permanent`);
  }
  if (!src.includes('aria-label={`Remove bank account')) {
    problems.push(`${PAGE}: Remove button must be labeled per-row, not an unlabeled icon`);
  }
  // BANK-F91375 leftover refuse — ProfilesTab page-scoped text token ratchet
  if (src.includes("text-[11px]")) problems.push("ProfilesTab.tsx: leftover text-[11px]");
  if (src.includes("#8A92AB")) problems.push("ProfilesTab.tsx: leftover off-scale muted #8A92AB");
  return problems;
}

const good = `
  bankAccounts: [...draft.bankAccounts, { id: "", label: "", number: "" }],
  bankAccounts: draft.bankAccounts.filter((_, i) => i !== idx),
  aria-label={\`Remove bank account \${account.label || account.id || idx + 1}\`}
`;
const bad = `
  bankAccounts: [...draft.bankAccounts, { id: "", label: "", number: "" }],
`;

if (process.argv.includes("--selftest")) {
  if (collectProblems(good).length) {
    console.error(`${LABEL} --selftest FAIL good`);
    process.exit(1);
  }
  if (collectProblems(bad).length < 2) {
    console.error(`${LABEL} --selftest FAIL bad too weak`);
    process.exit(1);
  }
  // BANK-F91375 leftover plant — ProfilesTab page-scoped text token ratchet
  const leftover =
    fs.readFileSync(path.join(ROOT, PAGE), "utf8") +
    '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n';
  const leftoverProblems = collectProblems(leftover);
  if (!leftoverProblems.some((p) => p.includes("leftover text-[11px]"))) {
    console.error(`${LABEL} --selftest FAIL leftover plant escaped`, leftoverProblems);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Bank Accounts rows can be created and removed, not just blanked`);
process.exit(0);
