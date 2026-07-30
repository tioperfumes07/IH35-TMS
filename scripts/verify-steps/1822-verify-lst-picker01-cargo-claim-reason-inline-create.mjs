// LST-PICKER-01 CargoClaimIntakeSurface cargo_claim_reason (claim 1822).
import { collectProblems } from "../verify-lst-picker01-cargo-claim-reason-inline-create.mjs";
export default {
  name: "lst-picker01-cargo-claim-reason-inline-create",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-cargo-claim-reason-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
