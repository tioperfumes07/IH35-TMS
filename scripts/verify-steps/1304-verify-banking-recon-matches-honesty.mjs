import { run } from "../verify-banking-recon-matches-honesty.mjs";
export default {
  name: "banking-recon-matches-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
