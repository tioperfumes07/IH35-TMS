// 0441-mod6 wired into verify:pre-commit — accident_reports status/updated_at + no silent status swallow.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertGuard } from "../verify-accident-edit-status-columns.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export default {
  name: "verify-accident-edit-status-columns",
  run: async () => {
    const migration = fs.readFileSync(
      path.join(ROOT, "db/migrations/202607580000_accident_reports_status_updated_at.sql"),
      "utf8"
    );
    const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/safety/safety.routes.ts"), "utf8");
    const errs = assertGuard({ migration, routes });
    if (errs.length) {
      throw new Error("verify-accident-edit-status-columns FAIL:\n  ✗ " + errs.join("\n  ✗ "));
    }
  },
};
