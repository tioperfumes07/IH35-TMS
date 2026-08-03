import { collectProblems } from "../verify-policy-create-modal-unit-search.mjs";
export default {
  name: "policy-create-modal-unit-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) throw new Error(problems.join("\n"));
  },
};
