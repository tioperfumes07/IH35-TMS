// ACCT-F16 — Receive Payment list+detail bank reverse EntityLink (Law §9).
import { run } from "../verify-customer-payment-bank-reverse-links.mjs";
export default {
  name: "customer-payment-bank-reverse-links",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error("customer-payment-bank-reverse-links FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
    }
  },
};
