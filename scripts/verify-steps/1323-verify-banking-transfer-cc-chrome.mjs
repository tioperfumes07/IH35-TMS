import { run } from "../verify-banking-transfer-cc-chrome.mjs";
export default {
  name: "banking-transfer-cc-chrome",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
