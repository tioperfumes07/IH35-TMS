import { run } from "../verify-banking-cash-gl-unbound-honesty.mjs";
export default {
  name: "banking-cash-gl-unbound-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
