import { run } from "../verify-banking-escrow-settlement-linkage.mjs";
export default {
  name: "banking-escrow-settlement-linkage",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
