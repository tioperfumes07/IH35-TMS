import { run } from "../verify-banking-factoring-entry-honesty.mjs";
export default {
  name: "banking-factoring-entry-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
