import { run } from "../verify-banking-statement-import-honesty.mjs";
export default {
  name: "banking-statement-import-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
