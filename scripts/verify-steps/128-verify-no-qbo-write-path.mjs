// QBO-WRITE-KILL — reconcile-only architecture lock. Fails the build if any backend source can create
// or update a QuickBooks object (an outbound POST/PATCH to a QBO entity endpoint / a re-introduced push
// service). Runs inside verify:pre-commit, which ci/build-typecheck executes on every PR.
import { run } from "../verify-no-qbo-write-path.mjs";

export default {
  name: "no-qbo-write-path",
  run: async () => {
    const offenders = run();
    if (offenders.length) {
      throw new Error(
        "no-qbo-write-path FAIL — TMS is reconcile-only and must NEVER write to QuickBooks:\n  " +
          offenders.map((o) => "✗ " + o).join("\n  ")
      );
    }
  },
};
