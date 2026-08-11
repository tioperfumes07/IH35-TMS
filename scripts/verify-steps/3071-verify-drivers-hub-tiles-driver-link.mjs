// P40 (WIRING-PLAN-50-TASKS-LOCKED.md) wired into verify:pre-commit — Drivers page hub tiles
// (Debt Alert, Active Drivers · Samsara) link driver names to canonical /drivers/:id.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertGuard } from "../verify-drivers-hub-tiles-driver-link.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export default {
  name: "verify-drivers-hub-tiles-driver-link",
  run: async () => {
    const dispatchApi = fs.readFileSync(path.join(ROOT, "apps/frontend/src/api/dispatch.ts"), "utf8");
    const driversPage = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/Drivers.tsx"), "utf8");
    const errs = assertGuard({ dispatchApi, driversPage });
    if (errs.length) {
      throw new Error("verify-drivers-hub-tiles-driver-link FAIL:\n  ✗ " + errs.join("\n  ✗ "));
    }
  },
};
