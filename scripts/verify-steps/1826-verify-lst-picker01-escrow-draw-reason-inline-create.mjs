// LST-PICKER-01 EscrowForfeitModal escrow_draw_reason (claim 1826).
import { collectProblems } from "../verify-lst-picker01-escrow-draw-reason-inline-create.mjs";
export default {
  name: "lst-picker01-escrow-draw-reason-inline-create",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "lst-picker01-escrow-draw-reason-inline-create FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
