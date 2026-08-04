#!/usr/bin/env node
/**
 * GUARD — reclass tooling for fuel→tire/toll bag (step 4). Static only; does not touch Neon.
 * Self-test: node scripts/verify-fuel-miscategorization-reclass-tool.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-miscategorization-reclass-tool";
const SCRIPT = "scripts/ops/reclass-fuel-miscategorized-bank-txns.ts";
const MANIFEST = "scripts/ops/fuel-miscategorization-reclass.manifest.json";

const FUEL = "58c6e304-ab3e-4714-9c35-623ec51ae7cf";
const MAINT = "27c4a09a-0d34-4908-9da1-44b6174b5bce";
const TOLL = "7d795152-0883-41ef-80ee-91de1f97f9bb";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectProblems(sources) {
  const problems = [];
  const { script, manifestRaw } = sources;
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    problems.push(`${MANIFEST}: invalid JSON`);
    return problems;
  }

  if (manifest.from_account_id !== FUEL) {
    problems.push(`${MANIFEST}: from_account_id must be Fuel ${FUEL}`);
  }
  if (!Array.isArray(manifest.items) || manifest.items.length < 10) {
    problems.push(`${MANIFEST}: must pin the Neon-confirmed tire+toll ID list`);
  }
  const sum = (manifest.items ?? []).reduce((s, i) => s + Number(i.amount_cents ?? 0), 0);
  if (sum !== Number(manifest.expected_net_cents)) {
    problems.push(`${MANIFEST}: items sum ${sum} != expected_net_cents ${manifest.expected_net_cents}`);
  }
  const kinds = new Set((manifest.items ?? []).map((i) => i.kind));
  if (!kinds.has("tire") || !kinds.has("toll")) {
    problems.push(`${MANIFEST}: must include tire and toll kinds`);
  }
  for (const item of manifest.items ?? []) {
    if (item.kind === "tire" && item.target_account_id !== MAINT) {
      problems.push(`tire ${item.bank_transaction_id} must target R&M ${MAINT}`);
    }
    if (item.kind === "toll" && item.target_account_id !== TOLL) {
      problems.push(`toll ${item.bank_transaction_id} must target Toll ${TOLL}`);
    }
  }

  if (!/reverseJournalEntryNoFlip/.test(script)) {
    problems.push(`${SCRIPT}: must call reverseJournalEntryNoFlip (no new GL math)`);
  }
  if (!/maybePostBankCategorizationToGl/.test(script)) {
    problems.push(`${SCRIPT}: must call maybePostBankCategorizationToGl (existing poster)`);
  }
  if (!/--dry-run|DRY_RUN|!apply|apply &&/.test(script) && !/mode: apply \? "APPLY" : "DRY_RUN"/.test(script)) {
    problems.push(`${SCRIPT}: must default to dry-run`);
  }
  if (!/i-understand-financial-hold/.test(script)) {
    problems.push(`${SCRIPT}: apply must require --i-understand-financial-hold`);
  }
  if (/Uber|uber/.test(manifestRaw) && !/out of scope/i.test(manifestRaw)) {
    problems.push(`${MANIFEST}: Uber must stay out of scope`);
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = { script: read(SCRIPT), manifestRaw: read(MANIFEST) };
  const broken = {
    script: "console.log('noop')",
    manifestRaw: JSON.stringify({ from_account_id: "x", expected_net_cents: 1, items: [] }),
  };
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken not flagged`);
    process.exit(1);
  }
  if (collectProblems(real).length > 0) {
    console.error(`${LABEL} --selftest FAIL: real flagged`, collectProblems(real));
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems({ script: read(SCRIPT), manifestRaw: read(MANIFEST) });
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}
