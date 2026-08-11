// P41 (WIRING-PLAN-50-TASKS-LOCKED.md) wired into verify:pre-commit — insurance.claim POST/PATCH
// sync safety.accident_reports.insurance_claim_id back both ways, entity-scoped.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertGuard } from "../verify-accident-claim-reverse-fk-synced.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export default {
  name: "verify-accident-claim-reverse-fk-synced",
  run: async () => {
    const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/insurance/claim.routes.ts"), "utf8");
    const errs = assertGuard({ routes });
    if (errs.length) {
      throw new Error("verify-accident-claim-reverse-fk-synced FAIL:\n  ✗ " + errs.join("\n  ✗ "));
    }
  },
};
