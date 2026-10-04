export default {
  name: "verify:credit-memos-filter-badge-uses-roster",
  run(ctx) {
    ctx.run("node", ["scripts/verify-credit-memos-filter-badge-uses-roster.mjs"]);
  },
};
