#!/usr/bin/env node
/**
 * GUARD: the Acct+Bank remaining-blocks packet must exist in-repo and stay dispatchable.
 *
 * Jorge 2026-07-25: Desktop/Downloads packet is not enough — path must be on main:
 *   docs/trackers/acct-bank-remaining-blocks-2026-07-25/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "docs/trackers/acct-bank-remaining-blocks-2026-07-25");
const LABEL = "verify-acct-bank-remaining-packet";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED = [
  "00-INDEX.md",
  "00-INDEX.json",
  "00-DISPATCH-ORDER.md",
  "00-SCOREBOARD-BLOCKS.md",
  "COMPLIANCE-STANDARD-2026-07-25.md",
  "ACCT-ECON-05-vendor-credits-canonical-qbo-vendors.md",
  "BANK-F08-categorization-rules-automatch-depth.md",
  "BANK-F09-settings-reports-email-queue-deep-wizard.md",
  "BANK-ECON-04-recon-sessions-ops-density.md",
  "BANK-SURF-04-recon-workspace-ops-browser.md",
  "BANK-LINK-01-counterparty-fk-ops-browser.md",
];

function checkPacket(dir) {
  const errors = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    errors.push(
      `missing directory ${path.relative(ROOT, dir)} (Desktop/Downloads copy is not enough — commit the packet)`,
    );
    return errors;
  }
  const names = fs.readdirSync(dir);
  for (const req of REQUIRED) {
    if (!names.includes(req)) errors.push(`missing required file ${req}`);
  }
  const pileMd = names.filter((n) => /^(ACCT-R|BANK-R)-\d+/.test(n) && n.endsWith(".md"));
  if (pileMd.length < 47) {
    errors.push(`expected ≥47 pile block .md files (ACCT-R-* / BANK-R-*), found ${pileMd.length}`);
  }
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(dir, "00-INDEX.json"), "utf8"));
    if (Number(idx.count) !== 47) errors.push(`00-INDEX.json count must be 47, got ${idx.count}`);
    if (!Array.isArray(idx.blocks) || idx.blocks.length !== 47) {
      errors.push(`00-INDEX.json blocks[] must have length 47, got ${idx.blocks?.length}`);
    }
  } catch (e) {
    errors.push(`00-INDEX.json unreadable: ${e.message}`);
  }
  if (names.includes("COMPLIANCE-STANDARD-2026-07-25.md")) {
    const compliance = fs.readFileSync(path.join(dir, "COMPLIANCE-STANDARD-2026-07-25.md"), "utf8");
    if (/\bCPA\b/.test(compliance)) {
      errors.push("COMPLIANCE-STANDARD still contains CPA — OWNER decides (strip CPA language)");
    }
  }
  for (const [file, bad] of [
    ["BANK-ECON-04-recon-sessions-ops-density.md", /HELD,\s*owner Neon-apply|not Neon-applied/i],
    ["BANK-LINK-01-counterparty-fk-ops-browser.md", /HELD,\s*not Neon-applied|not Neon-applied/i],
  ]) {
    if (!names.includes(file)) continue;
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    if (bad.test(text)) errors.push(`${file} must not claim Neon-apply HOLD (mig already applied)`);
  }
  return errors;
}

if (SELFTEST) {
  const tmp = path.join(ROOT, `.tmp-${LABEL}-selftest`);
  fs.rmSync(tmp, { recursive: true, force: true });
  const missing = checkPacket(tmp);
  if (!missing.length) {
    console.error(`${LABEL} selftest FAILED — missing dir should error`);
    process.exit(1);
  }
  fs.mkdirSync(tmp);
  const empty = checkPacket(tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!empty.length) {
    console.error(`${LABEL} selftest FAILED — empty dir should error`);
    process.exit(1);
  }
  const live = checkPacket(DIR);
  if (live.length) {
    console.error(`${LABEL} selftest FAILED — live packet invalid:\n  - ${live.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
  process.exit(0);
}

const errors = checkPacket(DIR);
if (errors.length) {
  console.error(`${LABEL} FAILED —\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${path.relative(ROOT, DIR)} pile≥47 + scoreboard dispatch files`);
