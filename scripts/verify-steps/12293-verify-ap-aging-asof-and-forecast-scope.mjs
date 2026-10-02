// CC-3 handoff — A/P aging as-of excludes voided bills; cash forecast names its company. Import-safe (no DB).
import { run } from "../verify-ap-aging-asof-and-forecast-scope.mjs";

export default {
  name: "ap-aging-asof-and-forecast-scope",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("ap-aging-asof-and-forecast-scope FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
