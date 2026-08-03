import { collectProblems } from "../verify-settlement-dispute-driver-picker.mjs";
export default {
  name: "settlement-dispute-driver-picker",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) throw new Error(problems.join("\n"));
  },
};
