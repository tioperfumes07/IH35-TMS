import { run } from "../verify-list-error-state-coverage.mjs";
export default {
  name: "list-error-state-coverage",
  run: async () => {
    const r = run();
    if (!r.ok) throw new Error("list-error-state-coverage FAIL:\n  " + r.offenders.map((x) => "✗ " + x).join("\n  "));
  },
};
