import { run } from "../verify-banking-faro-advance-linkage.mjs";
export default {
  name: "banking-faro-advance-linkage",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
