// Banking Full Audit 1–2/M: Cash GL setup reachability + sidebar flyout ↔ BANKING_MODULE_TABS.
import { run } from "../verify-banking-cash-gl-sidebar-nav.mjs";

export default {
  name: "banking-cash-gl-sidebar-nav",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("banking-cash-gl-sidebar-nav FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
