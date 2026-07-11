// P1-BILL-GL regression guard wired into verify:pre-commit. Fails if createBill() stops auto-posting the
// bill GL (gated by BILL_GL_POSTING_ENABLED). Import-safe.
import { run } from "../verify-bill-create-posts-gl.mjs";

export default {
  name: "bill-create-posts-gl",
  run: async () => {
    const failures = run();
    if (failures.length) {
      throw new Error("bill-create-posts-gl FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    }
  },
};
