import { run } from "../verify-banking-escrow-empty-honesty.mjs";
export default {
  name: "banking-escrow-empty-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
