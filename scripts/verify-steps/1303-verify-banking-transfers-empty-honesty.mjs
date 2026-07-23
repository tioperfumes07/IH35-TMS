import { run } from "../verify-banking-transfers-empty-honesty.mjs";
export default {
  name: "banking-transfers-empty-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
