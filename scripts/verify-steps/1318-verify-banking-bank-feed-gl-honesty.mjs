import { run } from "../verify-banking-bank-feed-gl-honesty.mjs";
export default {
  name: "banking-bank-feed-gl-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
