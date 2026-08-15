#!/usr/bin/env node
/**
 * DRV-F3504 — Drivers roster keeps server-bound name search (listDrivers);
 * ParityTable must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/Drivers.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "Drivers.tsx: must use ParityTable");
  assert(/\[search,\s*setSearch\]/.test(src), "Drivers.tsx: must keep server-bound search state");
  assert(/listDrivers\(\{[\s\S]*?search,/.test(src), "Drivers.tsx: must pass search to listDrivers");
  assert(/suppressToolbarSearch/.test(src), "Drivers.tsx: must pass suppressToolbarSearch");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const bad = good.replace(/\n\s*\/\/ DRV-F3504:[^\n]*\n\s*suppressToolbarSearch\n/, "\n");
  assert(!/suppressToolbarSearch/.test(bad), "selftest fixture must remove all suppressToolbarSearch tokens");
  fs.writeFileSync(filePath, bad);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  console.log("verify-drivers-roster-suppress-toolbar-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-drivers-roster-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log(
      "verify-drivers-roster-suppress-toolbar-search PASS — Drivers roster suppresses toolbar search",
    );
  } catch (e) {
    console.error(`verify-drivers-roster-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
