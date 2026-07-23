import { run } from "../verify-banking-plaid-connections-tab.mjs";
export default {
  name: "banking-plaid-connections-tab",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
