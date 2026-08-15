#!/usr/bin/env node
/**
 * LEG-F3472 — LegalContractInstancesPage keeps server-side TableSearch in searchSlot
 * and must pass ParityTable suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkPage(src) {
  assert(src.includes("ParityTable"), "LegalContractInstancesPage: must use ParityTable");
  assert(
    /placeholder=["']Search signer or template code["']/.test(src),
    "LegalContractInstancesPage: must keep server-side Search signer or template code",
  );
  assert(/suppressToolbarSearch/.test(src), "LegalContractInstancesPage: must pass suppressToolbarSearch");
}

function selftest() {
  const full = path.join(ROOT, PAGE);
  const good = fs.readFileSync(full, "utf8");
  checkPage(good);
  const bad = good.replace(/\n\s*suppressToolbarSearch\n/, "\n");
  let failed = false;
  try {
    checkPage(bad);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  console.log("verify-legal-contracts-list-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-legal-contracts-list-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    checkPage(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
    console.log("verify-legal-contracts-list-duplicate-search PASS — LegalContracts suppresses toolbar search");
  } catch (e) {
    console.error(`verify-legal-contracts-list-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
