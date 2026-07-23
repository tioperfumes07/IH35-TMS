import { run } from "../verify-banking-reports-honesty.mjs";
export default {
  name: "banking-reports-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
