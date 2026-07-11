import { run } from "../verify-dead-forms-unmounted.mjs";
export default {
  name: "dead-forms-unmounted",
  run: async () => {
    const r = run();
    if (!r.ok) throw new Error("dead-forms-unmounted FAIL:\n  " + r.offenders.map((x) => "✗ " + x).join("\n  "));
  },
};
