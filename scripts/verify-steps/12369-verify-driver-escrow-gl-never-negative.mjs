// ROUND 374: a debit may not take a driver escrow sub-account's GL balance below zero — refused at COMMIT by
// migration 202615360300. Import-safe static half: the refusal migration and its live guard stay wired (the live half,
// negatives shrink-only + the trigger is live and deferred, runs in the money gate).
import { existsSync, readFileSync } from "node:fs";

export default {
  name: "driver-escrow-gl-never-negative",
  run: async () => {
    const mig = "db/migrations/202615360300_driver_escrow_gl_never_negative.sql";
    const failures = [];
    if (!existsSync(mig)) failures.push(`${mig} is missing — the over-release refusal must live in the database`);
    else if (!/CREATE CONSTRAINT TRIGGER trg_driver_escrow_gl_never_negative[\s\S]*DEFERRABLE INITIALLY DEFERRED/.test(readFileSync(mig, "utf8"))) {
      failures.push(`${mig} no longer creates trg_driver_escrow_gl_never_negative as a deferred constraint trigger`);
    }
    if (!readFileSync("scripts/money-pr-local-gate.mjs", "utf8").includes('"verify-driver-escrow-gl-never-negative"')) {
      failures.push("verify-driver-escrow-gl-never-negative is not wired into money-pr-local-gate");
    }
    if (failures.length) throw new Error("driver-escrow-gl-never-negative FAIL:\n  " + failures.join("\n  "));
  },
};
