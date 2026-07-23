import { run } from "../verify-banking-settings-tab.mjs";
export default {
  name: "banking-settings-tab",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error("banking-settings-tab FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
  },
};
