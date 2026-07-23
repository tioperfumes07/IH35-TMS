import { run } from "../verify-banking-arch-design-tabs.mjs";
export default {
  name: "banking-arch-design-tabs",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("banking-arch-design-tabs FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
