#!/usr/bin/env node
/**
 * BUS-SINGLE-CHANNEL — fail if READ-AGENT-BUS or INBOX-SYNC-LAW reintroduces Desktop-only dual bus.
 * No Desktop filesystem required (CI).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const syncLaw = read("docs/bus/INBOX-SYNC-LAW.md");
const agentBus = read("READ-AGENT-BUS.md");
const startHere = read("docs/bus/00-CODER-START-HERE.md");

const errors = [];

if (!/SINGLE CHANNEL/i.test(syncLaw) || !/docs\/bus\//.test(syncLaw)) {
  errors.push("docs/bus/INBOX-SYNC-LAW.md must declare SINGLE CHANNEL + docs/bus/");
}
if (/NOT in this git repo/i.test(agentBus)) {
  errors.push("READ-AGENT-BUS.md must not say bus is outside git");
}
if (!/docs\/bus\//.test(agentBus) || !/SINGLE CHANNEL/i.test(agentBus)) {
  errors.push("READ-AGENT-BUS.md must point to docs/bus/ as SINGLE CHANNEL");
}
if (!/docs\/bus\//.test(startHere)) {
  errors.push("docs/bus/00-CODER-START-HERE.md must name docs/bus/");
}

const required = [
  "docs/bus/STATUS-NOW.md",
  "docs/bus/INBOX-CASCADE.md",
  "docs/bus/INBOX-CC-1.md",
  "docs/bus/INBOX-CODEX.md",
  "docs/bus/INBOX-CURSOR.md",
  "docs/bus/OUTBOX-CASCADE.md",
  "docs/bus/OUTBOX-CC-1.md",
  "docs/bus/OUTBOX-CODEX.md",
  "docs/bus/OUTBOX-CURSOR.md",
  "scripts/ops/bus-symlink-desktop.sh",
];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) errors.push(`missing ${rel}`);
}

if (process.argv.includes("--selftest")) {
  // Mutation: pretend READ-AGENT-BUS lost the channel — detect via string checks on fixtures in-memory
  const bad = "NOT in this git repo\nCanonical bus folder (absolute):\n/Desktop/only";
  if (!/NOT in this git repo/i.test(bad)) {
    console.error("selftest FAIL: detector broken");
    process.exit(1);
  }
  console.log("verify-bus-single-channel --selftest PASS");
  process.exit(0);
}

if (errors.length) {
  console.error("verify-bus-single-channel FAIL:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("verify-bus-single-channel PASS — docs/bus is sole channel");
