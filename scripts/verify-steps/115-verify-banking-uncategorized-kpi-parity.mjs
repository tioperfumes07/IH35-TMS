import { run } from "../verify-banking-uncategorized-kpi-parity.mjs";
export default {
  name: "banking-uncategorized-kpi-parity",
  run: async () => {
    const f = run();
    if (f.length) throw new Error("banking-uncategorized-kpi-parity FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "));
  },
};
