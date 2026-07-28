import { run } from "../verify-coa-role-check-held-superset.mjs";
export default {
  name: "coa-role-check-held-superset",
  run: async () => {
    const f = run();
    if (f.length) {
      throw new Error(
        "coa-role-check-held-superset FAIL:\n  " + f.map((x) => "✗ " + x).join("\n  "),
      );
    }
  },
};
