export default {
  name: "verify:maintenance-posting-uses-resolver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-posting-uses-resolver.mjs"]);
  },
};
