import { collectProblems } from "../verify-safety-dot-inspection-unit-entitypicker.mjs";

export default {
  name: "safety-dot-inspection-unit-entitypicker",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-safety-dot-inspection-unit-entitypicker.mjs"]);
  },
};
