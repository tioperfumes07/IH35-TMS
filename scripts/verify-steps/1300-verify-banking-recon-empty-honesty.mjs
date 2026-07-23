import { run } from "../verify-banking-recon-empty-honesty.mjs";
export default {
  name: "banking-recon-empty-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
