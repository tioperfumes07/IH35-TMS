// DriverPickerWithCreate EntityPicker kind=driver (claim 2490).
import { collectProblems } from "../verify-driver-picker-with-create-entity-picker.mjs";

export default {
  name: "driver-picker-with-create-entity-picker",
  async run() {
    const problems = collectProblems();
    if (problems.length) {
      throw new Error(
        "driver-picker-with-create-entity-picker FAIL:\n  " + problems.map((p) => "✗ " + p).join("\n  "),
      );
    }
  },
};
