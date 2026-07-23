import { run } from "../verify-banking-by-linkage-reverse.mjs";
export default {
  name: "banking-by-linkage-reverse",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
