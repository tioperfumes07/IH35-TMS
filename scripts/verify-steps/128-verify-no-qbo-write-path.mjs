// QBO-WRITE-KILL — reconcile-only architecture lock. Fails the build if any backend source can create
// or update a QuickBooks object (an outbound POST/PATCH to a QBO entity endpoint / a re-introduced push
// service). Runs inside verify:pre-commit, which ci/build-typecheck executes on every PR.
//
// ACCT-F4431380 (Lead 443.137 item 9e) — the INBOUND half of the same lock now runs in this step too.
//   OLD: this step only proved nothing writes TO QuickBooks.
//   NEW: it also runs verify-qbo-paths-never-write-native-tables (+ its --selftest): no QBO puller /
//        reconciler / bootstrap writes a native money or master table FROM QuickBooks.
//   WHY: QuickBooks is a read-only archive in both directions; one architecture lock, one registered step
//        (no new step number needed for a rule that is the inverse half of this one).
import { run } from "../verify-no-qbo-write-path.mjs";
import { run as runNativeTables } from "../verify-qbo-paths-never-write-native-tables.mjs";

export default {
  name: "no-qbo-write-path",
  run: async (ctx) => {
    const offenders = run();
    if (offenders.length) {
      throw new Error(
        "no-qbo-write-path FAIL — TMS is reconcile-only and must NEVER write to QuickBooks:\n  " +
          offenders.map((o) => "✗ " + o).join("\n  ")
      );
    }
    const nativeOffenders = runNativeTables();
    if (nativeOffenders.length) {
      throw new Error(
        "qbo-paths-never-write-native-tables FAIL — QuickBooks is a read-only archive; a QBO path writes a native table:\n  " +
          nativeOffenders.map((o) => "✗ " + o).join("\n  ")
      );
    }
    // The selftest proves the scan can still see a planted violation (an instrument that cannot fail is not a guard).
    ctx.run("node", ["scripts/verify-qbo-paths-never-write-native-tables.mjs", "--selftest"]);
  },
};
