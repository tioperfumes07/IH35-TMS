#!/usr/bin/env node
/**
 * verify-driver-score-detail-uses-paritytable — qbo-parity-a1 (DriverScoreDetail surface)
 *
 * Safety driver-score detail 12-period breakdown grid must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Trend query failures must surface
 * ListErrorState (never a silent empty chart/table). Columns Period/Score/Rank/Brakes/Accel/
 * Speeding (s)/Lane preserved; sparkline + latest stats + harsh-event timeline unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-score-detail-uses-paritytable";
const PAGE = "apps/frontend/src/pages/safety/driver-scoring/DriverScoreDetail.tsx";

const REQUIRED_LABELS = ["Period", "Score", "Rank", "Brakes", "Accel", "Speeding (s)", "Lane"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on trend query failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
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
  if (!src.includes('storageKey="safety-driver-score-detail-periods"')) {
    errors.push(`${PAGE}: must set storageKey="safety-driver-score-detail-periods"`);
  }
  if (!src.includes('tableTestId="driver-score-detail-periods-table"')) {
    errors.push(`${PAGE}: must set tableTestId="driver-score-detail-periods-table"`);
  }
  if (!src.includes("No historical periods stored for this driver.")) {
    errors.push(`${PAGE}: must keep emptyText for empty period history`);
  }
  if (!src.includes("Couldn't load driver score history")) {
    errors.push(`${PAGE}: must keep ListErrorState title for trend outage`);
  }
  if (!src.includes("TrendChart")) {
    errors.push(`${PAGE}: must keep TrendChart sparkline`);
  }
  if (!src.includes("12-period composite safety trend")) {
    errors.push(`${PAGE}: must keep 12-period composite safety trend heading`);
  }
  if (!src.includes("Harsh Event Timeline")) {
    errors.push(`${PAGE}: must keep Harsh Event Timeline section`);
  }
  if (!src.includes("View dashcam")) {
    errors.push(`${PAGE}: must keep dashcam drill-through action`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    function TrendChart() { return null; }
    <p>12-period composite safety trend</p>
    <TrendChart periods={periods} />
    <ListErrorState title="Couldn't load driver score history" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="safety-driver-score-detail-periods"
      tableTestId="driver-score-detail-periods-table"
      emptyText="No historical periods stored for this driver."
      columns={[
        { key: "period", label: "Period" },
        { key: "composite_score", label: "Score" },
        { key: "rank_in_fleet", label: "Rank" },
        { key: "harsh_brake_count", label: "Brakes" },
        { key: "hard_accel_count", label: "Accel" },
        { key: "speeding_seconds", label: "Speeding (s)" },
        { key: "lane_departure_count", label: "Lane" },
      ]}
    />
    <h5>Harsh Event Timeline</h5>
    <button>View dashcam</button>
  `;
  const bad = `
    export function DriverScoreDetail() {
      return (
        <div>
          <table><thead><tr><th>Period</th></tr></thead></table>
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
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + timeline preserved.`);
}

main();
