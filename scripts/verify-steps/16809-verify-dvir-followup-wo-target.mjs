export default {
  name: "verify:dvir-followup-wo-target",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dvir-followup-wo-target.mjs"]);
  },
};
