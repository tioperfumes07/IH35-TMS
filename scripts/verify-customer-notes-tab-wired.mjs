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

const NOTES_ON_EDIT_RE =
  /<CustomerNotesTab[\s\S]{0,160}?onEdit=\{\(\) => setEditDrawerCustomer\(selectedCustomer\)\}/g;

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
  // LEAD 443.99 class B (2026-10-12) + Codex batch52:
  // Notes mounts under the Notes tab AND Conversations compose. Each CustomerNotesTab must wire
  // onEdit → setEditDrawerCustomer; a single broken consumer must fail (global plant is not enough).
  const notesOnEditWired = (sources.page.match(NOTES_ON_EDIT_RE) ?? []).length;
  if (notesOnEditWired < 2) {
    failures.push(
      `Edit notes must reach the canonical customer editor on every CustomerNotesTab mount (found ${notesOnEditWired})`,
    );
  }
  if (!/<CustomerEditDrawer[\s\S]{0,120}customer=\{editDrawerCustomer\}/.test(sources.page)) {
    failures.push("CustomerEditDrawer must mount with editDrawerCustomer");
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
    ["page", /onEdit=\{\(\) => setEditDrawerCustomer\(selectedCustomer\)\}/g, "onEdit={() => undefined}"],
    ["page", "<CustomerEditDrawer", "<SomethingElse"],
    ["built", '"leafRe": "^md\\\\.notes$"', '"leafRe": ".*"'],
  ];
  for (const [key, from, to] of mutations) {
    const changed = sources[key].replace(from, to);
    if (changed === sources[key]) throw new Error(`selftest setup failed for ${from}`);
    if (collectFailures({ ...sources, [key]: changed }).length === 0) throw new Error(`selftest missed ${from}`);
  }
  // Per-consumer plants (Codex batch52): break Notes-tab mount XOR Conversations mount only.
  const mounts = [...sources.page.matchAll(NOTES_ON_EDIT_RE)];
  if (mounts.length < 2) {
    throw new Error(`selftest setup failed — expected >=2 CustomerNotesTab onEdit mounts, found ${mounts.length}`);
  }
  for (const [idx, m] of mounts.entries()) {
    const broken =
      sources.page.slice(0, m.index) +
      m[0].replace(
        "onEdit={() => setEditDrawerCustomer(selectedCustomer)}",
        "onEdit={() => undefined}",
      ) +
      sources.page.slice(m.index + m[0].length);
    if (collectFailures({ ...sources, page: broken }).length === 0) {
      throw new Error(`selftest missed single-consumer onEdit plant at mount ${idx}`);
    }
  }
  console.log(
    `verify:customer-notes-tab-wired SELFTEST PASS (${mutations.length}/${mutations.length} + ${mounts.length} per-consumer)`,
  );
  process.exit(0);
}
const failures = collectFailures(sources);
if (failures.length) {
  console.error("verify:customer-notes-tab-wired FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("verify:customer-notes-tab-wired PASS — selected customer notes render from the canonical profile");
