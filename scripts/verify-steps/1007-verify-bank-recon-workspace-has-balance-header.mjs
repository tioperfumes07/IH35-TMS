// bnk-03 — ReconciliationWorkspace + BankReconciliationPage must show Beginning/Ending/Last reconciled.
import { run } from "../verify-bank-recon-workspace-has-balance-header.mjs";
export default {
  name: "bank-recon-workspace-has-balance-header",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error("bank-recon-workspace-has-balance-header FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
    }
  },
};
