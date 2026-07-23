import { run } from "../verify-banking-aging-fees-honesty.mjs";
export default {
  name: "banking-aging-fees-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
