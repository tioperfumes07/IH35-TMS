import { run } from "../verify-no-nested-box.mjs";
export default {
  name: "no-nested-box",
  run: async () => {
    const r = run();
    if (!r.ok) throw new Error("no-nested-box FAIL:\n  " + r.regressions.map((x) => "✗ " + x).join("\n  "));
  },
};
