import fs from "node:fs";
import path from "node:path";

// Static guard-of-the-guard: ensures scripts/db-migrate.mjs keeps the PROD-MIGRATE
// SAFETY GUARD (added 2026-06-28 after .env's prod DATABASE_DIRECT_URL silently
// overrode an inline local DATABASE_URL and db:migrate connected to PROD). If this
// protection is ever removed, CI fails.
export default {
  name: "verify-db-migrate-prod-guard",
  run: async () => {
    const f = path.resolve("scripts/db-migrate.mjs");
    const src = fs.readFileSync(f, "utf8");
    const required = [
      "TARGET_IS_PROD",
      "ALLOW_PROD_MIGRATE",
      "PROD_HOST_MARKERS",
      "REFUSED",
    ];
    const missing = required.filter((tok) => !src.includes(tok));
    if (missing.length) {
      console.error(
        "verify-db-migrate-prod-guard FAILED: scripts/db-migrate.mjs is missing the prod-migrate safety guard token(s): " +
          missing.join(", ")
      );
      process.exit(1);
    }
    // The refusal must fire BEFORE the pg client connects.
    const refuseIdx = src.indexOf("REFUSED");
    const connectIdx = src.indexOf(".connect(");
    if (connectIdx !== -1 && refuseIdx !== -1 && refuseIdx > connectIdx) {
      console.error(
        "verify-db-migrate-prod-guard FAILED: the prod refusal must come BEFORE the DB connect()."
      );
      process.exit(1);
    }
    console.log("verify-db-migrate-prod-guard OK — prod-migrate refusal guard present and pre-connect.");
  },
};
