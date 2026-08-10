export default {
  name: "verify:usmca-fleet-fuel-tasks-neon-pv",
  run(ctx) {
    ctx.run("node", ["scripts/verify-usmca-fleet-fuel-tasks-neon-pv.mjs"]);
  },
};
