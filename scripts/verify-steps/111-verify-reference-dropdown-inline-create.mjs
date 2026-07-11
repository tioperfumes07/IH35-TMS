import { run } from "../verify-reference-dropdown-inline-create.mjs";
export default {
  name: "reference-dropdown-inline-create",
  run: async () => {
    const r = run();
    if (!r.ok) throw new Error("reference-dropdown-inline-create FAIL:\n  " + r.offenders.map((x) => "✗ " + x).join("\n  "));
  },
};
