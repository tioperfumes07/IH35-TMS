export default {
  name: "verify:factoring-posting-uses-resolver-and-roles",
  run(ctx) {
    // Real guard is scripts/verify-factoring-posting-uses-resolver-and-roles.mjs
    // (scripts/verify-guards/046-*.mjs is a thin pointer only).
    ctx.run("node", ["scripts/verify-factoring-posting-uses-resolver-and-roles.mjs"]);
  },
};
