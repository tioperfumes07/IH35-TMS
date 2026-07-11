// P1-BILLPAY-GL regression guard wired into verify:pre-commit. Fails if payBill() stops posting the
// atomic gated bill_payment JE (bank could then decrement with no offsetting JE). Import-safe.
import { run } from "../verify-bill-payment-posts-gl.mjs";

export default {
  name: "bill-payment-posts-gl",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("bill-payment-posts-gl FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
