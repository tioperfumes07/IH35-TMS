import { collectProblems } from "../verify-user-detail-related-customer-search.mjs";
export default {
  name: "user-detail-related-customer-search",
  run: async () => {
    const problems = collectProblems();
    if (problems.length) throw new Error(problems.join("\n"));
  },
};
