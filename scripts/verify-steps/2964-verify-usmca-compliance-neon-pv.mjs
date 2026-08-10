export default {
  name: "verify:usmca-compliance-neon-pv",
  run(ctx) {
    ctx.run("node", ["scripts/verify-usmca-compliance-neon-pv.mjs"]);
  },
};
