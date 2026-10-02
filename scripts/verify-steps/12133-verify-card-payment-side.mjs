// ROUND 326 queue item 13 (G-07) — the card payment side: a line categorized to another bank account's ledger (2510)
// is a transfer through the existing transfer engine. Import-safe (no DB).
import { run } from "../verify-card-payment-side.mjs";

export default {
  name: "card-payment-side",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("card-payment-side FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
