#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const paths = {
  page: "apps/frontend/src/pages/Customers.tsx",
  required: "docs/specs/scoreboard/modules/customers.required.json",
  built: "docs/specs/scoreboard/wire-sprint-built.json",
};
const readSources = () => Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));
const PLACEHOLDER = "Notes will hold free-form customer notes and history";

export function collectFailures(sources) {
  const failures = [];
  for (const [needle, message] of [
    ["function CustomerNotesTab", "missing CustomerNotesTab"],
    ["displayEntityNotes(customer.notes).trim()", "Notes tab does not use canonical sanitized customer.notes"],
    ['data-testid="customer-notes-tab"', "Notes tab lacks stable mounted evidence"],
    ["No notes recorded for this customer.", "Notes tab lacks honest empty state"],
    ["Edit notes", "Notes tab lacks a route to the canonical profile writer"],
    ['activeTab === "notes"', "Notes tab is not mounted"],
  ]) if (!sources.page.includes(needle)) failures.push(message);
  // LEAD 443.99 class B (2026-10-12).
  //   old rule: Edit notes navigates to the full-page editor: navigate(`/customers/${selectedCustomer.id}`).
  //   new rule: the Notes tab's Edit opens the side CustomerEditDrawer for THIS customer
  //             (onEdit={() => setEditDrawerCustomer(selectedCustomer)}), and that drawer is mounted with
  //             customer={editDrawerCustomer} — it saves through the same updateCustomer PATCH.
  //   why: CUR-2 (#20812, cda6f7b4e3) moved customer edit into a QBO-style side drawer; same canonical writer.
  if (!/<CustomerNotesTab\s+customer=\{selectedCustomer\}\s+onEdit=\{\(\) => setEditDrawerCustomer\(selectedCustomer\)\}/.test(sources.page) ||
      !/<CustomerEditDrawer[\s\S]{0,120}customer=\{editDrawerCustomer\}/.test(sources.page)) {
    failures.push("Edit notes does not reach the canonical customer editor");
  }
  if (sources.page.includes(PLACEHOLDER)) failures.push("static Notes placeholder remains");

  let required;
  let built;
  try { required = JSON.parse(sources.required); } catch { failures.push("customers.required.json invalid"); }
  try { built = JSON.parse(sources.built); } catch { failures.push("wire-sprint-built.json invalid"); }
  const leaf = required?.leaves?.find?.((item) => item.id === "md.notes");
  for (const col of ["customer", "connectivity"]) if (!leaf?.required?.includes(col)) failures.push(`md.notes missing Required ${col}`);
  const entry = built?.entries?.find?.((item) => item.task === "CUST-F6311-CUSTOMER-NOTES-REAL-PROFILE-DATA");
  if (entry?.leafRe !== "^md\\.notes$") failures.push("Built evidence does not exact-own md.notes");
  for (const col of ["customer", "connectivity"]) if (!entry?.cols?.includes(col)) failures.push(`Built evidence missing ${col}`);
  return failures;
}

const sources = readSources();
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["page", "displayEntityNotes(customer.notes).trim()", '""'],
    ["page", "No notes recorded for this customer.", "Notes unavailable"],
    ["page", "function CustomerNotesTab", `${PLACEHOLDER}\nfunction CustomerNotesTab`],
    ["page", 'activeTab === "notes"', 'activeTab === "removed_notes"'],
    ["page", /(<CustomerNotesTab\s+customer=\{selectedCustomer\}\s+)onEdit=\{\(\) => setEditDrawerCustomer\(selectedCustomer\)\}/, "$1onEdit={() => undefined}"],
    ["page", "<CustomerEditDrawer", "<SomethingElse"],
    ["built", '"leafRe": "^md\\\\.notes$"', '"leafRe": ".*"'],
  ];
  for (const [key, from, to] of mutations) {
    const changed = sources[key].replace(from, to);
    if (changed === sources[key]) throw new Error(`selftest setup failed for ${from}`);
    if (collectFailures({ ...sources, [key]: changed }).length === 0) throw new Error(`selftest missed ${from}`);
  }
  console.log(`verify:customer-notes-tab-wired SELFTEST PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}
const failures = collectFailures(sources);
if (failures.length) {
  console.error("verify:customer-notes-tab-wired FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("verify:customer-notes-tab-wired PASS — selected customer notes render from the canonical profile");
