import { run } from "../verify-banking-transfer-je-reverse.mjs";
export default {
  name: "banking-transfer-je-reverse",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
