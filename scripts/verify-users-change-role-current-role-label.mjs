#!/usr/bin/env node
/**
 * verify-users-change-role-current-role-label.mjs  (USERS-F1)
 *
 * Root cause: /users' "Change Role" modal's "Current role:" line rendered the raw internal role
 * enum (`roleModalUser?.role`, e.g. "Accountant") directly, instead of going through the same
 * ROLE_LABEL[] human-readable mapping every other role display in this file uses (the Users table's
 * own Role column, the roleComboboxOptions/roleChangeComboboxOptions dropdown option labels, the
 * EntityLink label builder). Live-reproduced 2026-08-23: the Users table showed Angel Olvera's role
 * as "Accounting" (the mapped label); opening "Change Role" on that same row showed
 * "Current role: Accountant" (the raw unmapped enum) -- an admin comparing the table row to the
 * modal it opened would see two different labels for the identical underlying value, on the same
 * page, one click apart. Not a 500/silent-no-op, but a genuine label-consistency defect worth fixing
 * given how directly the mismatch sits in front of the user performing the action.
 *
 * This guard makes the regression impossible to re-ship: the "Current role:" line must read through
 * ROLE_LABEL[], not the bare `.role` field.
 *
 * Usage:
 *   node scripts/verify-users-change-role-current-role-label.mjs            # scan
 *   node scripts/verify-users-change-role-current-role-label.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const USERS_FILE = "apps/frontend/src/pages/Users.tsx";

const CURRENT_ROLE_LINE = /Current role:[\s\S]{0,120}?roleModalUser/;
const RAW_UNMAPPED = /Current role:\s*\{roleModalUser\?\.role\s*\?\?/;

export function checkCurrentRoleUsesLabel(src) {
  const offenders = [];
  const match = CURRENT_ROLE_LINE.exec(src);
  if (!match) {
    offenders.push(`${USERS_FILE}: "Current role:" line not found near roleModalUser — has the Change Role modal moved or been rewritten? Re-verify this guard still applies.`);
    return offenders;
  }
  if (RAW_UNMAPPED.test(src)) {
    offenders.push(
      `${USERS_FILE}: "Current role:" renders the raw roleModalUser.role enum directly instead of through ROLE_LABEL[] — USERS-F1 regression shape (table shows the mapped label, e.g. "Accounting", while this modal shows the raw enum, e.g. "Accountant", for the identical value)`
    );
  }
  if (!/Current role:[\s\S]{0,200}?ROLE_LABEL\[roleModalUser/.test(src)) {
    offenders.push(
      `${USERS_FILE}: "Current role:" does not appear to read through ROLE_LABEL[roleModalUser...] — confirm the fix shape is intact`
    );
  }
  return offenders;
}

export function run() {
  const abs = path.join(repoRoot, USERS_FILE);
  const src = fs.readFileSync(abs, "utf8");
  const offenders = checkCurrentRoleUsesLabel(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    <div className="text-sm text-gray-600">Current role: {roleModalUser?.role ?? "—"}</div>
  `;
  const fixed = `
    <div className="text-sm text-gray-600">
      Current role:{" "}
      {roleModalUser?.role
        ? (ROLE_LABEL[roleModalUser.role as UserRole] ?? roleModalUser.role)
        : "—"}
    </div>
  `;

  const buggyFails = checkCurrentRoleUsesLabel(buggy).length > 0;
  const fixedPasses = checkCurrentRoleUsesLabel(fixed).length === 0;

  if (buggyFails && fixedPasses) {
    console.log("verify:users-change-role-current-role-label selftest OK");
    process.exit(0);
  }
  console.error("verify:users-change-role-current-role-label selftest FAILED", { buggyFails, fixedPasses });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:users-change-role-current-role-label FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:users-change-role-current-role-label OK — Change Role modal's Current-role line reads through ROLE_LABEL[], matching the table's own display");
}
