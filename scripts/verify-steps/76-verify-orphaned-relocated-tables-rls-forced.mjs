import fs from "node:fs";
import path from "node:path";

// Entity-RLS regression lock (CODER-29): four relocated orphaned tables carry operating_company_id +
// a company-isolation policy but were RLS-ENABLED with FORCE OFF — so the table owner / ih35_app
// bypassed the policy and the tables leaked across TRK/TRANSP/USMCA. Migration
// 202606282300_force_rls_orphaned_relocated_tables forces RLS on all four. This guard fails if any
// of them is not ENABLEd + FORCEd by some migration, so the dormant-policy class can never regress.
// (settlements.settlement_disputes is already forced elsewhere and is intentionally not listed.)
const TABLES = [
  "driver_finance.auto_deduction_policies",
  "settlements.team_split_configs",
  "maintenance.road_service_tickets",
  "mdata.maintenance_parts",
];

export default {
  name: "verify-orphaned-relocated-tables-rls-forced",
  run: async () => {
    const dir = path.resolve("db/migrations");
    const corpus = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .join("\n");

    const fails = [];
    for (const t of TABLES) {
      const esc = t.replace(/\./g, "\\.");
      const enable = new RegExp(`ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${esc}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
      const force = new RegExp(`ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${esc}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
      if (!enable.test(corpus)) fails.push(`no migration ENABLEs RLS on ${t} — its company-isolation policy stays dormant (entity leak).`);
      if (!force.test(corpus)) fails.push(`no migration FORCEs RLS on ${t} — table owner / ih35_app bypasses the policy without FORCE.`);
    }

    if (fails.length) {
      console.error("verify-orphaned-relocated-tables-rls-forced FAILED:");
      for (const f of fails) console.error("  " + f);
      process.exit(1);
    }
    console.log("verify-orphaned-relocated-tables-rls-forced OK — all 4 relocated tables have RLS ENABLEd + FORCEd.");
  },
};
