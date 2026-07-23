import { run } from "../verify-banking-categorization-links-panel.mjs";
export default {
  name: "banking-categorization-links-panel",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
