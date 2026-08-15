#!/usr/bin/env node
/**
 * LEG-F3470 — LegalTemplatesListPage keeps server-side TableSearch in searchSlot
 * and must pass ParityTable suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkPage(src) {
  assert(src.includes("ParityTable"), "LegalTemplatesListPage: must use ParityTable");
  assert(
    /placeholder=["']Search code or display name["']/.test(src),
    "LegalTemplatesListPage: must keep server-side Search code or display name",
  );
  assert(/suppressToolbarSearch/.test(src), "LegalTemplatesListPage: must pass suppressToolbarSearch");
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
  console.log("verify-legal-templates-list-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-legal-templates-list-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    checkPage(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
    console.log("verify-legal-templates-list-duplicate-search PASS — LegalTemplates suppresses toolbar search");
  } catch (e) {
    console.error(`verify-legal-templates-list-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
