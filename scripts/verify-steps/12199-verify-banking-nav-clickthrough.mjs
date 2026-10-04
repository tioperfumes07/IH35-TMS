export default {
  name: "verify:banking-nav-clickthrough",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-nav-clickthrough.mjs"]);
  },
};
