// BANK-LINK-01 — bank register EntityLinks bill/payment/bill_payment/transfer matches.
import { run } from "../verify-bank-link01-money-entitylinks.mjs";
export default {
  name: "bank-link01-money-entitylinks",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error("bank-link01-money-entitylinks FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
    }
  },
};
