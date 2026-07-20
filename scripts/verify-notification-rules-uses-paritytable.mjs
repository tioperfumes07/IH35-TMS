#!/usr/bin/env node
/**
 * verify-notification-rules-uses-paritytable — qbo-parity-a1 (NotificationRulesPanel surface)
 *
 * Compliance notification rules must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Columns Credential/Scope/Days Before/Channels/Recipients
 * (+ Archive action) preserved 1:1; compliance-rules-panel testid retained.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-notification-rules-uses-paritytable";
const PAGE = "apps/frontend/src/components/compliance/NotificationRulesPanel.tsx";

const REQUIRED_LABELS = ["Credential", "Scope", "Days Before", "Channels", "Recipients"];

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
  if (!src.includes('storageKey="compliance-notification-rules"')) {
    errors.push(`${PAGE}: must set storageKey="compliance-notification-rules"`);
  }
  if (!src.includes("compliance-rules-panel")) {
    errors.push(`${PAGE}: must preserve data-testid="compliance-rules-panel"`);
  }
  if (!src.includes("No notification rules.")) {
    errors.push(`${PAGE}: must keep emptyText for empty rules list`);
  }
  if (!src.includes("Archive")) {
    errors.push(`${PAGE}: must preserve Archive action`);
  }
  if (!src.includes("onArchive")) {
    errors.push(`${PAGE}: must keep onArchive wiring`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    const COLUMNS = [
      { key: "credential_type", label: "Credential" },
      { key: "entity_scope", label: "Scope" },
      { key: "notify_days_before", label: "Days Before" },
      { key: "channel", label: "Channels" },
      { key: "recipient_emails", label: "Recipients" },
    ];
    function Panel({ onArchive }) {
      return (
        <div data-testid="compliance-rules-panel">
          <ParityTable storageKey="compliance-notification-rules" emptyText="No notification rules." />
          <button type="button" onClick={() => onArchive("x")}>Archive</button>
        </div>
      );
    }
  `;
  const bad = `
    export function NotificationRulesPanel() {
      return (
        <div data-testid="compliance-rules-panel">
          <table><thead><tr><th>Credential</th></tr></thead></table>
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
