import { run } from "../verify-banking-statement-import-tab.mjs";
export default {
  name: "banking-statement-import-tab",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
