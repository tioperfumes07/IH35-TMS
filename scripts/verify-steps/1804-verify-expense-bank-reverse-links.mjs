// ACCT-F17 — Expense → bank reverse EntityLink (claim 1804).
import { run } from "../verify-expense-bank-reverse-links.mjs";
export default {
  name: "expense-bank-reverse-links",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error("expense-bank-reverse-links FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
    }
  },
};
