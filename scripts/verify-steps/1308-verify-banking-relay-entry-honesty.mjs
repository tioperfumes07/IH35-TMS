import { run } from "../verify-banking-relay-entry-honesty.mjs";
export default {
  name: "banking-relay-entry-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
