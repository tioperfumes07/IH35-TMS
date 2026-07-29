// BANK-F02 — Record Transfer reachable from Banking Home + Transfers (not Transactions-only).
import { run } from "../verify-bank-record-transfer-trigger-wired.mjs";
export default {
  name: "bank-record-transfer-trigger-wired",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error("bank-record-transfer-trigger-wired FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
    }
  },
};
