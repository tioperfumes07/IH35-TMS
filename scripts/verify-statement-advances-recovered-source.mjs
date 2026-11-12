#!/usr/bin/env node
/**
 * verify-statement-advances-recovered-source — Codex cert blocker:
 * "Advances recovered" must be advance_recovery / pay-run recoveries only, and must open the
 * source cash advance — never lumped recoveries_cents (admin-fee deductions) nor a settlement
 * self-link MoneyCell.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-statement-advances-recovered-source";

const READOUT = "apps/backend/src/driver-finance/tour-readout.routes.ts";
const LINKED = "apps/frontend/src/pages/driver-finance/components/SettlementStatementLinkedRecordsPanel.tsx";
const TOUR = "apps/frontend/src/components/dispatch/TourSettlementTab.tsx";

function assertReadout(src) {
  const errors = [];
  if (!/advance_recoveries_cents:\s*Math\.round\(advanceRecoveries \* 100\)/.test(src)) {
    errors.push(`${READOUT}: must expose advance_recoveries_cents from advanceRecoveries only`);
  }
  if (!/line_type === ["']advance_recovery["']/.test(src)) {
    errors.push(`${READOUT}: advanceRecoveries must filter line_type === 'advance_recovery'`);
  }
  // recoveries_cents must NOT include deduction or advance_recovery
  const recoveriesAssign = src.match(
    /const recoveries = linesRes\.rows\s*\.filter\(\(l\) => \[([^\]]+)\]\.includes/,
  );
  if (!recoveriesAssign) {
    errors.push(`${READOUT}: expected recoveries filter list after advance split`);
  } else {
    const list = recoveriesAssign[1];
    if (/deduction/.test(list) || /advance_recovery/.test(list)) {
      errors.push(`${READOUT}: recoveries_cents still includes deduction and/or advance_recovery`);
    }
  }
  if (!/recovered_in_settlement_id/.test(src)) {
    errors.push(`${READOUT}: must resolve source advances via recovered_in_settlement_id`);
  }
  return errors;
}

function assertLinked(src) {
  const errors = [];
  if (!/advance_recoveries_cents|advanceRecoveriesCents/.test(src)) {
    errors.push(`${LINKED}: Advances recovered must read advance_recoveries_cents`);
  }
  // The Advances recovered MoneyCell must not self-drill to settlement.
  const advancesBlock = src.slice(src.indexOf('id: "advances"'), src.indexOf('id: "bank"'));
  if (!advancesBlock || advancesBlock.length < 40) {
    errors.push(`${LINKED}: could not locate Advances recovered linked-row block`);
  } else {
    if (/kind:\s*["']settlement["']/.test(advancesBlock)) {
      errors.push(`${LINKED}: Advances recovered still drills to settlement (self-link)`);
    }
    if (!/kind:\s*["']cash_advance["']/.test(advancesBlock)) {
      errors.push(`${LINKED}: Advances recovered must EntityLink/MoneyCell drill to cash_advance`);
    }
    if (/recoveries_cents/.test(advancesBlock)) {
      errors.push(`${LINKED}: Advances recovered block still references recoveries_cents`);
    }
  }
  return errors;
}

function assertTour(src) {
  const errors = [];
  if (!/data-testid="driver-advances-recovered"/.test(src)) {
    errors.push(`${TOUR}: must render Advances recovered row (driver-advances-recovered)`);
  }
  if (!/advance_recoveries_cents/.test(src)) {
    errors.push(`${TOUR}: open-tour net must include advance_recoveries_cents`);
  }
  return errors;
}

function selftest() {
  const badReadout = `
    const recoveries = linesRes.rows.filter((l) => ["deduction", "recovery", "advance_recovery", "fuel_overage", "damage_recovery"].includes(l.line_type)).reduce((t, l) => t + Math.abs(n(l.amount)), 0);
    driver_settlement: { recoveries_cents: Math.round(recoveries * 100) }
  `;
  if (assertReadout(badReadout).length === 0) throw new Error(`${LABEL} selftest: expected bad readout to fail`);

  const goodReadout = `
    const advanceRecoveryLines = linesRes.rows.filter((l) => l.line_type === "advance_recovery");
    let advanceRecoveries = advanceRecoveryLines.reduce((t, l) => t + Math.abs(n(l.amount)), 0);
    const recoveries = linesRes.rows
      .filter((l) => ["recovery", "fuel_overage", "damage_recovery"].includes(l.line_type))
      .reduce((t, l) => t + Math.abs(n(l.amount)), 0);
    SELECT id::text, amount FROM driver_finance.driver_advances
      WHERE operating_company_id = $1::uuid AND recovered_in_settlement_id = $2::uuid
    advance_recoveries_cents: Math.round(advanceRecoveries * 100),
    advance_source_ids: [...advanceSourceIds],
  `;
  const goodReadoutErrs = assertReadout(goodReadout);
  if (goodReadoutErrs.length) throw new Error(`${LABEL} selftest: good readout failed: ${goodReadoutErrs.join("; ")}`);

  const badLinked = `
    { id: "advances", record: L.rowAdvances, link: (
      <MoneyCell cents={recoveriesCents} drill={{ entity: { kind: "settlement", id: settlementId } }} />
    )},
    { id: "bank",
  `;
  if (assertLinked(badLinked).length === 0) throw new Error(`${LABEL} selftest: expected bad linked panel to fail`);

  const goodLinked = `
    { id: "advances", record: L.rowAdvances, link: (
      <MoneyCell cents={advanceRecoveriesCents} drill={{ entity: { kind: "cash_advance", id: advanceSourceIds[0] } }} />
    )},
    { id: "bank",
  `;
  const goodLinkedErrs = assertLinked(goodLinked);
  if (goodLinkedErrs.length) throw new Error(`${LABEL} selftest: good linked failed: ${goodLinkedErrs.join("; ")}`);

  const badTour = `const net = t.is_open ? gross - ds.escrow_cents - ds.recoveries_cents : ds.net_cents;`;
  if (assertTour(badTour).length === 0) throw new Error(`${LABEL} selftest: expected bad tour to fail`);

  const goodTour = `
    const advanceRecoveriesCents = ds.advance_recoveries_cents ?? 0;
    <div data-testid="driver-advances-recovered">Advances recovered</div>
  `;
  const goodTourErrs = assertTour(goodTour);
  if (goodTourErrs.length) throw new Error(`${LABEL} selftest: good tour failed: ${goodTourErrs.join("; ")}`);

  console.log(`${LABEL}: selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = [
    ...assertReadout(fs.readFileSync(path.join(ROOT, READOUT), "utf8")),
    ...assertLinked(fs.readFileSync(path.join(ROOT, LINKED), "utf8")),
    ...assertTour(fs.readFileSync(path.join(ROOT, TOUR), "utf8")),
  ];
  if (errors.length) {
    console.error(`${LABEL}: FAIL`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK`);
}

main();
