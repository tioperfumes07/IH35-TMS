import { run } from "../verify-no-raw-date-input.mjs";
export default {
  name: "no-raw-date-input",
  run: async () => {
    const r = run();
    if (!r.ok) throw new Error("no-raw-date-input FAIL:\n  " + r.offenders.map((x) => "✗ " + x).join("\n  "));
  },
};
