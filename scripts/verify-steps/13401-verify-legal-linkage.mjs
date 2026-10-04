export default {
  name: "verify:legal-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-linkage.mjs"]);
  },
};
