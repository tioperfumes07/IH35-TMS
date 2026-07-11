import { run } from "../verify-create-forms-wired.mjs";
export default {
  name: "create-forms-wired",
  run: async () => {
    const r = run();
    if (!r.ok) throw new Error("create-forms-wired FAIL:\n  " + r.offenders.map((x) => "✗ " + x).join("\n  "));
  },
};
