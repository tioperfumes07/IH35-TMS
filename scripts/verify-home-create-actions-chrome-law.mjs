#!/usr/bin/env node
/** @matrix-built {"modules":["home"],"cols":["qbo_chrome"],"leafRe":"^surface\\.qbo_style$","task":"HOME-CREATE-ACTIONS-CHROME-LAW-8","vertical":"column-wave"}
 *
 * Fully-Wired item 8 (chrome law): "Primary buttons: + Create / + Book only (never + New / + Add)".
 * QboStyleHomePage.tsx's own CREATE_ACTIONS quick-action buttons (each a standalone clickable
 * <button>, same class as every other standalone create button in the app — Vendors.tsx "+ Create
 * Vendor", Users.tsx "+ Create User", PaymentsListPage.tsx "+ Record Payment") had bare verb labels
 * with no "+ " prefix, and one used the forbidden "Add" verb ("Add bank deposit"). Fixed to match
 * each destination page's own canonical create-button text. This guard locks the fix in.
 */
import fs from "node:fs";
const LABEL = "verify-home-create-actions-chrome-law";
const FILE = "apps/frontend/src/pages/home/QboStyleHomePage.tsx";

function audit(src) {
  const failures = [];
  const match = src.match(/const CREATE_ACTIONS = \[([\s\S]*?)\n\];/);
  if (!match) {
    failures.push("CREATE_ACTIONS array not found");
    return failures;
  }
  const body = match[1];
  const labels = [...body.matchAll(/label:\s*"([^"]*)"/g)].map((m) => m[1]);
  if (labels.length < 6) failures.push(`expected at least 6 CREATE_ACTIONS entries, found ${labels.length}`);
  for (const label of labels) {
    if (!label.startsWith("+ ")) failures.push(`CREATE_ACTIONS label "${label}" is missing the "+ " prefix (chrome law item 8)`);
    if (/\bAdd\b/.test(label) || /\bNew\b/.test(label)) failures.push(`CREATE_ACTIONS label "${label}" uses a forbidden verb (never + New / + Add)`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(FILE, "utf8");
  const mutations = [
    ["strip-prefix", (s) => s.replace('"+ Create Invoice"', '"Create Invoice"')],
    ["forbidden-add", (s) => s.replace('"+ Record Deposit"', '"+ Add Deposit"')],
    ["forbidden-new", (s) => s.replace('"+ Create Bill"', '"+ New Bill"')],
    ["drop-entry", (s) => s.replace('{ label: "+ Create Manual JE", to: "/accounting/journal-entries" },\n', "")],
  ];
  for (const [name, mutate] of mutations) {
    const candidate = mutate(src);
    if (candidate === src || audit(candidate).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(fs.readFileSync(FILE, "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — home's CREATE_ACTIONS quick-buttons all carry the "+ " prefix and no forbidden New/Add verb (chrome law item 8)`);
