// BANK-F02 — account detail + Record Transfer opens TransferModal with from_account_id prefill.
import { run } from "../verify-bank-account-detail-record-transfer.mjs";
export default {
  name: "bank-account-detail-record-transfer",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error("bank-account-detail-record-transfer FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
    }
  },
};
