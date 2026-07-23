import { run } from "../verify-banking-settings-honesty.mjs";
export default {
  name: "banking-settings-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
