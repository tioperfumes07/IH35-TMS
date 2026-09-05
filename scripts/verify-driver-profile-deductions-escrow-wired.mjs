#!/usr/bin/env node
/**
 * verify-driver-profile-deductions-escrow-wired — ACCT-ESCROW-VIEW-DRIVER-PROFILE (owner order,
 * CC-1 item 3): "Driver Profile > Deductions: list BY DRIVER + add the Escrow view (per-driver
 * escrow balance)."
 *
 * WHAT IT ASSERTS, statically:
 *   - DriverProfilePage.tsx renders both DriverDeductionsReverseSection and
 *     DriverEscrowReverseSection (the feature must actually be ON the page, not just exist as an
 *     unused component)
 *   - the escrow backend route (GET /api/v1/driver-finance/drivers/:id/escrow) reads
 *     accounting.escrow_accounts, NEVER driver_finance.escrow_balances — that table is confirmed
 *     STALE live (still reads the pre-GO-19-02 $250/$250/$0.01 balances for the exact 3 drivers
 *     that ruling zeroed on accounting.escrow_accounts) and feeds LIVE settlement math elsewhere
 *     (settlement-payrun-close.service.ts, settlement-engine.ts) via
 *     readDriverEscrowBalanceCents() — a real, separate, filed-not-fixed defect
 *     (ACCT-ESCROW-BALANCES-STALE-VS-GO19). This guard exists so nobody "fixes" the Driver Profile
 *     Escrow view later by innocently switching it to that function/table without knowing why it
 *     was deliberately avoided here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-profile-deductions-escrow-wired";

const PROFILE_PAGE = path.join(ROOT, "apps", "frontend", "src", "pages", "drivers", "DriverProfilePage.tsx");
const ROUTES_FILE = path.join(ROOT, "apps", "backend", "src", "driver-finance", "deductions.routes.ts");

export function check(paths = { profilePage: PROFILE_PAGE, routesFile: ROUTES_FILE }) {
  const { profilePage = PROFILE_PAGE, routesFile = ROUTES_FILE } = paths;
  const offenders = [];

  if (!fs.existsSync(profilePage)) {
    offenders.push(`missing: ${path.relative(ROOT, profilePage)}`);
  } else {
    const src = fs.readFileSync(profilePage, "utf8");
    if (!/<DriverDeductionsReverseSection/.test(src)) offenders.push("DriverProfilePage.tsx does not render DriverDeductionsReverseSection");
    if (!/<DriverEscrowReverseSection/.test(src)) offenders.push("DriverProfilePage.tsx does not render DriverEscrowReverseSection");
  }

  if (!fs.existsSync(routesFile)) {
    offenders.push(`missing: ${path.relative(ROOT, routesFile)}`);
  } else {
    const src = fs.readFileSync(routesFile, "utf8");
    const m = src.match(/"\/api\/v1\/driver-finance\/drivers\/:id\/escrow"[\s\S]*?\n {2}\}\);/);
    const body = m ? m[0] : "";
    if (!body) {
      offenders.push('GET /api/v1/driver-finance/drivers/:id/escrow route handler not found');
    } else {
      if (!/accounting\.escrow_accounts/.test(body)) offenders.push("escrow route does not read accounting.escrow_accounts");
      if (/driver_finance\.escrow_balances/.test(body)) {
        offenders.push("escrow route reads driver_finance.escrow_balances — that table is confirmed STALE live vs the GO-19-02 ruling, never read it from this route");
      }
    }
  }

  return offenders;
}

function report(offenders) {
  if (!offenders.length) {
    console.log(`${LABEL} OK — Driver Profile renders both the deductions and escrow reverse sections, and the escrow route reads the correct (GO-19-02-corrected) table`);
    return 0;
  }
  console.error(`${LABEL} FAIL:`);
  for (const o of offenders) console.error(`  - ${o}`);
  return 1;
}

async function selftest() {
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dp-dedesc-"));
  const pageFile = path.join(tmp, "DriverProfilePage.tsx");
  const routesFileTmp = path.join(tmp, "deductions.routes.ts");
  const failures = [];

  const goodRoute =
    'app.get("/api/v1/driver-finance/drivers/:id/escrow", async (req, reply) => {\n' +
    '    await client.query("SELECT * FROM accounting.escrow_accounts");\n' +
    "  });";
  fs.writeFileSync(pageFile, "<DriverDeductionsReverseSection /><DriverEscrowReverseSection />");
  fs.writeFileSync(routesFileTmp, goodRoute);
  if (check({ profilePage: pageFile, routesFile: routesFileTmp }).length !== 0) {
    failures.push(`case1 FAIL — well-formed fixtures must be GREEN, got: ${check({ profilePage: pageFile, routesFile: routesFileTmp }).join("; ")}`);
  }

  fs.writeFileSync(pageFile, "<DriverDeductionsReverseSection />");
  if (!check({ profilePage: pageFile, routesFile: routesFileTmp }).some((o) => /DriverEscrowReverseSection/.test(o))) {
    failures.push("case2 FAIL — a page missing the escrow section must be caught.");
  }

  const badRoute =
    'app.get("/api/v1/driver-finance/drivers/:id/escrow", async (req, reply) => {\n' +
    '    await client.query("SELECT * FROM driver_finance.escrow_balances");\n' +
    "  });";
  fs.writeFileSync(pageFile, "<DriverDeductionsReverseSection /><DriverEscrowReverseSection />");
  fs.writeFileSync(routesFileTmp, badRoute);
  if (!check({ profilePage: pageFile, routesFile: routesFileTmp }).some((o) => /escrow_balances/.test(o))) {
    failures.push("case3 FAIL — a route reading the stale escrow_balances table must be caught.");
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — well-formed fixtures GREEN, missing-escrow-section caught, stale-table-read caught`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(check()));
}
