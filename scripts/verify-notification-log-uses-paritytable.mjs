#!/usr/bin/env node
/**
 * verify-notification-log-uses-paritytable — qbo-parity-a1 (NotificationLogPanel surface)
 *
 * Compliance notification log must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns Sent/Credential/Owner Type/Channel/Recipient/Status
 * preserved 1:1; compliance-log-panel testid retained.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-notification-log-uses-paritytable";
const PAGE = "apps/frontend/src/components/compliance/NotificationLogPanel.tsx";

const REQUIRED_LABELS = ["Sent", "Credential", "Owner Type", "Channel", "Recipient", "Status"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  const parityUses = (src.match(/<ParityTable\b/g) ?? []).length;
  if (parityUses < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>, found ${parityUses}`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="compliance-notification-log"')) {
    errors.push(`${PAGE}: must set storageKey="compliance-notification-log"`);
  }
  if (!src.includes("compliance-log-panel")) {
    errors.push(`${PAGE}: must preserve data-testid="compliance-log-panel"`);
  }
  if (!src.includes("No notification log entries.")) {
    errors.push(`${PAGE}: must keep emptyText for empty log`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    const COLUMNS = [
      { key: "sent_at", label: "Sent" },
      { key: "credential_type", label: "Credential" },
      { key: "entity_type", label: "Owner Type" },
      { key: "channel", label: "Channel" },
      { key: "recipient", label: "Recipient" },
      { key: "status", label: "Status" },
    ];
    <div data-testid="compliance-log-panel">
      <ParityTable storageKey="compliance-notification-log" emptyText="No notification log entries." />
    </div>
  `;
  const bad = `
    export function NotificationLogPanel() {
      return (
        <div data-testid="compliance-log-panel">
          <table><thead><tr><th>Sent</th></tr></thead></table>
        </div>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
