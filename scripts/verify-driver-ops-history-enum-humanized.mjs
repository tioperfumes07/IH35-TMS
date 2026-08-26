#!/usr/bin/env node
/**
 * GUARD — verify-driver-ops-history-enum-humanized
 *
 * DRIVER-OPS-HISTORY-ENUM-RAW-DISPLAY: OperationsHistoryTable.tsx is the shared render path for
 * all 12 driver operations-depth sub-views; its `formatCell` fallback is a bare `String(value)`
 * by necessity (free text, dates, ids — humanizing everything would mangle non-enum columns).
 * Three sub-views feed it real checked/constrained enum columns without ever opting into
 * humanizeEnumLabel(): SafetyEventsView's event_type (safety.harsh_events.event_kind, CHECK-
 * constrained to harsh_brake/harsh_accel/harsh_turn/speeding/mobile_use/distracted/rolling_stop/
 * no_seatbelt per db/migrations/0231) and severity, CommunicationsLogView's channel
 * (mdata.driver_profile_messages.channel, CHECK-constrained to sms/email/in_app per
 * db/migrations/0302), and PwaEngagementView's response (dispatch.auto_status_suggestion_
 * responses.response, CHECK-constrained to confirmed/overridden/dismissed/expired per
 * db/migrations/0230). An operator would see the literal "harsh_brake"/"in_app" printed on
 * screen.
 *
 * METHOD: static source-text assertions on OperationsHistoryTable.tsx (the enumLabel opt-in
 * mechanism) and the three consumer view files (that they actually set it on the right columns).
 * --selftest mutates each REAL file and requires the offender to be caught.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-driver-ops-history-enum-humanized";
const TABLE = "apps/frontend/src/components/drivers/OperationsHistoryTable.tsx";
const SAFETY = "apps/frontend/src/pages/drivers/operations/SafetyEventsView.tsx";
const COMMS = "apps/frontend/src/pages/drivers/operations/CommunicationsLogView.tsx";
const PWA = "apps/frontend/src/pages/drivers/operations/PwaEngagementView.tsx";

export function check(tableText, safetyText, commsText, pwaText) {
  const problems = [];

  if (!/import \{ humanizeEnumLabel \} from "..\/..\/lib\/humanizeEnumLabel"/.test(tableText)) {
    problems.push(`${TABLE}: does not import humanizeEnumLabel.`);
  }
  if (!/enumLabel\?: boolean/.test(tableText)) {
    problems.push(`${TABLE}: OperationsColumn no longer declares an enumLabel opt-in field.`);
  }
  if (!/if \(column\.enumLabel\) \{/.test(tableText) || !/return humanizeEnumLabel\(value\);/.test(tableText)) {
    problems.push(`${TABLE}: renderCell no longer routes enumLabel columns through humanizeEnumLabel.`);
  }

  if (!/\{ key: "event_type", label: "Type", enumLabel: true \}/.test(safetyText)) {
    problems.push(`${SAFETY}: event_type column is not opted into enumLabel.`);
  }
  if (!/\{ key: "severity", label: "Severity", enumLabel: true \}/.test(safetyText)) {
    problems.push(`${SAFETY}: severity column is not opted into enumLabel.`);
  }

  if (!/\{ key: "channel", label: "Channel", enumLabel: true \}/.test(commsText)) {
    problems.push(`${COMMS}: channel column is not opted into enumLabel.`);
  }

  if (!/\{ key: "response", label: "Response", enumLabel: true \}/.test(pwaText)) {
    problems.push(`${PWA}: response column is not opted into enumLabel.`);
  }

  return problems;
}

function run() {
  const tableText = readFileSync(TABLE, "utf8");
  const safetyText = readFileSync(SAFETY, "utf8");
  const commsText = readFileSync(COMMS, "utf8");
  const pwaText = readFileSync(PWA, "utf8");
  const problems = check(tableText, safetyText, commsText, pwaText);
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — event_type/severity/channel/response render through humanizeEnumLabel; other operations-depth columns untouched.`);
}

function selftest() {
  const tableReal = readFileSync(TABLE, "utf8");
  const safetyReal = readFileSync(SAFETY, "utf8");
  const commsReal = readFileSync(COMMS, "utf8");
  const pwaReal = readFileSync(PWA, "utf8");
  const failures = [];

  const baseline = check(tableReal, safetyReal, commsReal, pwaReal);
  if (baseline.length) failures.push(`baseline (real fixed files) should pass, got: ${baseline.join(" | ")}`);

  // Offender 1: remove the humanizeEnumLabel import.
  const t1 = tableReal.replace('import { humanizeEnumLabel } from "../../lib/humanizeEnumLabel";\n', "");
  const p1 = check(t1, safetyReal, commsReal, pwaReal);
  if (!p1.some((m) => m.includes("does not import humanizeEnumLabel"))) {
    failures.push(`offender-1 (missing import) NOT caught: ${p1.join(" | ") || "none"}`);
  }

  // Offender 2: remove the enumLabel branch from renderCell (reverts to always formatCell).
  const t2 = tableReal.replace(
    'if (column.enumLabel) {\n    const value = row[column.key];\n    if (value === null || value === undefined || value === "") return "—";\n    return humanizeEnumLabel(value);\n  }\n  ',
    ""
  );
  if (t2 === tableReal) failures.push("offender-2 mutation did not change the file — guard's own needle may be stale.");
  const p2 = check(t2, safetyReal, commsReal, pwaReal);
  if (!p2.some((m) => m.includes("no longer routes enumLabel columns"))) {
    failures.push(`offender-2 (renderCell branch removed) NOT caught: ${p2.join(" | ") || "none"}`);
  }

  // Offender 3: SafetyEventsView reverts event_type to not opted in.
  const s1 = safetyReal.replace('{ key: "event_type", label: "Type", enumLabel: true }', '{ key: "event_type", label: "Type" }');
  const p3 = check(tableReal, s1, commsReal, pwaReal);
  if (!p3.some((m) => m.includes("event_type column is not opted"))) {
    failures.push(`offender-3 (event_type reverted) NOT caught: ${p3.join(" | ") || "none"}`);
  }

  // Offender 4: CommunicationsLogView reverts channel.
  const c1 = commsReal.replace('{ key: "channel", label: "Channel", enumLabel: true }', '{ key: "channel", label: "Channel" }');
  const p4 = check(tableReal, safetyReal, c1, pwaReal);
  if (!p4.some((m) => m.includes("channel column is not opted"))) {
    failures.push(`offender-4 (channel reverted) NOT caught: ${p4.join(" | ") || "none"}`);
  }

  // Offender 5: PwaEngagementView reverts response.
  const w1 = pwaReal.replace('{ key: "response", label: "Response", enumLabel: true }', '{ key: "response", label: "Response" }');
  const p5 = check(tableReal, safetyReal, commsReal, w1);
  if (!p5.some((m) => m.includes("response column is not opted"))) {
    failures.push(`offender-5 (response reverted) NOT caught: ${p5.join(" | ") || "none"}`);
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 5/5 offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
