import { run } from "../verify-alerts-routes-membership.mjs";
export default {
  name: "alerts-routes-membership",
  run: async () => {
    const r = run();
    if (!r.ok) throw new Error("alerts-routes-membership FAIL:\n  " + r.offenders.map((x) => "✗ " + x).join("\n  "));
  },
};
