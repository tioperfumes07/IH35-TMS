export default {
  name: "verify:factoring-one-scope-policy",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-one-scope-policy.mjs"]);
  },
};
