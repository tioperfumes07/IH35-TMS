// Lead ROUND 332 item 3 — a load's 'invoiced' status follows its invoice, enforced in the database. Import-safe (no DB).
import { run } from "../verify-load-invoiced-follows-invoice.mjs";

export default {
  name: "load-invoiced-follows-invoice",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("load-invoiced-follows-invoice FAIL:\n  " + failures.join("\n  "));
    }
  },
};
