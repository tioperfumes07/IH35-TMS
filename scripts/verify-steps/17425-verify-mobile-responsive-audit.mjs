export default {
  name: "verify:mobile-responsive-audit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-mobile-responsive-audit.mjs"]);
  },
};
