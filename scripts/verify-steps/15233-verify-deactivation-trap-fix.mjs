export default {
  name: "verify:deactivation-trap-fix",
  run(ctx) {
    ctx.run("node", ["scripts/verify-deactivation-trap-fix.mjs"]);
  },
};
