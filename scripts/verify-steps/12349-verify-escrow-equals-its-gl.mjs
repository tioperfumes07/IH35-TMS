// Kill the second system — escrow: no backend reader of a stored escrow balance (driver_finance.v_driver_escrow_balance,
// the 2100-00-<nnn> GL balance, is the only source). Import-safe static half; the live half runs in the money gate.
import { run } from "../verify-escrow-equals-its-gl.mjs";

export default {
  name: "escrow-equals-its-gl",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("escrow-equals-its-gl FAIL:\n  " + failures.join("\n  "));
    }
  },
};
