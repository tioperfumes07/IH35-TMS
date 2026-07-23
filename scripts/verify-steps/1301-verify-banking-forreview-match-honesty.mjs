import { run } from "../verify-banking-forreview-match-honesty.mjs";
export default {
  name: "banking-forreview-match-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
