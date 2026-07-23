import { run } from "../verify-banking-match-entitylink-kinds.mjs";
export default {
  name: "banking-match-entitylink-kinds",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
