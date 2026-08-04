// EditVehicleModal assigned_driver_id EntityPicker (CLS-RAW-UUID-INPUT fleet · claim 2304).
import { collectProblems } from "../verify-fleet-edit-vehicle-assigned-driver-picker.mjs";

export default {
  name: "verify-fleet-edit-vehicle-assigned-driver-picker",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-edit-vehicle-assigned-driver-picker.mjs", "--selftest"]);
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "verify-fleet-edit-vehicle-assigned-driver-picker FAIL:\n  " +
          problems.map((p) => "✗ " + p).join("\n  ")
      );
    }
  },
};
