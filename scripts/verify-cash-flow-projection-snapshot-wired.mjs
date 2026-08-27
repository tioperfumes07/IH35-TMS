#!/usr/bin/env node
/**
 * CASH-FLOW-ACTUAL-VS-PROJECTED-INCOME-STRUCTURALLY-ALWAYS-ZERO
 *
 * getActualVsProjected()'s "projected income" for a PAST date was recomputed LIVE at request
 * time, so any load that delivered/invoiced/paid — exactly what real revenue does — permanently
 * zeroed its own historical day's projected figure. Fix: a daily append-only snapshot
 * (forecast.cash_flow_projection_snapshots), captured each morning by a cron before that day's
 * loads can complete their lifecycle, read by getActualVsProjected() for any date strictly before
 * "today" (company business date); today itself stays live.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const read = (rel) => {
    try {
      return fs.readFileSync(`${root}/${rel}`, "utf8");
    } catch {
      return null;
    }
  };

  const migration = read("db/migrations/202613180000_cash_flow_projection_snapshots.sql");
  if (migration === null) {
    failures.push("migration 202613180000_cash_flow_projection_snapshots.sql missing");
  } else {
    for (const needle of [
      "CREATE TABLE IF NOT EXISTS forecast.cash_flow_projection_snapshots",
      "FORCE ROW LEVEL SECURITY",
      "identity.is_lucia_bypass()",
      "UNIQUE (operating_company_id, prediction_date)",
      "REVOKE UPDATE, DELETE ON forecast.cash_flow_projection_snapshots FROM ih35_app",
    ]) {
      if (!migration.includes(needle)) failures.push(`migration missing "${needle}"`);
    }
  }

  const cron = read("apps/backend/src/cron/cash-flow-projection-snapshot.cron.ts");
  if (cron === null) {
    failures.push("apps/backend/src/cron/cash-flow-projection-snapshot.cron.ts missing");
  } else {
    for (const needle of [
      "export function initializeCashFlowProjectionSnapshotCron",
      "export async function runCashFlowProjectionSnapshotCronTick",
      "ON CONFLICT (operating_company_id, prediction_date) DO NOTHING",
      "companyBusinessDate()",
    ]) {
      if (!cron.includes(needle)) failures.push(`cron file missing "${needle}"`);
    }
  }

  const index = read("apps/backend/src/index.ts");
  if (index === null) {
    failures.push("apps/backend/src/index.ts missing");
  } else {
    if (!index.includes("initializeCashFlowProjectionSnapshotCron(app)")) {
      failures.push("index.ts does not call initializeCashFlowProjectionSnapshotCron(app)");
    }
  }

  const service = read("apps/backend/src/cash-flow/cash-flow.service.ts");
  if (service === null) {
    failures.push("apps/backend/src/cash-flow/cash-flow.service.ts missing");
  } else {
    if (!service.includes("FROM forecast.cash_flow_projection_snapshots")) {
      failures.push("getActualVsProjected does not read forecast.cash_flow_projection_snapshots");
    }
    if (!/if\s*\(from\s*<\s*today\)/.test(service)) {
      failures.push("snapshot read must be gated on from < today (today stays live)");
    }
    // Order: the snapshot override must run BEFORE the map is consumed to build accuracy_summary —
    // approximated here by requiring it appears after projIncomeMap is first populated and before
    // the actIncomeMap declaration (the next map built in the function).
    const projIdx = service.indexOf("for (const r of projIncomeRows.rows) projIncomeMap.set");
    const snapshotIdx = service.indexOf("FROM forecast.cash_flow_projection_snapshots");
    const actMapIdx = service.indexOf("const actIncomeMap = new Map");
    if (projIdx < 0 || snapshotIdx < 0 || actMapIdx < 0 || !(projIdx < snapshotIdx && snapshotIdx < actMapIdx)) {
      failures.push("snapshot override must run after projIncomeMap is built and before actIncomeMap is declared");
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-cash-flow-projection-snapshot-");
  const files = {
    "db/migrations/202613180000_cash_flow_projection_snapshots.sql":
      "CREATE TABLE IF NOT EXISTS forecast.cash_flow_projection_snapshots (x)\nFORCE ROW LEVEL SECURITY\nidentity.is_lucia_bypass()\nUNIQUE (operating_company_id, prediction_date)\nREVOKE UPDATE, DELETE ON forecast.cash_flow_projection_snapshots FROM ih35_app\n",
    "apps/backend/src/cron/cash-flow-projection-snapshot.cron.ts":
      "export function initializeCashFlowProjectionSnapshotCron(app) {}\nexport async function runCashFlowProjectionSnapshotCronTick() {}\nON CONFLICT (operating_company_id, prediction_date) DO NOTHING\ncompanyBusinessDate()\n",
    "apps/backend/src/index.ts": "initializeCashFlowProjectionSnapshotCron(app);\n",
    "apps/backend/src/cash-flow/cash-flow.service.ts":
      "for (const r of projIncomeRows.rows) projIncomeMap.set(r.delivery_date, r.projected_income_cents);\n" +
      "if (from < today) {\n  FROM forecast.cash_flow_projection_snapshots\n}\n" +
      "const actIncomeMap = new Map();\n",
  };
  for (const [rel, content] of Object.entries(files)) {
    const full = `${tmp}/${rel}`;
    fs.mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    fs.writeFileSync(full, content);
  }
  if (run(tmp).length) throw new Error("PASS fail: " + JSON.stringify(run(tmp)));

  // Mutation 1: remove the FORCE ROW LEVEL SECURITY line from the migration.
  fs.writeFileSync(
    `${tmp}/db/migrations/202613180000_cash_flow_projection_snapshots.sql`,
    files["db/migrations/202613180000_cash_flow_projection_snapshots.sql"].replace("FORCE ROW LEVEL SECURITY\n", "")
  );
  if (!run(tmp).length) throw new Error("FAIL fail: missing FORCE RLS should have been caught");
  fs.writeFileSync(
    `${tmp}/db/migrations/202613180000_cash_flow_projection_snapshots.sql`,
    files["db/migrations/202613180000_cash_flow_projection_snapshots.sql"]
  );

  // Mutation 2: snapshot read placed AFTER actIncomeMap (order regression).
  fs.writeFileSync(
    `${tmp}/apps/backend/src/cash-flow/cash-flow.service.ts`,
    "for (const r of projIncomeRows.rows) projIncomeMap.set(r.delivery_date, r.projected_income_cents);\n" +
      "const actIncomeMap = new Map();\n" +
      "if (from < today) {\n  FROM forecast.cash_flow_projection_snapshots\n}\n"
  );
  if (!run(tmp).length) throw new Error("FAIL fail: snapshot-after-actIncomeMap ordering should have been caught");
  fs.writeFileSync(
    `${tmp}/apps/backend/src/cash-flow/cash-flow.service.ts`,
    files["apps/backend/src/cash-flow/cash-flow.service.ts"]
  );

  // Mutation 3: cron missing the ON CONFLICT DO NOTHING (would overwrite a frozen snapshot).
  fs.writeFileSync(
    `${tmp}/apps/backend/src/cron/cash-flow-projection-snapshot.cron.ts`,
    files["apps/backend/src/cron/cash-flow-projection-snapshot.cron.ts"].replace(
      "ON CONFLICT (operating_company_id, prediction_date) DO NOTHING\n",
      ""
    )
  );
  if (!run(tmp).length) throw new Error("FAIL fail: missing ON CONFLICT DO NOTHING should have been caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-cash-flow-projection-snapshot-wired --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("verify-cash-flow-projection-snapshot-wired — OK");
}
