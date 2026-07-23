import { run } from "../verify-banking-match-drawer-create.mjs";
export default {
  name: "banking-match-drawer-create",
  run: async () => {
    const failures = run();
    if (failures.length) throw new Error(failures.join("\n"));
  },
};
