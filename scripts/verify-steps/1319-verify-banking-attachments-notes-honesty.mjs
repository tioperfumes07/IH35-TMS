import { run } from "../verify-banking-attachments-notes-honesty.mjs";
export default {
  name: "banking-attachments-notes-honesty",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
