export default {
  name: "verify:no-bare-health-references",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-bare-health-references.mjs"]);
  },
};
