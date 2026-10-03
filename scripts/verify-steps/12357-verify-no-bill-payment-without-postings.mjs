// ROUND 363-CC1-B: every bill-payment inserter posts the payment on its own transaction (never after commit).
// Import-safe static half; the live half (unposted cash bill payments may only shrink from the committed baseline)
// runs in the money gate.
import { run } from "../verify-no-bill-payment-without-postings.mjs";

export default {
  name: "no-bill-payment-without-postings",
  run: async () => {
    const { failures } = run();
    if (failures.length) {
      throw new Error("no-bill-payment-without-postings FAIL:\n  " + failures.join("\n  "));
    }
  },
};
