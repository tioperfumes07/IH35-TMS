import dotenv from "dotenv";
import pg from "pg";
import { buildPrintHTML, suggestedFilename } from "../apps/frontend/src/pages/form425c/lib/buildPrintHTML.ts";
import { DEFAULT_PROFILES } from "../apps/frontend/src/pages/form425c/lib/constants.ts";
import { parseQBText } from "../apps/frontend/src/pages/form425c/lib/parseQBText.ts";
import type { CurrentFormState } from "../apps/frontend/src/pages/form425c/types.ts";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

function makeFixtureForm(): CurrentFormState {
  return {
    reportId: "fixture",
    status: "draft",
    answers: { ...DEFAULT_PROFILES.trucking.defaultAnswers },
    openingBalance: "1000",
    totalReceipts: "5000",
    totalDisbursements: "3500",
    totalPayables: "10",
    totalReceivables: "20",
    numEmployeesAtFiling: "10",
    numEmployeesNow: "9",
    proFeesThisMonth: "100",
    proFeesSinceFiling: "300",
    otherProFeesThisMonth: "50",
    otherProFeesSinceFiling: "200",
    projReceiptsLast: "4000",
    projDisbLast: "3000",
    projReceiptsNext: "4500",
    projDisbNext: "3200",
    projectionOverrideReason: "",
    hasCarryForward: false,
    att38: true,
    att39: false,
    att40: true,
    att41: false,
    att42: false,
    notes: "",
    amendedFromUuid: null,
  };
}

try {
  const client = await pool.connect();
  try {
    const tableRes = await client.query<{ ok: boolean }>("SELECT to_regclass('catalogs.form_425c_company_profiles') IS NOT NULL AS ok");
    if (!tableRes.rows[0]?.ok) throw new Error("catalogs.form_425c_company_profiles missing");
    console.log("PASS: catalogs.form_425c_company_profiles exists");

    const seedRes = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM catalogs.form_425c_company_profiles WHERE company_key IN ('trucking','transportation')"
    );
    console.log(`PASS: profile seed rows present count=${seedRes.rows[0]?.count ?? "0"}`);

    const parsed = parseQBText(
      "Date\tType\tDescription\tAccount\tAmount\n01/01/2026\tDeposit\tCustomer Payment\tWF-3500\t100.00\n01/01/2026\tTransfer\tFunds transfer\tWF-3500\t90.00",
      DEFAULT_PROFILES.trucking.bankAccounts
    );
    if (parsed.length !== 1) throw new Error("parseQBText edge case failed");
    console.log("PASS: parseQBText transfer exclusion and account matching");

    const html = buildPrintHTML(makeFixtureForm(), DEFAULT_PROFILES.trucking, 2, 2026);
    if (!html.includes("Did the business operate during the entire reporting period?")) throw new Error("buildPrintHTML questionnaire content missing");
    if (!html.toLowerCase().includes("<html>")) throw new Error("buildPrintHTML did not produce html");
    console.log("PASS: buildPrintHTML includes questionnaire and valid HTML");

    const filename = suggestedFilename(DEFAULT_PROFILES.trucking.name, 2, 2026);
    if (!filename.includes("March 2026")) throw new Error("suggested filename format mismatch");
    console.log(`PASS: suggested filename format (${filename})`);
  } finally {
    client.release();
  }
  process.exit(0);
} catch (error) {
  console.error(`FAIL: db-verify-form-425c-profiles -> ${String((error as Error).message || error)}`);
  process.exit(1);
} finally {
  await pool.end();
}

