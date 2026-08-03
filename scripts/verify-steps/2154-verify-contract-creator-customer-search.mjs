import { collectProblems } from "../verify-contract-creator-customer-search.mjs";
export default {
  name: "contract-creator-customer-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) throw new Error(problems.join("\n"));
  },
};
