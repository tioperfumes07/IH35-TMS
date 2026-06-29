import fs from "node:fs";
import path from "node:path";

// Entity-RLS regression lock: dispatch.intransit_issues carries operating_company_id + the
// company-isolation policy intransit_issues_company_scope (202606271600). RLS must be ENABLED and
// FORCED for that policy to actually isolate entities — GUARD found it dormant (relrowsecurity=false)
// on prod, leaking across TRK/TRANSP/USMCA. This guard fails if a migration does not ENABLE+FORCE
// RLS on the table, so it can never silently regress to a dormant policy again.
export default {
  name: "verify-intransit-issues-rls-forced",
  run: async () => {
    const dir = path.resolve("db/migrations");
    const corpus = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .join("\n");

    const hasEnable = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?dispatch\.intransit_issues\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(corpus);
    const hasForce = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?dispatch\.intransit_issues\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(corpus);

    const fails = [];
    if (!hasEnable) fails.push("no migration ENABLEs RLS on dispatch.intransit_issues — the company-isolation policy stays dormant (entity leak).");
    if (!hasForce) fails.push("no migration FORCEs RLS on dispatch.intransit_issues — table owner/ih35_app bypasses the policy without FORCE.");

    if (fails.length) {
      console.error("verify-intransit-issues-rls-forced FAILED:");
      for (const f of fails) console.error("  " + f);
      process.exit(1);
    }
    console.log("verify-intransit-issues-rls-forced OK — dispatch.intransit_issues RLS is ENABLEd + FORCEd.");
  },
};
