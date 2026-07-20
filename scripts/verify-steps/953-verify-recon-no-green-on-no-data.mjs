// D-#1 RECON-COLLECTOR. Fails when the collector's zero-connection branch can report SUCCESS — the
// 47-day silent-green defect. Import-safe; throws so the suite goes red.
import { run } from "../verify-recon-no-green-on-no-data.mjs";

export default {
  name: "recon-no-green-on-no-data",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("recon-no-green-on-no-data FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
