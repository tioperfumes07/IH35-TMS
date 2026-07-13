import { runGuard } from "../verify-local-ci-parity.mjs";
export default {
  name: "verify-local-ci-parity",
  run: () => {
    const r = runGuard();
    if (!r.ok) throw new Error("verify-local-ci-parity FAIL:\n  " + r.errs.map((e) => "✗ " + e).join("\n  "));
  },
};
